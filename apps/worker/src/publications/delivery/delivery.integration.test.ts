import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { ulid } from 'ulid';
import { Hono } from 'hono';
import type { Bindings, Env } from '../../types';
import { fanoutPendingPublications } from './fanout';
import { processDailyDigests } from './digests';
import { listActivity, markActivityRead } from './activity';
import { registerInstallation, revokeInstallation, setDeliveryPreferences } from './installations';
import { enqueuePushJobs, processPushJobs } from './outbox';
import { cleanupPublicationDelivery } from './cleanup';
import { saveIssueSelection, discoveryReferences } from '../attribution';
import { issueVisit } from '../visits';
import { deletePublicationOwner } from '../cleanup';
import { subscription } from '../subscriptions';
import routes from '../../routes/api-v1/publication-delivery';
vi.mock('googleapis', () => ({ google: {} }));
vi.mock('../../lib/auth', () => ({
  verifyClerkToken: vi.fn(async (token: string) => ({
    success: true,
    userId: token,
    payload: { sub: token },
  })),
}));
const bindings = env as unknown as Bindings & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};
const db = bindings.DB;
const now = Date.UTC(2026, 9, 8, 9, 1),
  prior = now - 86400_000;
let p: string, i: string, s: string, section: string;
const app = new Hono<Env>();
app.use('*', async (c, next) => {
  c.set('requestId', 'request');
  c.set('traceId', 'trace');
  await next();
});
app.route('/api/v1', routes);
async function row<T = Record<string, unknown>>(sql: string, ...values: unknown[]) {
  return db
    .prepare(sql)
    .bind(...values)
    .first<T>();
}
async function run(sql: string, ...values: unknown[]) {
  return db
    .prepare(sql)
    .bind(...values)
    .run();
}
async function event(kind = 'ISSUE_PUBLISHED', issue = i, selections = [s], at = prior + 60_000) {
  const id = ulid(at);
  await run(
    'INSERT INTO personal_publication_events(id,publication_id,issue_id,revision,kind,selection_ids_json,occurred_at) VALUES(?,?,?,?,?,?,?)',
    id,
    p,
    issue,
    Math.floor(Math.random() * 1_000_000) + 10,
    kind,
    JSON.stringify(selections),
    at
  );
  await run(
    'INSERT INTO personal_publication_outbox(event_id,next_attempt_at) VALUES(?,?)',
    id,
    at
  );
  return id;
}
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  actor: string | null = 'reader',
  key = ulid()
) {
  return app.request(
    `/api/v1${path}`,
    {
      method,
      headers: {
        ...(actor ? { Authorization: `Bearer ${actor}` } : {}),
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    bindings
  );
}
beforeEach(async () => {
  await applyD1Migrations(db, bindings.TEST_MIGRATIONS);
  for (const user of ['owner', 'reader', 'other'])
    await run(
      'INSERT INTO users(id,created_at,updated_at) VALUES(?,?,?)',
      user,
      '2026-10-01',
      '2026-10-01'
    );
  p = ulid(prior);
  i = ulid(prior + 1);
  section = ulid(prior + 2);
  s = ulid(prior + 3);
  await run(
    'INSERT INTO personal_publications(id,owner_id,handle,editor_name,display_name,created_at) VALUES(?,?,?,?,?,?)',
    p,
    'owner',
    p,
    'Editor',
    'Magazine',
    prior
  );
  await run(
    "INSERT INTO personal_issues(id,publication_id,kind,status,title,revision,published_at,created_at) VALUES(?,?,'INDEPENDENT','PUBLISHED','Issue',2,?,?)",
    i,
    p,
    prior,
    prior
  );
  await run('INSERT INTO personal_issue_sections(id,issue_id,position) VALUES(?,?,0)', section, i);
  await run(
    "INSERT INTO items(id,content_type,provider,provider_id,canonical_url,title,created_at,updated_at) VALUES('item','ARTICLE','WEB','item','https://example.org/item','Original','2026-10-01','2026-10-01')"
  );
  const metadata = {
    contentType: 'ARTICLE',
    title: 'Public title',
    creatorName: 'Author',
    sourceName: 'Source',
    originalUrl: 'https://example.org/item',
    artworkUrl: null,
    originalAvailability: 'UNKNOWN',
  };
  await run(
    'INSERT INTO personal_issue_selections(id,issue_id,section_id,item_id,metadata_json,source_fingerprint,commentary,position,first_published_revision,first_published_at) VALUES(?,?,?,?,?,?,?,0,2,?)',
    s,
    i,
    section,
    'item',
    JSON.stringify(metadata),
    'fingerprint',
    'Curator note',
    prior
  );
  for (const user of ['reader', 'other'])
    await run(
      'INSERT INTO personal_publication_subscriptions(publication_id,subscriber_id,subscribed_at) VALUES(?,?,?)',
      p,
      user,
      prior - 1
    );
});
describe('publication delivery persistence', () => {
  it('fanout is idempotent and preserves recipient isolation/read state', async () => {
    await event();
    await fanoutPendingPublications(db, now);
    await fanoutPendingPublications(db, now);
    const a = await listActivity(db, 'reader');
    expect(a.activities).toHaveLength(1);
    expect((await listActivity(db, 'owner')).activities).toHaveLength(0);
    expect(await row('SELECT count(*) AS n FROM personal_publication_activity')).toMatchObject({
      n: 2,
    });
    await expect(markActivityRead(db, 'other', a.activities[0].id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await markActivityRead(db, 'reader', a.activities[0].id, now);
    expect((await listActivity(db, 'reader')).activities[0].readAt).toBe(
      new Date(now).toISOString()
    );
  });
  it('activity pagination follows sortable creation identities', async () => {
    for (let n = 0; n < 3; n++) {
      await event('ISSUE_PUBLISHED', i, [s], prior + 60_000 * (n + 1));
      await fanoutPendingPublications(db, now);
    }
    const first = await listActivity(db, 'reader', undefined, 2);
    expect(first.activities).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await listActivity(db, 'reader', first.nextCursor!, 2);
    expect(second.activities).toHaveLength(1);
    expect(first.activities[0].createdAt >= first.activities[1].createdAt).toBe(true);
    expect(new Set([...first.activities, ...second.activities].map((a) => a.id)).size).toBe(3);
  });
  it('new subscriptions do not receive historical publication events', async () => {
    await event();
    await run(
      'UPDATE personal_publication_subscriptions SET subscribed_at=? WHERE subscriber_id=?',
      now,
      'reader'
    );
    await fanoutPendingPublications(db, now);
    expect((await listActivity(db, 'reader')).activities).toHaveLength(0);
  });
  it('one digest combines additions and replay cannot duplicate it', async () => {
    await event('SELECTIONS_ADDED');
    await event('SELECTIONS_ADDED', i, [s], prior + 120_000);
    await processDailyDigests(db, now);
    await processDailyDigests(db, now);
    const a = await listActivity(db, 'reader');
    expect(a.activities).toHaveLength(1);
    expect(a.activities[0].type).toBe('DAILY_ADDITIONS');
    expect(a.activities[0].selectionIds).toEqual([s]);
  });
  it('initial publication and corrections do not enter daily additions', async () => {
    await event();
    await event('ISSUE_CORRECTED');
    await processDailyDigests(db, now);
    expect((await listActivity(db, 'reader')).activities).toHaveLength(0);
    expect(
      await row('SELECT covered_cursor FROM personal_digest_cursors WHERE recipient_id=?', 'reader')
    ).toMatchObject({ covered_cursor: 2 });
  });
  it('removing additions yields no digest but advances checkpoint', async () => {
    await event('SELECTIONS_ADDED');
    await run('UPDATE personal_issue_selections SET removed_at=? WHERE id=?', now, s);
    await processDailyDigests(db, now);
    expect((await listActivity(db, 'reader')).activities).toHaveLength(0);
    expect(
      await row('SELECT covered_cursor FROM personal_digest_cursors WHERE recipient_id=?', 'reader')
    ).toMatchObject({ covered_cursor: 1 });
  });
  it('out-of-order dispatch does not lose committed additions', async () => {
    const id = await event('SELECTIONS_ADDED');
    await run(
      'UPDATE personal_publication_outbox SET next_attempt_at=? WHERE event_id=?',
      now + 86400_000,
      id
    );
    await processDailyDigests(db, now);
    expect((await listActivity(db, 'reader')).activities).toHaveLength(1);
  });
  it('concurrent digest claims create one activity per recipient/day', async () => {
    await event('SELECTIONS_ADDED');
    await Promise.all([processDailyDigests(db, now), processDailyDigests(db, now)]);
    expect((await listActivity(db, 'reader')).activities).toHaveLength(1);
  });
  it('digest generation follows resubscription and never revives old events', async () => {
    await event('SELECTIONS_ADDED');
    await subscription(db, 'reader', p, 'end');
    await subscription(db, 'reader', p, 'subscribe');
    await processDailyDigests(db, now);
    expect((await listActivity(db, 'reader')).activities).toHaveLength(0);
  });
  it('timezone update leaves claimed occurrence frozen', async () => {
    await processDailyDigests(db, now);
    await run(
      "UPDATE personal_digest_cursors SET claim_token='claim',lease_until=?,timezone='UTC',next_due_at=? WHERE recipient_id='reader'",
      now + 120_000,
      now
    );
    await setDeliveryPreferences(db, 'reader', 'Asia/Kathmandu', now);
    expect(
      await row(
        "SELECT timezone,next_due_at FROM personal_digest_cursors WHERE recipient_id='reader'"
      )
    ).toMatchObject({ timezone: 'UTC', next_due_at: now });
  });
  it('push mute suppresses external delivery but keeps activity', async () => {
    await registerInstallation(
      db,
      'reader',
      ulid(),
      { token: 'a'.repeat(64), environment: 'sandbox' },
      undefined,
      prior - 10
    );
    await event();
    await fanoutPendingPublications(db, now);
    await enqueuePushJobs(db, now);
    await subscription(db, 'reader', p, 'mute', true);
    const provider = vi.fn(async () => ({ kind: 'sent' as const, reason: 'ACCEPTED' }));
    await processPushJobs(db, provider, now);
    expect(provider).not.toHaveBeenCalled();
    expect((await listActivity(db, 'reader')).activities).toHaveLength(1);
    expect(await row('SELECT state FROM personal_push_jobs')).toMatchObject({
      state: 'SUPPRESSED',
    });
  });
  it('retry uses same logical job and APNs invalid token retires installation', async () => {
    const id = ulid();
    await registerInstallation(
      db,
      'reader',
      id,
      { token: 'a'.repeat(64), environment: 'sandbox' },
      undefined,
      prior - 10
    );
    await event();
    await fanoutPendingPublications(db, now);
    await enqueuePushJobs(db, now);
    await enqueuePushJobs(db, now);
    const provider = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'retry', reason: 'NETWORK_ERROR' })
      .mockResolvedValueOnce({ kind: 'invalid-token', reason: 'Unregistered' });
    await processPushJobs(db, provider, now);
    await processPushJobs(db, provider, now + 60_000);
    expect(await row('SELECT count(*) AS n FROM personal_push_jobs')).toMatchObject({ n: 1 });
    expect(
      await row('SELECT enabled FROM personal_push_installations WHERE id=?', id)
    ).toMatchObject({ enabled: 0 });
  });
  it('token rotation does not let old invalid-token response revoke new registration', async () => {
    const id = ulid();
    await registerInstallation(
      db,
      'reader',
      id,
      { token: 'a'.repeat(64), environment: 'sandbox' },
      undefined,
      prior - 10
    );
    await event();
    await fanoutPendingPublications(db, now);
    await enqueuePushJobs(db, now);
    await processPushJobs(
      db,
      async () => {
        await registerInstallation(
          db,
          'reader',
          id,
          { token: 'b'.repeat(64), environment: 'sandbox' },
          undefined,
          now
        );
        return { kind: 'invalid-token', reason: 'Unregistered' };
      },
      now
    );
    expect(
      await row('SELECT enabled,token FROM personal_push_installations WHERE id=?', id)
    ).toMatchObject({ enabled: 1, token: 'b'.repeat(64) });
  });
  it('unsubscribe after enqueue suppresses pending old-generation push', async () => {
    await registerInstallation(
      db,
      'reader',
      ulid(),
      { token: 'a'.repeat(64), environment: 'sandbox' },
      undefined,
      prior - 10
    );
    await event();
    await fanoutPendingPublications(db, now);
    await enqueuePushJobs(db, now);
    await subscription(db, 'reader', p, 'end');
    await subscription(db, 'reader', p, 'subscribe');
    const provider = vi.fn();
    await processPushJobs(db, provider, now);
    expect(provider).not.toHaveBeenCalled();
  });
  it('revocation cancels pending installation jobs', async () => {
    const id = ulid();
    await registerInstallation(
      db,
      'reader',
      id,
      { token: 'a'.repeat(64), environment: 'sandbox' },
      undefined,
      prior - 10
    );
    await event();
    await fanoutPendingPublications(db, now);
    await enqueuePushJobs(db, now);
    await revokeInstallation(db, 'reader', id, now);
    expect(await row('SELECT state FROM personal_push_jobs')).toMatchObject({
      state: 'SUPPRESSED',
    });
  });
});
describe('trusted saves and visits', () => {
  it('atomic save reuses canonical content and repeated intent creates one reference/evidence', async () => {
    const key = ulid(),
      result = await saveIssueSelection(db, 'reader', i, s, key, now);
    const again = await saveIssueSelection(db, 'reader', i, s, key, now);
    expect(result).toEqual(again);
    expect(result.status).toBe('created');
    expect(result.discoveryReferences[0].commentary).toBe('Curator note');
    expect(
      await row('SELECT count(*) AS n FROM user_items WHERE user_id=?', 'reader')
    ).toMatchObject({ n: 1 });
    expect(
      await row(
        'SELECT count(*) AS n FROM user_item_consumption_events WHERE user_id=? AND event_type=?',
        'reader',
        'SAVED'
      )
    ).toMatchObject({ n: 1 });
    await saveIssueSelection(db, 'reader', i, s, ulid(), now);
    expect(await row('SELECT count(*) AS n FROM personal_discovery_references')).toMatchObject({
      n: 1,
    });
  });
  it('existing bookmark progress and tags survive attribution save', async () => {
    await run(
      "INSERT INTO user_items(id,user_id,item_id,state,ingested_at,bookmarked_at,progress_position,created_at,updated_at) VALUES('mine','reader','item','BOOKMARKED','old','old',42,'old','old')"
    );
    const result = await saveIssueSelection(db, 'reader', i, s, ulid(), now);
    expect(result.status).toBe('already_bookmarked');
    expect(result.userItemId).toBe('mine');
    expect(
      await row("SELECT progress_position,bookmarked_at FROM user_items WHERE id='mine'")
    ).toMatchObject({ progress_position: 42, bookmarked_at: 'old' });
  });
  it('concurrent saves produce one bookmark and preserve references', async () => {
    const results = await Promise.all([
      saveIssueSelection(db, 'reader', i, s, ulid(), now),
      saveIssueSelection(db, 'reader', i, s, ulid(), now),
    ]);
    expect(results[0].userItemId).toBe(results[1].userItemId);
    expect(await row('SELECT count(*) AS n FROM personal_discovery_references')).toMatchObject({
      n: 1,
    });
  });
  it('unavailable/forged selections cannot produce a bookmark', async () => {
    await expect(saveIssueSelection(db, 'reader', i, ulid(), ulid(), now)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await run('UPDATE personal_issue_selections SET removed_at=? WHERE id=?', now, s);
    await expect(saveIssueSelection(db, 'reader', i, s, ulid(), now)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await row('SELECT count(*) AS n FROM user_items')).toMatchObject({ n: 0 });
  });
  it('editor deletion preserves reader bookmark and text attribution but disables link', async () => {
    const result = await saveIssueSelection(db, 'reader', i, s, ulid(), now);
    await cleanupPublicationDelivery(db, 'owner');
    await deletePublicationOwner(bindings, 'owner');
    const refs = await discoveryReferences(db, 'reader', result.userItemId);
    expect(refs[0]).toMatchObject({
      publicationName: 'Magazine',
      commentary: 'Curator note',
      available: false,
    });
    expect(await row('SELECT id FROM user_items WHERE id=?', result.userItemId)).not.toBeNull();
  });
  it('reader cleanup removes only their references', async () => {
    const a = await saveIssueSelection(db, 'reader', i, s, ulid(), now),
      b = await saveIssueSelection(db, 'other', i, s, ulid(), now);
    await cleanupPublicationDelivery(db, 'reader');
    expect(await discoveryReferences(db, 'reader', a.userItemId)).toHaveLength(0);
    expect(await discoveryReferences(db, 'other', b.userItemId)).toHaveLength(1);
  });
  it('visit revisions advance monotonically and never accept future/background writes', async () => {
    expect(await issueVisit(db, 'reader', i)).toEqual({ lastSeenRevision: null });
    await issueVisit(db, 'reader', i, 2, now);
    await issueVisit(db, 'reader', i, 1, now - 1);
    expect(await issueVisit(db, 'reader', i)).toEqual({ lastSeenRevision: 2 });
    await expect(issueVisit(db, 'reader', i, 3, now)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
  it('routes enforce authentication, recipient ownership and preference validation', async () => {
    expect((await request('/me/publication-activity', 'GET', undefined, null)).status).toBe(401);
    expect(
      (await request('/me/publication-activity', 'GET', undefined, 'zine_pat_test')).status
    ).toBe(403);
    expect(
      (await request('/me/publication-delivery-preferences', 'PUT', { timezone: 'invalid' })).status
    ).toBe(400);
    expect(
      (
        await request('/me/publication-delivery-preferences', 'PUT', {
          timezone: 'America/Chicago',
        })
      ).status
    ).toBe(200);
    const result = await request(`/issues/${i}/selections/${s}/save`, 'POST');
    expect(result.status).toBe(200);
    expect((await request(`/issues/${i}/visit`, 'PUT', { observedRevision: 2 })).status).toBe(200);
  });
});

describe('recovery and transactional boundaries', () => {
  it('save rollback cannot leave bookmark, evidence, replay or enrichment orphaned', async () => {
    await run(
      "CREATE TRIGGER reject_reference BEFORE INSERT ON personal_discovery_references BEGIN SELECT RAISE(ABORT,'reference failure'); END"
    );
    await expect(saveIssueSelection(db, 'reader', i, s, 'rollback-save', now)).rejects.toThrow();
    for (const table of [
      'user_items',
      'user_item_consumption_events',
      'bookmark_enrichment_outbox',
      'personal_discovery_references',
    ])
      expect(await row(`SELECT count(*) AS n FROM ${table}`)).toMatchObject({ n: 0 });
    expect(
      await row("SELECT count(*) AS n FROM personal_publication_mutations WHERE actor_id='reader'")
    ).toMatchObject({ n: 0 });
  });
  it('two issues add distinct provenance to one bookmark and retain save-time commentary', async () => {
    const a = await saveIssueSelection(db, 'reader', i, s, ulid(), now);
    const issue2 = ulid(),
      section2 = ulid(),
      selection2 = ulid();
    await run(
      "INSERT INTO personal_issues(id,publication_id,kind,status,title,revision,published_at,created_at) VALUES(?,?,'INDEPENDENT','PUBLISHED','Another issue',2,?,?)",
      issue2,
      p,
      prior,
      prior
    );
    await run(
      'INSERT INTO personal_issue_sections(id,issue_id,position) VALUES(?,?,0)',
      section2,
      issue2
    );
    await run(
      "INSERT INTO personal_issue_selections(id,issue_id,section_id,item_id,metadata_json,source_fingerprint,commentary,position,first_published_revision) SELECT ?,?,?,'item',metadata_json,source_fingerprint,'A second recommendation',0,2 FROM personal_issue_selections WHERE id=?",
      selection2,
      issue2,
      section2,
      s
    );
    const b = await saveIssueSelection(db, 'reader', issue2, selection2, ulid(), now + 1);
    expect(b.userItemId).toBe(a.userItemId);
    expect(b.discoveryReferences).toHaveLength(2);
    await run("UPDATE personal_issue_selections SET commentary='Corrected' WHERE id=?", s);
    expect((await discoveryReferences(db, 'reader', a.userItemId))[0].commentary).toBe(
      'Curator note'
    );
  });
  it('multiple changed issues form one digest grouped by issue', async () => {
    const issue2 = ulid(),
      section2 = ulid(),
      selection2 = ulid();
    await run(
      "INSERT INTO personal_issues(id,publication_id,kind,status,title,revision,published_at,created_at) VALUES(?,?,'INDEPENDENT','PUBLISHED','Another',2,?,?)",
      issue2,
      p,
      prior,
      prior
    );
    await run(
      'INSERT INTO personal_issue_sections(id,issue_id,position) VALUES(?,?,0)',
      section2,
      issue2
    );
    await run(
      "INSERT INTO personal_issue_selections(id,issue_id,section_id,item_id,metadata_json,source_fingerprint,position,first_published_revision) SELECT ?,?,?,'item',metadata_json,source_fingerprint,0,2 FROM personal_issue_selections WHERE id=?",
      selection2,
      issue2,
      section2,
      s
    );
    await event('SELECTIONS_ADDED');
    await event('SELECTIONS_ADDED', issue2, [selection2]);
    await processDailyDigests(db, now);
    const a = (await listActivity(db, 'reader')).activities;
    expect(a).toHaveLength(1);
    expect(a[0].issueIds.sort()).toEqual([i, issue2].sort());
  });
  it('private source changes reject trusted saving without leaking metadata', async () => {
    await run(
      "UPDATE items SET raw_metadata='{\"isPrivate\":true}',updated_at='changed' WHERE id='item'"
    );
    await expect(saveIssueSelection(db, 'reader', i, s, ulid(), now)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await row('SELECT count(*) AS n FROM user_items')).toMatchObject({ n: 0 });
  });
  it('failed digest batch leaves cutoff and claim for lease recovery', async () => {
    await event('SELECTIONS_ADDED');
    await run(
      "CREATE TRIGGER reject_activity BEFORE INSERT ON personal_publication_activity BEGIN SELECT RAISE(ABORT,'activity failure'); END"
    );
    await expect(processDailyDigests(db, now)).rejects.toThrow();
    expect(
      await row(
        "SELECT covered_cursor,cutoff FROM personal_digest_cursors WHERE recipient_id='reader'"
      )
    ).toMatchObject({ covered_cursor: 0, cutoff: 1 });
    await run('DROP TRIGGER reject_activity');
    await processDailyDigests(db, now + 120001);
    expect((await listActivity(db, 'reader')).activities).toHaveLength(1);
  });
  it('expired push lease recovers and concurrent workers send one logical job', async () => {
    await registerInstallation(
      db,
      'reader',
      ulid(),
      { token: 'a'.repeat(64), environment: 'sandbox' },
      undefined,
      prior - 10
    );
    await event();
    await fanoutPendingPublications(db, now);
    await enqueuePushJobs(db, now);
    await run("UPDATE personal_push_jobs SET lease_token='expired',lease_until=?", now - 1);
    const provider = vi.fn(async () => ({ kind: 'sent' as const, reason: 'ACCEPTED' }));
    await Promise.all([processPushJobs(db, provider, now), processPushJobs(db, provider, now)]);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(await row('SELECT state FROM personal_push_jobs')).toMatchObject({ state: 'SENT' });
  });
  it('disabled APNs does not consume actual provider retry budget', async () => {
    await registerInstallation(
      db,
      'reader',
      ulid(),
      { token: 'a'.repeat(64), environment: 'sandbox' },
      undefined,
      prior - 10
    );
    await event();
    await fanoutPendingPublications(db, now);
    await enqueuePushJobs(db, now);
    await processPushJobs(db, undefined, now);
    expect(await row('SELECT state,attempts,reason FROM personal_push_jobs')).toMatchObject({
      state: 'PENDING',
      attempts: 0,
      reason: 'APNS_NOT_CONFIGURED',
    });
  });
  it('fanout expired lease resumes and simultaneous dispatch does not duplicate', async () => {
    const id = await event();
    await run(
      "INSERT INTO personal_publication_fanout(event_id,lease_token,lease_until) VALUES(?,'old',?)",
      id,
      now - 1
    );
    await Promise.all([fanoutPendingPublications(db, now), fanoutPendingPublications(db, now)]);
    expect((await listActivity(db, 'reader')).activities).toHaveLength(1);
    expect(
      await row('SELECT completed_at FROM personal_publication_outbox WHERE event_id=?', id)
    ).toMatchObject({ completed_at: now });
  });
  it('rebookmark preserves progress while emitting exactly one saved transition', async () => {
    await run(
      "INSERT INTO user_items(id,user_id,item_id,state,ingested_at,progress_position,created_at,updated_at) VALUES('mine','reader','item','ARCHIVED','old',17,'old','old')"
    );
    const a = await saveIssueSelection(db, 'reader', i, s, ulid(), now);
    expect(a.status).toBe('rebookmarked');
    expect(
      await row("SELECT progress_position,state FROM user_items WHERE id='mine'")
    ).toMatchObject({ progress_position: 17, state: 'BOOKMARKED' });
    expect(
      await row(
        "SELECT count(*) AS n FROM user_item_consumption_events WHERE user_id='reader' AND event_type='SAVED'"
      )
    ).toMatchObject({ n: 1 });
  });
});

describe('subscriber timezone initialization', () => {
  it('absent differs from explicit UTC and initializeOnly never overwrites a saved choice', async () => {
    const initial = await request('/me/publication-delivery-preferences');
    expect(await initial.json()).toMatchObject({
      preferences: { timezone: 'UTC', configured: false },
    });
    const saved = await request('/me/publication-delivery-preferences', 'PUT', { timezone: 'UTC' });
    expect(await saved.json()).toMatchObject({
      preferences: { timezone: 'UTC', configured: true },
    });
    const raced = await request('/me/publication-delivery-preferences', 'PUT', {
      timezone: 'America/Chicago',
      initializeOnly: true,
    });
    expect(await raced.json()).toMatchObject({
      preferences: { timezone: 'UTC', configured: true },
    });
  });
});

describe('in-flight migration compatibility', () => {
  it('checkpoint migration safely applies when the identical table already exists', async () => {
    const migration = bindings.TEST_MIGRATIONS.find((m) =>
      m.name.includes('add_publication_fanout_checkpoint')
    );
    expect(migration).toBeDefined();
    await db.batch(migration!.queries.map((query) => db.prepare(query)));
    expect(
      await row(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='personal_publication_fanout'"
      )
    ).toMatchObject({ name: 'personal_publication_fanout' });
  });
});

describe('digest visibility commit boundary', () => {
  it('removal between candidate read and transaction commit suppresses empty activity', async () => {
    await event('SELECTIONS_ADDED');
    const racing = {
      prepare: db.prepare.bind(db),
      batch: async (statements: D1PreparedStatement[]) => {
        await run('UPDATE personal_issue_selections SET removed_at=? WHERE id=?', now, s);
        return db.batch(statements);
      },
    } as unknown as D1Database;
    await processDailyDigests(racing, now);
    expect((await listActivity(db, 'reader')).activities).toHaveLength(0);
    expect(
      await row("SELECT covered_cursor FROM personal_digest_cursors WHERE recipient_id='reader'")
    ).toMatchObject({ covered_cursor: 1 });
  });
});
