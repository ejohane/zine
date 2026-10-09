import type * as EnrichmentOutbox from '../enrichment/outbox';
import { saveBookmark } from '../bookmarks/save';
import { bookmarkItem } from '../items/library-state';
import { changeItemFinishedState } from '../items/finished-state';
import { buildIngestionStatements, executeBatchStatements } from '../ingestion/processor/write';
import { ContentType, Provider } from '@zine/shared';
import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { ulid } from 'ulid';
import type { Bindings, Env } from '../types';
import { createDb } from '../db';
import { WeeklyRecapService, cleanupWeeklyRecaps, processWeeklyRecapCatchup } from './service';
import { recapWindow, latestClosedWeekStart } from './windows';
import {
  savedEvidence,
  markOwnedItemOpened,
  finishedEvidence,
  savedEvidenceStatement,
} from './evidence';
import { createWeeklyIssue } from './draft';
import { PublicationService } from '../publications/service';
import {
  CreateWeeklyRecapIssueSchema,
  WeeklyRecapSchema,
} from '../../../../packages/shared/src/schemas/weekly-recaps';
import routes from '../routes/api-v1/weekly-recaps';
import { userItems } from '../db/schema';
import { eq } from 'drizzle-orm';
vi.mock('googleapis', () => ({ google: {} }));
vi.mock('../enrichment/outbox', async (importOriginal) => ({
  ...(await importOriginal<typeof EnrichmentOutbox>()),
  dispatchBookmarkEnrichment: vi.fn(async () => undefined),
}));
vi.mock('../people/service', () => ({
  syncPeopleForUserItemBestEffort: vi.fn(async () => undefined),
  deactivatePeopleForUserItemBestEffort: vi.fn(async () => undefined),
}));

vi.mock('../lib/auth', () => ({
  verifyClerkToken: vi.fn(async (token: string) => ({
    success: true,
    userId: token,
    payload: { sub: token },
  })),
}));
const bindings = env as unknown as Bindings & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};
const db = bindings.DB,
  drizzle = createDb(db),
  now = Date.parse('2026-10-08T12:00:00Z'),
  savedAt = Date.parse('2026-09-29T12:00:00Z');
