import {
  applyD1Migrations,
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { ulid } from 'ulid';
import routes from '../routes/api-v1';
import type { Bindings, Env } from '../types';
import type {
  OwnerIssue,
  PublicPublication,
  PublicationActivity,
  SelectionSaveResult,
  WeeklyRecap,
} from '@zine/shared';
import { runPublicationDelivery } from './delivery/service';
import { cleanupPublicationDelivery } from './delivery/cleanup';
import { cleanupWeeklyRecaps, WeeklyRecapService } from '../weekly-recaps/service';
import { deletePublicationOwner } from './cleanup';
vi.mock('googleapis', () => ({ google: {} }));
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
const app = new Hono<Env>();
app.use('*', async (c, next) => {
  c.set('requestId', 'integrated-request');
  c.set('traceId', 'integrated-trace');
  await next();
});
app.route('/api/v1', routes);
const NOW = Date.parse('2026-10-08T14:00:00Z');
function req(
  path: string,
  method = 'GET',
  input?: unknown,
  actor: string | null = 'editor',
  key = ulid(),
  ctx?: ExecutionContext
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
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    },
    bindings,
    ctx
  );
}
async function value<T>(response: Response): Promise<T> {
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body as T;
}
async function compose(bookmarkId = 'bookmark-1') {
  let { issue } = await value<{ issue: OwnerIssue }>(
    await req('/me/publication/issues', 'POST', {
      kind: 'INDEPENDENT',
      title: 'An intentional issue',
    })
  );
  const selectionId = ulid();
  ({ issue } = await value<{ issue: OwnerIssue }>(
    await req(`/me/issues/${issue.id}`, 'PATCH', {
      expectedRevision: issue.revision,
      operations: [
        {
          type: 'addSelection',
          selectionId,
          sectionId: issue.sections[0].id,
          bookmarkId,
          commentary: 'Why I chose this.',
        },
      ],
    })
  ));
  return { issue, selectionId };
}
beforeEach(async () => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
  for (const id of ['editor', 'reader'])
    await bindings.DB.prepare('INSERT INTO users(id,email,created_at,updated_at) VALUES(?,?,?,?)')
      .bind(id, `${id}@private.invalid`, '2026-10-01', '2026-10-01')
      .run();
  for (const n of [1, 2, 3]) {
    await bindings.DB.prepare(
      'INSERT INTO items(id,content_type,provider,provider_id,canonical_url,title,raw_metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)'
    )
      .bind(
        `item-${n}`,
        'ARTICLE',
        'WEB',
        `item-${n}`,
        `https://example.org/essay-${n}`,
        'PRIVATE LIBRARY TITLE',
        '{"private":"never expose"}',
        '2026-10-01',
        '2026-10-01'
      )
      .run();
    await bindings.DB.prepare(
      'INSERT INTO user_items(id,user_id,item_id,state,ingested_at,bookmarked_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)'
    )
      .bind(
        `bookmark-${n}`,
        'editor',
        `item-${n}`,
        'BOOKMARKED',
        '2026-10-01',
        '2026-10-01',
        '2026-10-01',
        '2026-10-01'
      )
      .run();
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          '<html><head><title>Public original</title><meta name="author" content="Public author"></head></html>',
          { headers: { 'content-type': 'text/html' } }
        )
    )
  );
  await value(
    await req('/me/publication', 'POST', {
      editorName: 'Editor',
      displayName: 'Loose Threads',
      description: null,
      coverAssetId: null,
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('integrated personal publication journeys', () => {
  it('publishes through registered routes, immediately notifies, saves once and retains multiple discovery references', async () => {
    const { publication } = await value<{ publication: PublicPublication }>(
      await req('/me/publication')
    );
    await value(
      await req(`/publications/${publication.id}/subscription`, 'PUT', undefined, 'reader')
    );
    const { issue, selectionId } = await compose();
    expect((await req(`/issues/${issue.id}`, 'GET', undefined, null)).status).toBe(404);
    const key = ulid(),
      ctx = createExecutionContext();
    const published = await value<{ issue: OwnerIssue }>(
      await req(
        `/me/issues/${issue.id}/publish`,
        'POST',
        { expectedRevision: issue.revision },
        'editor',
        key,
        ctx
      )
    );
    await waitOnExecutionContext(ctx);
    const publicResult = await value<{ issue: unknown }>(
      await req(`/issues/${issue.id}`, 'GET', undefined, null)
    );
    expect(JSON.stringify(publicResult)).not.toContain('PRIVATE LIBRARY TITLE');
    expect(JSON.stringify(publicResult)).not.toContain('bookmark-1');
    const activity = await value<{ activities: PublicationActivity[] }>(
      await req('/me/publication-activity', 'GET', undefined, 'reader')
    );
    expect(activity.activities.map((a) => a.type)).toEqual(['ISSUE_PUBLISHED']);
    expect(activity.activities[0].issueIds).toEqual([issue.id]);
    const saveKey = ulid();
    const first = await value<SelectionSaveResult>(
      await req(
        `/issues/${issue.id}/selections/${selectionId}/save`,
        'POST',
        undefined,
        'reader',
        saveKey
      )
    );
    const replay = await value<SelectionSaveResult>(
      await req(
        `/issues/${issue.id}/selections/${selectionId}/save`,
        'POST',
        undefined,
        'reader',
        saveKey
      )
    );
    expect(replay.userItemId).toBe(first.userItemId);
    expect(replay.discoveryReferences).toHaveLength(1);
    await bindings.DB.prepare(
      'UPDATE user_items SET progress_position=42,progress_duration=100 WHERE id=?'
    )
      .bind(first.userItemId)
      .run();
    const second = await compose();
    await value(
      await req(`/me/issues/${second.issue.id}/publish`, 'POST', {
        expectedRevision: second.issue.revision,
      })
    );
    const savedAgain = await value<SelectionSaveResult>(
      await req(
        `/issues/${second.issue.id}/selections/${second.selectionId}/save`,
        'POST',
        undefined,
        'reader'
      )
    );
    expect(savedAgain.userItemId).toBe(first.userItemId);
    expect(savedAgain.discoveryReferences).toHaveLength(2);
    expect(
      await bindings.DB.prepare('SELECT progress_position FROM user_items WHERE id=?')
        .bind(first.userItemId)
        .first()
    ).toEqual({ progress_position: 42 });
    const eventCount = await bindings.DB.prepare(
      "SELECT COUNT(*) AS n FROM personal_publication_events WHERE issue_id=? AND kind='ISSUE_PUBLISHED'"
    )
      .bind(issue.id)
      .first<{ n: number }>();
    await value(
      await req(
        `/me/issues/${issue.id}/publish`,
        'POST',
        { expectedRevision: issue.revision },
        'editor',
        key
      )
    );
    expect(eventCount?.n).toBe(1);
    expect(published.issue.status).toBe('PUBLISHED');
  });

  it('batches additions while muted, advances visits monotonically, and preserves bookmarks after editor deletion', async () => {
    const { publication } = await value<{ publication: PublicPublication }>(
      await req('/me/publication')
    );
    await value(
      await req(`/publications/${publication.id}/subscription`, 'PUT', undefined, 'reader')
    );
    const initial = await compose();
    let { issue } = await value<{ issue: OwnerIssue }>(
      await req(`/me/issues/${initial.issue.id}/publish`, 'POST', {
        expectedRevision: initial.issue.revision,
      })
    );
    await runPublicationDelivery(bindings, NOW);
    const saved = await value<SelectionSaveResult>(
      await req(
        `/issues/${issue.id}/selections/${initial.selectionId}/save`,
        'POST',
        undefined,
        'reader'
      )
    );
    await value(
      await req(`/issues/${issue.id}/visit`, 'PUT', { observedRevision: issue.revision }, 'reader')
    );
    const beforeRevision = issue.revision;
    ({ issue } = await value<{ issue: OwnerIssue }>(
      await req(`/me/issues/${issue.id}`, 'PATCH', {
        expectedRevision: issue.revision,
        operations: [2, 3].map((n) => ({
          type: 'addSelection',
          selectionId: ulid(),
          sectionId: issue.sections[0].id,
          bookmarkId: `bookmark-${n}`,
          commentary: null,
        })),
      })
    ));
    expect(
      issue.sections[0].selections.filter((s) => (s.firstPublishedRevision ?? 0) > beforeRevision)
    ).toHaveLength(2);
    await value(
      await req(`/publications/${publication.id}/subscription`, 'PATCH', { muted: true }, 'reader')
    );
    await runPublicationDelivery(bindings, NOW + 86_400_000);
    await runPublicationDelivery(bindings, NOW + 86_400_001);
    const { activities } = await value<{ activities: PublicationActivity[] }>(
      await req('/me/publication-activity', 'GET', undefined, 'reader')
    );
    expect(activities.filter((a) => a.type === 'DAILY_ADDITIONS')).toHaveLength(1);
    expect(activities.find((a) => a.type === 'DAILY_ADDITIONS')?.selectionIds).toHaveLength(2);
    const { visit } = await value<{ visit: { lastSeenRevision: number } }>(
      await req(`/issues/${issue.id}/visit`, 'PUT', { observedRevision: 1 }, 'reader')
    );
    expect(visit.lastSeenRevision).toBe(beforeRevision);
    await cleanupPublicationDelivery(bindings.DB, 'editor');
    await cleanupWeeklyRecaps(bindings.DB, 'editor');
    await deletePublicationOwner(bindings, 'editor');
    expect((await req(`/issues/${issue.id}`, 'GET', undefined, null)).status).toBe(404);
    const refs = await value<{ discoveryReferences: SelectionSaveResult['discoveryReferences'] }>(
      await req(`/bookmarks/${saved.userItemId}/discovery-references`, 'GET', undefined, 'reader')
    );
    expect(refs.discoveryReferences[0]).toMatchObject({
      publicationName: 'Loose Threads',
      commentary: 'Why I chose this.',
      available: false,
    });
    expect(
      await bindings.DB.prepare('SELECT id FROM user_items WHERE id=?')
        .bind(saved.userItemId)
        .first()
    ).not.toBeNull();
  });

  it('turns private evidence into an explicitly selected weekly draft and locks its published selection', async () => {
    await value(await req('/me/weekly-recap-preferences', 'PUT', { timezone: 'America/Chicago' }));
    await bindings.DB.prepare(
      'INSERT INTO user_item_consumption_events(id,user_id,user_item_id,item_id,event_type,occurred_at,source,metadata) VALUES(?,?,?,?,?,?,?,?)'
    )
      .bind(
        ulid(),
        'editor',
        'bookmark-1',
        'item-1',
        'OPENED',
        Date.parse('2026-10-01T18:00:00Z'),
        'ITEM_DETAIL_OPEN',
        JSON.stringify({
          version: 1,
          title: 'Private retrospective title',
          contentType: 'ARTICLE',
          provider: 'WEB',
        })
      )
      .run();
    const { recap } = await value<{ recap: WeeklyRecap }>(
      await req('/me/weekly-recaps/2026-09-27')
    );
    expect(recap.selectedCandidateIds).toEqual([]);
    const candidate = recap.candidates.find((c) => c.itemId === 'item-1');
    expect(candidate).toBeDefined();
    expect((await req('/me/weekly-recaps/2026-09-27', 'GET', undefined, null)).status).toBe(401);
    const { issue } = await value<{ issue: OwnerIssue }>(
      await req('/me/weekly-recaps/2026-09-27/issue', 'POST', {
        selectedCandidateIds: [candidate!.id],
        title: 'My week',
      })
    );
    expect(issue.kind).toBe('WEEKLY');
    expect(issue.status).toBe('DRAFT');
    expect((await req(`/issues/${issue.id}`, 'GET', undefined, null)).status).toBe(404);
    const published = await value<{ issue: OwnerIssue }>(
      await req(`/me/issues/${issue.id}/publish`, 'POST', { expectedRevision: issue.revision })
    );
    const rejected = await req(`/me/issues/${issue.id}`, 'PATCH', {
      expectedRevision: published.issue.revision,
      operations: [
        {
          type: 'addSelection',
          selectionId: ulid(),
          sectionId: issue.sections[0].id,
          bookmarkId: 'bookmark-2',
        },
      ],
    });
    expect(rejected.status).toBe(409);
    const publicIssue = await value(await req(`/issues/${issue.id}`, 'GET', undefined, null));
    expect(JSON.stringify(publicIssue)).not.toContain('Private retrospective title');
    expect(JSON.stringify(publicIssue)).not.toContain('observedAt');
    expect(
      (await new WeeklyRecapService(bindings.DB).get('reader', '2026-09-27')).candidates
    ).toEqual([]);
  });
});