const app = new Hono<Env>();
app.use('*', async (c, next) => {
  c.set('requestId', 'request');
  c.set('traceId', 'trace');
  await next();
});
app.route('/api/v1', routes);
async function req(
  path: string,
  method = 'GET',
  body?: unknown,
  actor: string | null = 'owner',
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
async function seed(id = 'item', state = 'BOOKMARKED', provider = 'WEB') {
  await db
    .prepare(
      `INSERT INTO items(id,content_type,provider,provider_id,canonical_url,title,created_at,updated_at) VALUES(?,'ARTICLE',?,?,?,'Old title','2026-09-01','2026-09-01')`
    )
    .bind(id, provider, id, `https://example.org/${id}`)
    .run();
  await db
    .prepare(
      `INSERT INTO user_items(id,user_id,item_id,state,ingested_at,bookmarked_at,created_at,updated_at) VALUES(?,'owner',?,?, '2026-09-01',?,'2026-09-01','2026-09-01')`
    )
    .bind(`bookmark-${id}`, id, state, state === 'BOOKMARKED' ? '2026-09-29T12:00:00.000Z' : null)
    .run();
}
beforeEach(async () => {
  await applyD1Migrations(db, bindings.TEST_MIGRATIONS);
  for (const id of ['owner', 'other'])
    await db
      .prepare(
        "INSERT INTO users(id,email,created_at,updated_at) VALUES(?,NULL,'2026-01-01','2026-01-01')"
      )
      .bind(id)
      .run();
  await seed();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          '<html><head><title>Public article</title><meta name="author" content="Author"></head></html>',
          { headers: { 'content-type': 'text/html' } }
        )
    )
  );
});
afterEach(() => vi.unstubAllGlobals());
describe('calendar identity', () => {
  it('uses closed Sunday weeks, not rolling 168 hours', () => {
    expect(latestClosedWeekStart('America/Chicago', new Date('2026-10-04T05:00:00Z'))).toBe(
      '2026-09-27'
    );
    expect(latestClosedWeekStart('America/Chicago', new Date('2026-10-04T04:59:59Z'))).toBe(
      '2026-09-20'
    );
    const spring = recapWindow('2026-03-08', 'America/Chicago');
    expect(spring.endAtMs - spring.startAtMs).toBe(167 * 3600000);
    const fall = recapWindow('2026-11-01', 'America/Chicago');
    expect(fall.endAtMs - fall.startAtMs).toBe(169 * 3600000);
    expect(recapWindow('2025-12-28', 'Asia/Kathmandu').weekStart).toBe('2025-12-28');
  });
  it('rejects invalid/non-Sunday dates and invalid timezone', () => {
    for (const date of ['2026-02-30', '2026-10-05', 'bad'])
      expect(() => recapWindow(date, 'UTC')).toThrow();
    expect(() => recapWindow('2026-10-04', 'invalid')).toThrow();
  });
  it('keeps past timezone windows and schedules explicit changes for a future Sunday', async () => {
    const service = new WeeklyRecapService(db, now);
    await service.setPreferences('owner', 'America/Chicago');
    const before = await service.get('owner', '2026-09-27');
    const prefs = await service.setPreferences('owner', 'Asia/Tokyo');
    expect(prefs.timezone).toBe('America/Chicago');
    expect(prefs.pendingTimezone).toBe('Asia/Tokyo');
    expect(Date.parse(prefs.pendingEffectiveAt!)).toBeGreaterThan(now);
    const after = await service.get('owner', '2026-09-27');
    expect(after.startAt).toBe(before.startAt);
    expect(after.timezone).toBe(before.timezone);
  });
  it('rejects future and unclosed weeks', async () => {
    await expect(new WeeklyRecapService(db, now).get('owner', '2026-10-04')).rejects.toMatchObject({
      details: { reason: 'WEEK_NOT_CLOSED' },
    });
  });
});
describe('durable observed evidence', () => {
  it('records saves only on state transitions and retains snapshot titles', async () => {
    await db
      .prepare("UPDATE user_items SET state='INBOX',bookmarked_at=NULL WHERE id='bookmark-item'")
      .run();
    await drizzle.batch([
      savedEvidence(drizzle, {
        userId: 'owner',
        userItemId: 'bookmark-item',
        occurredAt: savedAt,
        source: 'MANUAL_SAVE',
      }),
      drizzle
        .update(userItems)
        .set({ state: 'BOOKMARKED' })
        .where(eq(userItems.id, 'bookmark-item')),
    ]);
    await drizzle.batch([
      savedEvidence(drizzle, {
        userId: 'owner',
        userItemId: 'bookmark-item',
        occurredAt: savedAt + 1,
        source: 'MANUAL_SAVE',
      }),
      drizzle
        .update(userItems)
        .set({ state: 'BOOKMARKED' })
        .where(eq(userItems.id, 'bookmark-item')),
    ]);
    expect(
      (await db
        .prepare("SELECT COUNT(*) count FROM user_item_consumption_events WHERE event_type='SAVED'")
        .first<{ count: number }>())!.count
    ).toBe(1);
    await db.prepare("UPDATE items SET title='Changed later'").run();
    const recap = await new WeeklyRecapService(db, now).get('owner', '2026-09-27');
    expect(recap.candidates[0].title).toBe('Old title');
    expect(recap.candidates[0].evidence[0].kind).toBe('SAVED');
  });
  it('rolls evidence back if its batched state write fails', async () => {
    await db.prepare("UPDATE user_items SET state='INBOX' WHERE id='bookmark-item'").run();
    await expect(
      db.batch([
        savedEvidenceStatement(db, {
          userId: 'owner',
          userItemId: 'bookmark-item',
          occurredAt: savedAt,
          source: 'MANUAL_SAVE',
        }),
        db.prepare("INSERT INTO users(id,created_at,updated_at) VALUES('owner','x','x')"),
      ])
    ).rejects.toThrow();
    expect(
      (await db
        .prepare('SELECT COUNT(*) count FROM user_item_consumption_events')
        .first<{ count: number }>())!.count
    ).toBe(0);
  });
  it('honors rejected publication mutation guards', async () => {
    await db.prepare("UPDATE user_items SET state='INBOX' WHERE id='bookmark-item'").run();
    await savedEvidenceStatement(db, {
      userId: 'owner',
      userItemId: 'bookmark-item',
      occurredAt: savedAt,
      source: 'PUBLICATION_SAVE',
      mutationGuard: 'missing',
    }).run();
    expect(
      (await db
        .prepare('SELECT COUNT(*) count FROM user_item_consumption_events')
        .first<{ count: number }>())!.count
    ).toBe(0);
  });
  it('records unsaved and finished rereads; retry identity cannot multiply opens', async () => {
    await db
      .prepare("UPDATE user_items SET state='ARCHIVED',is_finished=1 WHERE id='bookmark-item'")
      .run();
    const first = await markOwnedItemOpened(drizzle, {
      userId: 'owner',
      userItemId: 'bookmark-item',
      interactionId: 'open1',
      occurredAt: savedAt,
    });
    const retry = await markOwnedItemOpened(drizzle, {
      userId: 'owner',
      userItemId: 'bookmark-item',
      interactionId: 'open1',
      occurredAt: savedAt + 1000,
    });
    expect(first).toEqual(retry);
    expect(
      (await db
        .prepare('SELECT COUNT(*) count FROM user_item_consumption_events')
        .first<{ count: number }>())!.count
    ).toBe(1);
    expect(
      await markOwnedItemOpened(drizzle, {
        userId: 'other',
        userItemId: 'bookmark-item',
        occurredAt: savedAt,
      })
    ).toBeNull();
    const recap = await new WeeklyRecapService(db, now).get('owner', '2026-09-27');
    expect(recap.candidates[0].evidence.some((e) => e.kind === 'OPENED')).toBe(true);
    expect(recap.candidates[0].savedBookmarkId).toBeNull();
    expect(recap.candidates[0].evidence.some((e) => e.kind === 'FINISHED')).toBe(false);
  });
  it('records finish transition once with state atomically', async () => {
    await drizzle.batch([
      finishedEvidence(drizzle, {
        userId: 'owner',
        userItemId: 'bookmark-item',
        isFinished: true,
        occurredAt: savedAt,
      }),
      drizzle.update(userItems).set({ isFinished: true }).where(eq(userItems.id, 'bookmark-item')),
    ]);
    await drizzle.batch([
      finishedEvidence(drizzle, {
        userId: 'owner',
        userItemId: 'bookmark-item',
        isFinished: true,
        occurredAt: savedAt + 1,
      }),
      drizzle.update(userItems).set({ isFinished: true }).where(eq(userItems.id, 'bookmark-item')),
    ]);
    expect(
      (await db
        .prepare(
          "SELECT COUNT(*) count FROM user_item_consumption_events WHERE event_type='FINISHED'"
        )
        .first<{ count: number }>())!.count
    ).toBe(1);
  });
});
describe('private snapshot history and draft adapter', () => {
  it('keeps evidence after later open/archive/delete and refreshes late evidence', async () => {
    await markOwnedItemOpened(drizzle, {
      userId: 'owner',
      userItemId: 'bookmark-item',
      interactionId: 'old',
      occurredAt: savedAt,
    });
    const service = new WeeklyRecapService(db, now),
      first = await service.get('owner', '2026-09-27');
    await markOwnedItemOpened(drizzle, {
      userId: 'owner',
      userItemId: 'bookmark-item',
      interactionId: 'new',
      occurredAt: now,
    });
    await db
      .prepare("UPDATE user_items SET state='ARCHIVED',bookmarked_at=NULL WHERE id='bookmark-item'")
      .run();
    const second = await service.get('owner', '2026-09-27');
    expect(second.id).toBe(first.id);
    expect(second.candidates[0].evidence).toEqual(first.candidates[0].evidence);
    await db.prepare("DELETE FROM user_item_consumption_events WHERE user_id='owner'").run();
    await db.prepare("DELETE FROM user_items WHERE user_id='owner'").run();
    const missing = await service.get('owner', '2026-09-27');
    expect(missing.candidates).toHaveLength(1);
    expect(missing.candidates[0].publicationEligibility).toBe('UNAVAILABLE');
  });
  it('deduplicates candidates with multiple honest activity labels and selects nothing by default', async () => {
    await markOwnedItemOpened(drizzle, {
      userId: 'owner',
      userItemId: 'bookmark-item',
      occurredAt: savedAt,
    });
    await drizzle.batch([
      finishedEvidence(drizzle, {
        userId: 'owner',
        userItemId: 'bookmark-item',
        isFinished: true,
        occurredAt: savedAt + 1000,
      }),
      drizzle.update(userItems).set({ isFinished: true }).where(eq(userItems.id, 'bookmark-item')),
    ]);
    const recap = await new WeeklyRecapService(db, now).get('owner', '2026-09-27');
    expect(recap.candidates).toHaveLength(1);
    expect(recap.selectedCandidateIds).toEqual([]);
    expect(new Set(recap.candidates[0].evidence.map((e) => e.kind))).toEqual(
      new Set(['SAVED', 'OPENED', 'FINISHED'])
    );
    expect(WeeklyRecapSchema.safeParse(recap).success).toBe(true);
    expect(recap.coverage.state).toBe('PARTIAL');
  });
  it('has useful private empty weeks and records no publication event', async () => {
    const recap = await new WeeklyRecapService(db, now).get('other', '2026-09-27');
    expect(recap.candidates).toEqual([]);
    expect(recap.issueId).toBeNull();
    expect(
      (await db
        .prepare('SELECT COUNT(*) count FROM personal_publication_events')
        .first<{ count: number }>())!.count
    ).toBe(0);
  });
  it('publishes neither recap nor draft, supports delayed creation and replay after unbookmark', async () => {
    await new PublicationService(db).createPublication(
      'owner',
      { editorName: 'Editor', displayName: null, description: null, coverAssetId: null },
      'pub'
    );
    const input = { selectedCandidateIds: ['item'], title: 'My week' },
      key = 'weekly';
    const result = (await createWeeklyIssue(db, 'owner', '2026-09-27', input, key)) as {
      issue: { id: string; kind: string; status: string };
    };
    expect(result.issue.kind).toBe('WEEKLY');
    expect(result.issue.status).toBe('DRAFT');
    await db
      .prepare("UPDATE user_items SET state='ARCHIVED',bookmarked_at=NULL WHERE id='bookmark-item'")
      .run();
    expect(await createWeeklyIssue(db, 'owner', '2026-09-27', input, key)).toEqual(result);
    await expect(
      createWeeklyIssue(db, 'owner', '2026-09-27', { selectedCandidateIds: ['foreign'] }, key)
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('rejects foreign, unsaved and private candidates and duplicate selections', async () => {
    await expect(
      createWeeklyIssue(db, 'owner', '2026-09-27', { selectedCandidateIds: ['foreign'] }, 'foreign')
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(
      CreateWeeklyRecapIssueSchema.safeParse({ selectedCandidateIds: ['item', 'item'] }).success
    ).toBe(false);
    await db.prepare("UPDATE user_items SET state='ARCHIVED' WHERE id='bookmark-item'").run();
    await expect(
      createWeeklyIssue(db, 'owner', '2026-09-27', { selectedCandidateIds: ['item'] }, 'unsaved')
    ).rejects.toMatchObject({ code: 'INELIGIBLE_SELECTIONS' });
    await seed('private', 'BOOKMARKED', 'GMAIL');
    await expect(
      createWeeklyIssue(db, 'owner', '2026-09-27', { selectedCandidateIds: ['private'] }, 'private')
    ).rejects.toMatchObject({ code: 'INELIGIBLE_SELECTIONS' });
  });
  it('snapshots/catches up skipped weeks idempotently and cleans private account state', async () => {
    await new WeeklyRecapService(db, Date.parse('2026-09-28T12:00:00Z')).setPreferences(
      'owner',
      'UTC'
    );
    await processWeeklyRecapCatchup(db, now);
    await processWeeklyRecapCatchup(db, now);
    expect(
      (await db
        .prepare("SELECT COUNT(*) count FROM weekly_recap_windows WHERE user_id='owner'")
        .first<{ count: number }>())!.count
    ).toBe(2);
    await cleanupWeeklyRecaps(db, 'owner');
    expect(
      (await db
        .prepare("SELECT COUNT(*) count FROM weekly_recap_windows WHERE user_id='owner'")
        .first<{ count: number }>())!.count
    ).toBe(0);
  });
  it('returns paginated owner-only history and no anonymous/PAT access', async () => {
    expect((await req('/me/weekly-recaps', 'GET', undefined, null)).status).toBe(401);
    expect((await req('/me/weekly-recaps', 'GET', undefined, 'zine_pat_bad')).status).toBe(403);
    const r = await req('/me/weekly-recaps/2026-09-27');
    expect(r.status).toBe(200);
    const other = await req('/me/weekly-recaps/2026-09-27', 'GET', undefined, 'other');
    expect(((await other.json()) as { recap: { candidates: unknown[] } }).recap.candidates).toEqual(
      []
    );
    await new WeeklyRecapService(db).get('owner', '2026-09-20');
    const list = await req('/me/weekly-recaps?limit=1');
    expect(list.status).toBe(200);
    const page = (await list.json()) as { recaps: unknown[]; nextCursor: string | null };
    expect(page.recaps).toHaveLength(1);
    expect(page.nextCursor).not.toBeNull();
    expect((await req('/me/weekly-recap-preferences', 'PUT', { timezone: 'invalid' })).status).toBe(
      400
    );
    expect((await req('/me/weekly-recaps/2026-09-28')).status).toBe(400);
  });
});

describe('late evidence and timezone transitions', () => {
  it('refreshes a stored private week with late accepted evidence without changing an issue', async () => {
    const service = new WeeklyRecapService(db, now);
    const before = await service.get('owner', '2026-09-27');
    await markOwnedItemOpened(drizzle, {
      userId: 'owner',
      userItemId: 'bookmark-item',
      interactionId: 'late',
      occurredAt: savedAt + 1000,
    });
    const after = await service.get('owner', '2026-09-27');
    expect(after.id).toBe(before.id);
    expect(after.candidates[0].evidence.some((e) => e.kind === 'OPENED')).toBe(true);
    expect(after.issueId).toBeNull();
  });
  it('assigns transition overlap to the preceding week without losing events', async () => {
    const service = new WeeklyRecapService(db, now);
    await service.setPreferences('owner', 'America/Chicago');
    const prefs = await service.setPreferences('owner', 'Asia/Tokyo');
    const switchAt = Date.parse(prefs.pendingEffectiveAt!);
    await markOwnedItemOpened(drizzle, {
      userId: 'owner',
      userItemId: 'bookmark-item',
      interactionId: 'transition',
      occurredAt: switchAt + 1000,
    });
    const later = new WeeklyRecapService(db, switchAt + 8 * 86400000);
    const oldWeek = latestClosedWeekStart('America/Chicago', new Date(switchAt + 1000));
    const prior = await later.get(
      'owner',
      new Date(Date.parse(`${oldWeek}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10)
    );
    const next = await later.get(
      'owner',
      latestClosedWeekStart('Asia/Tokyo', new Date(switchAt + 8 * 86400000))
    );
    expect(
      prior.candidates.some((c) =>
        c.evidence.some(
          (e) =>
            e.source === 'ITEM_DETAIL_OPEN' &&
            e.observedAt === new Date(switchAt + 1000).toISOString()
        )
      )
    ).toBe(true);
    expect(
      next.candidates.some((c) =>
        c.evidence.some((e) => e.observedAt === new Date(switchAt + 1000).toISOString())
      )
    ).toBe(false);
    expect(next.coverage.limitations.some((v) => v.includes('overlapping hours'))).toBe(true);
    const justSwitched = new WeeklyRecapService(db, switchAt + 1000);
    expect((await justSwitched.list('owner')).recaps.length).toBeGreaterThan(0);
  });
});

describe('actual save writer paths', () => {
  const ctx = {
    db: drizzle,
    userId: 'owner',
    env: bindings,
    requestId: 'request',
    traceId: 'trace',
  };
  async function count() {
    return (await db
      .prepare("SELECT COUNT(*) count FROM user_item_consumption_events WHERE event_type='SAVED'")
      .first<{ count: number }>())!.count;
  }
  it('captures initial manual save, no-op retry and rebookmark', async () => {
    const input = {
      url: 'https://example.org/manual',
      canonicalUrl: 'https://example.org/manual',
      provider: Provider.WEB,
      contentType: ContentType.ARTICLE,
      providerId: 'manual',
      title: 'Manual article',
      creator: 'Author',
      thumbnailUrl: null,
      duration: null,
    };
    const first = await saveBookmark(ctx, input);
    expect(first.status).toBe('created');
    expect(await count()).toBe(1);
    expect((await saveBookmark(ctx, input)).status).toBe('already_bookmarked');
    expect(await count()).toBe(1);
    await db
      .prepare("UPDATE user_items SET state='ARCHIVED',bookmarked_at=NULL WHERE id=?")
      .bind(first.userItemId)
      .run();
    expect((await saveBookmark(ctx, input)).status).toBe('rebookmarked');
    expect(await count()).toBe(2);
  });
  it('captures inbox and finish-save without inventing repeated saves', async () => {
    await db
      .prepare("UPDATE user_items SET state='INBOX',bookmarked_at=NULL WHERE id='bookmark-item'")
      .run();
    await bookmarkItem(ctx, { id: 'bookmark-item' });
    await bookmarkItem(ctx, { id: 'bookmark-item' });
    expect(await count()).toBe(1);
    await seed('finish', 'INBOX');
    await changeItemFinishedState(ctx, {
      userItemId: 'bookmark-finish',
      change: { type: 'set', isFinished: true },
      bookmarkOnFinish: true,
    });
    await changeItemFinishedState(ctx, {
      userItemId: 'bookmark-finish',
      change: { type: 'set', isFinished: true },
      bookmarkOnFinish: true,
    });
    expect(await count()).toBe(2);
    expect(
      (await db
        .prepare(
          "SELECT COUNT(*) count FROM user_item_consumption_events WHERE event_type='FINISHED'"
        )
        .first<{ count: number }>())!.count
    ).toBe(1);
  });
  it('records auto-saves atomically and ignores conflicting/replayed insertion batches', async () => {
    await db
      .prepare(
        "INSERT INTO subscriptions(id,user_id,provider,provider_channel_id,created_at,updated_at) VALUES('sub','owner','YOUTUBE','channel',1,1)"
      )
      .run();
    const prepared = {
      newItem: {
        id: 'video',
        providerId: 'video',
        provider: Provider.YOUTUBE,
        contentType: ContentType.VIDEO,
        title: 'Video',
        canonicalUrl: 'https://youtube.com/watch?v=video',
        creator: 'Channel',
        publishedAt: savedAt,
        createdAt: savedAt,
      },
      rawItem: { id: 'video' },
      providerId: 'video',
      canonicalItemId: 'video',
      canonicalItemExists: false,
      userItemId: 'bookmark-video',
      creatorId: null,
    };
    const context = {
      db: drizzle,
      userId: 'owner',
      subscriptionId: 'sub',
      provider: Provider.YOUTUBE,
      autoBookmark: true,
      nowISO: new Date(savedAt).toISOString(),
      now: savedAt,
    };
    await executeBatchStatements(buildIngestionStatements(prepared, context), drizzle);
    await executeBatchStatements(buildIngestionStatements(prepared, context), drizzle);
    await executeBatchStatements(
      buildIngestionStatements({ ...prepared, userItemId: 'ignored' }, context),
      drizzle
    );
    expect(await count()).toBe(1);
    await executeBatchStatements(
      buildIngestionStatements(
        {
          ...prepared,
          newItem: { ...prepared.newItem, id: 'video2', providerId: 'video2' },
          canonicalItemId: 'video2',
          userItemId: 'bookmark-video2',
        },
        { ...context, autoBookmark: false }
      ),
      drizzle
    );
    expect(await count()).toBe(1);
  });
});

describe('unsaved Today activity', () => {
  it('uses only the exact opened source, then permits selection after ordinary save', async () => {
    await db
      .prepare(
        `INSERT INTO daily_editions(id,user_id,edition_date,revision,status,schema_version,headline,window_start_at,window_end_at,edition_key,markdown_key,snapshot_key,validation_key,content_hash,quality_score,created_at,updated_at)
      VALUES('edition','owner','2026-09-29',1,'PUBLISHED',1,'Today',1,2,'edition','markdown','snapshot','validation','hash',1,1,1)`
      )
      .run();
    await db
      .prepare(
        `INSERT INTO editorial_feedback_events(id,user_id,client_event_id,edition_id,target_type,target_id,event_type,occurred_at,payload_hash,created_at,target_canonical_urls_json,target_source_snapshot_json)
      VALUES('editorial-open','owner','client','edition','SOURCE','source','OPENED',?,'hash',?,'["https://example.org/item","https://example.org/unsaved"]',?)`
      )
      .bind(
        savedAt,
        savedAt,
        JSON.stringify({
          title: 'Unsaved idea',
          creatorName: 'Author',
          contentType: 'ARTICLE',
          provider: 'WEB',
          canonicalUrl: 'https://example.org/unsaved',
        })
      )
      .run();
    const service = new WeeklyRecapService(db, now),
      recap = await service.get('owner', '2026-09-27');
    const source = recap.candidates.find((c) => c.originalUrl === 'https://example.org/unsaved')!;
    expect(source.title).toBe('Unsaved idea');
    expect(source.savedBookmarkId).toBeNull();
    expect(source.publicationEligibility).toBe('UNSAVED');
    expect(source.evidence.map((e) => e.kind)).toEqual(['OPENED']);
    expect(
      recap.candidates
        .find((c) => c.itemId === 'item')!
        .evidence.some((e) => e.source === 'TODAY_SOURCE_OPEN')
    ).toBe(false);
    const saved = await saveBookmark(
      { db: drizzle, userId: 'owner', env: bindings, requestId: 'request', traceId: 'trace' },
      {
        url: 'https://example.org/unsaved',
        canonicalUrl: 'https://example.org/unsaved',
        provider: Provider.WEB,
        contentType: ContentType.ARTICLE,
        providerId: 'unsaved',
        title: 'Unsaved idea',
        creator: 'Author',
        thumbnailUrl: null,
        duration: null,
      }
    );
    const refreshed = await service.get('owner', '2026-09-27');
    const same = refreshed.candidates.find((c) => c.id === source.id)!;
    expect(same.savedBookmarkId).toBe(saved.userItemId);
    expect(same.itemId).toBe(saved.itemId);
    expect(refreshed.candidates.filter((c) => c.itemId === saved.itemId)).toHaveLength(1);
  });
});
