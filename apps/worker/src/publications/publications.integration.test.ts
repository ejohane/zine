import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { ulid } from 'ulid';
import routes from '../routes/api-v1/publications';
import type { Bindings, Env } from '../types';
import { PublicationService } from './service';
import { resolvePublishedSelection } from './selection-source';
import { deletePublicationOwner, publicationAvailability } from './cleanup';
import {
  publicationEvents,
  publicationEventHighWater,
  pendingPublicationEvents,
  acknowledgePublicationEvent,
  retryPublicationEvent,
} from './events';
import type { OwnerIssue, PublicPublication } from '@zine/shared';
import { PublicIssueSchema, PublicPublicationSchema, PatchIssueSchema } from '@zine/shared';
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
  c.set('requestId', 'request');
  c.set('traceId', 'trace');
  await next();
});
app.route('/api/v1', routes);
let publicationId: string, issueId: string, sectionId: string;
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
async function body(response: Response) {
  const value = (await response.json()) as {
    issue: OwnerIssue;
    publication: PublicPublication;
    subscription: { generation: number; muted: boolean };
    subscribers: unknown[];
  };
  expect(response.status, JSON.stringify(value)).toBe(200);
  return value;
}
async function create() {
  publicationId = (
    await body(
      await req('/me/publication', 'POST', {
        editorName: 'Editor',
        displayName: 'Loose Threads',
        description: null,
        coverAssetId: null,
      })
    )
  ).publication.id;
  const issue = (
    await body(
      await req('/me/publication/issues', 'POST', { kind: 'INDEPENDENT', title: 'Cities' })
    )
  ).issue;
  issueId = issue.id;
  sectionId = issue.sections[0].id;
  return issue;
}
async function add(revision = 1, bookmarkId = 'bookmark', selectionId = ulid()) {
  return body(
    await req(`/me/issues/${issueId}`, 'PATCH', {
      expectedRevision: revision,
      operations: [
        { type: 'addSelection', selectionId, sectionId, bookmarkId, commentary: 'Worth reading' },
      ],
    })
  );
}
async function publish(revision = 2, key = ulid()) {
  return req(`/me/issues/${issueId}/publish`, 'POST', { expectedRevision: revision }, 'owner', key);
}
beforeEach(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
  for (const id of ['owner', 'other'])
    await bindings.DB.prepare('INSERT INTO users(id,email,created_at,updated_at) VALUES(?,?,?,?)')
      .bind(id, `${id}@private.invalid`, '2026-10-01', '2026-10-01')
      .run();
  for (const [item, bookmark, provider] of [
    ['item', 'bookmark', 'WEB'],
    ['item2', 'bookmark2', 'WEB'],
    ['private', 'private-bookmark', 'GMAIL'],
  ]) {
    await bindings.DB.prepare(
      'INSERT INTO items(id,content_type,provider,provider_id,canonical_url,title,raw_metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)'
    )
      .bind(
        item,
        'ARTICLE',
        provider,
        item,
        `https://example.org/${item}`,
        'PRIVATE LIBRARY TITLE',
        JSON.stringify({ privateNote: 'secret' }),
        '2026-10-01',
        '2026-10-01'
      )
      .run();
    await bindings.DB.prepare(
      'INSERT INTO user_items(id,user_id,item_id,state,ingested_at,bookmarked_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)'
    )
      .bind(
        bookmark,
        'owner',
        item,
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
          '<html><head><title>Public essay</title><meta name="author" content="Public Author"></head></html>',
          { headers: { 'content-type': 'text/html' } }
        )
    )
  );
});
afterEach(() => vi.unstubAllGlobals());
describe('persisted publishing REST', () => {
  it('composes, publishes and exposes only public fetched metadata', async () => {
    await create();
    const draft = await add();
    expect(draft.issue.revision).toBe(2);
    expect((await req(`/issues/${issueId}`, 'GET', undefined, null)).status).toBe(404);
    expect((await req(`/me/issues/${issueId}`, 'GET', undefined, 'other')).status).toBe(404);
    await body(await publish());
    const publicBody = await body(await req(`/issues/${issueId}`, 'GET', undefined, null));
    expect(PublicIssueSchema.safeParse(publicBody.issue).success).toBe(true);
    const serialized = JSON.stringify(publicBody);
    for (const secret of [
      'PRIVATE LIBRARY',
      'privateNote',
      'owner@',
      'itemId',
      'bookmarkId',
      'owner_id',
      'raw_metadata',
      'bookmarkedAt',
    ])
      expect(serialized).not.toContain(secret);
    expect(publicBody.issue.sections[0].selections[0].title).toBe('Public essay');
    const events = await publicationEvents(bindings.DB);
    expect(events.map((v) => v.kind)).toEqual(['ISSUE_PUBLISHED']);
    expect(events[0].cursor).toBe(await publicationEventHighWater(bindings.DB));
    expect((await pendingPublicationEvents(bindings.DB)).length).toBe(1);
    await retryPublicationEvent(bindings.DB, events[0].id, Date.now() + 60000);
    expect(await pendingPublicationEvents(bindings.DB)).toEqual([]);
    expect((await pendingPublicationEvents(bindings.DB, Date.now() + 60001))[0].event_id).toBe(
      events[0].id
    );
    await acknowledgePublicationEvent(bindings.DB, events[0].id);
    expect(await pendingPublicationEvents(bindings.DB)).toEqual([]);
  });
  it('requires authentication and rejects bookmark PAT publishing', async () => {
    expect((await req('/me/publication', 'GET', undefined, null)).status).toBe(401);
    expect((await req('/me/publication', 'GET', undefined, 'zine_pat_bookmark')).status).toBe(403);
    expect((await req('/me/publication', 'GET', undefined, ' zine_pat_bookmark')).status).toBe(403);
  });
  it('enforces one publication and safe names', async () => {
    await create();
    expect(
      (
        await req('/me/publication', 'POST', {
          editorName: 'Other',
          displayName: null,
          description: null,
          coverAssetId: null,
        })
      ).status
    ).toBe(409);
    const p = (await body(await req(`/publications/${publicationId}`, 'GET', undefined, null)))
      .publication;
    expect(PublicPublicationSchema.safeParse(p).success).toBe(true);
    expect(JSON.stringify(p)).not.toContain('@');
  });
  it('replays create and publish without duplicate state/events and rejects key changes', async () => {
    await create();
    const key = ulid(),
      a = await body(
        await req(
          '/me/publication/issues',
          'POST',
          { kind: 'INDEPENDENT', title: 'Retry' },
          'owner',
          key
        )
      ),
      b = await body(
        await req(
          '/me/publication/issues',
          'POST',
          { kind: 'INDEPENDENT', title: 'Retry' },
          'owner',
          key
        )
      );
    expect(a.issue.id).toBe(b.issue.id);
    expect(
      (
        await req(
          '/me/publication/issues',
          'POST',
          { kind: 'INDEPENDENT', title: 'Different' },
          'owner',
          key
        )
      ).status
    ).toBe(409);
    await add();
    const pk = ulid(),
      first = await body(await publish(2, pk)),
      second = await body(await publish(2, pk));
    expect(first.issue).toEqual(second.issue);
    expect(await publicationEvents(bindings.DB)).toHaveLength(1);
  });
  it('rejects stale concurrent writes without duplicate additions', async () => {
    await create();
    const s = new PublicationService(bindings.DB),
      current = await s.repo.issue(issueId, 'owner');
    const results = await Promise.allSettled(
      ['A', 'B'].map((title) =>
        s.mutateIssue(
          'owner',
          issueId,
          {
            expectedRevision: current.issue.revision,
            operations: [{ type: 'setPresentation', title }],
          },
          ulid(),
          'patch'
        )
      )
    );
    expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((v) => v.status === 'rejected')).toHaveLength(1);
  });
  it('rejects private sources, unsafe destinations and unknown inputs', async () => {
    await create();
    const result = await req(`/me/issues/${issueId}`, 'PATCH', {
      expectedRevision: 1,
      operations: [
        { type: 'addSelection', selectionId: ulid(), sectionId, bookmarkId: 'private-bookmark' },
      ],
    });
    expect(result.status).toBe(422);
    await bindings.DB.prepare(
      "UPDATE items SET canonical_url='https://example.org/?token=secret' WHERE id='item'"
    ).run();
    expect(
      (
        await req(`/me/issues/${issueId}`, 'PATCH', {
          expectedRevision: 1,
          operations: [
            { type: 'addSelection', selectionId: ulid(), sectionId, bookmarkId: 'bookmark' },
          ],
        })
      ).status
    ).toBe(422);
    expect(
      PatchIssueSchema.safeParse({
        expectedRevision: 1,
        operations: [{ type: 'setPresentation', title: 'x', ownerId: 'other' }],
      }).success
    ).toBe(false);
  });
  it('revalidates eligibility at publish time', async () => {
    await create();
    await add();
    await bindings.DB.prepare(
      "UPDATE items SET raw_metadata='{" + '"private":true' + "}' WHERE id='item'"
    ).run();
    expect((await publish()).status).toBe(422);
    expect(await publicationEvents(bindings.DB)).toEqual([]);
  });
  it('rolls back publish and replay guard when event insertion fails', async () => {
    await create();
    await add();
    await bindings.DB.exec(
      "CREATE TRIGGER fail_publication_event BEFORE INSERT ON personal_publication_events BEGIN SELECT RAISE(ABORT,'test rollback'); END;"
    );
    await expect(
      new PublicationService(bindings.DB).mutateIssue(
        'owner',
        issueId,
        { expectedRevision: 2 },
        'rollback',
        'publish'
      )
    ).rejects.toThrow();
    expect(
      (await new PublicationService(bindings.DB).repo.issue(issueId, 'owner')).issue.status
    ).toBe('DRAFT');
    expect(
      await bindings.DB.prepare(
        "SELECT id FROM personal_publication_mutations WHERE key='rollback'"
      ).first()
    ).toBeNull();
  });
  it('keeps weekly selections closed while independent additions create events', async () => {
    await create();
    const s = new PublicationService(bindings.DB),
      weekly = (await s.createIssue(
        'owner',
        'Week',
        'weekly',
        {
          id: 'closed-week',
          timezone: 'America/Chicago',
          startAt: 1790485200000,
          endAt: 1791090000000,
        },
        ['bookmark']
      )) as { issue: OwnerIssue };
    await s.mutateIssue(
      'owner',
      weekly.issue.id,
      { expectedRevision: 1 },
      'weekly-publish',
      'publish'
    );
    await expect(
      s.mutateIssue(
        'owner',
        weekly.issue.id,
        {
          expectedRevision: 2,
          operations: [
            {
              type: 'addSelection',
              selectionId: ulid(),
              sectionId: weekly.issue.sections[0].id,
              bookmarkId: 'bookmark2',
            },
          ],
        },
        ulid(),
        'patch'
      )
    ).rejects.toMatchObject({ code: 'ISSUE_SELECTION_LOCKED' });
    await expect(
      s.createIssue('owner', 'Another', 'weekly2', {
        id: 'closed-week',
        timezone: 'America/Chicago',
        startAt: 1790485200000,
        endAt: 1791090000000,
      })
    ).rejects.toMatchObject({ code: 'WEEKLY_ISSUE_EXISTS' });
    await add();
    await body(await publish());
    await add(3, 'bookmark2');
    expect((await publicationEvents(bindings.DB)).map((v) => v.kind)).toEqual([
      'ISSUE_PUBLISHED',
      'ISSUE_PUBLISHED',
      'SELECTIONS_ADDED',
    ]);
  });
  it('supports silent corrections and complete ordering', async () => {
    await create();
    await add();
    await body(await publish());
    const updated = await body(
      await req(`/me/issues/${issueId}`, 'PATCH', {
        expectedRevision: 3,
        operations: [
          {
            type: 'setCommentary',
            selectionId: (await new PublicationService(bindings.DB).repo.issue(issueId, 'owner'))
              .selections[0].id,
            commentary: 'Correction',
          },
        ],
      })
    );
    expect(updated.issue.revision).toBe(4);
    expect((await publicationEvents(bindings.DB)).map((v) => v.kind)).toEqual([
      'ISSUE_PUBLISHED',
      'ISSUE_CORRECTED',
    ]);
    expect(
      (
        await req(`/me/issues/${issueId}`, 'PATCH', {
          expectedRevision: 4,
          operations: [{ type: 'setOrder', sections: [{ sectionId, selectionIds: [] }] }],
        })
      ).status
    ).toBe(400);
  });
  it('subscriptions are isolated, muted, ended and generation-safe', async () => {
    await create();
    expect((await req(`/publications/${publicationId}/subscription`, 'PUT')).status).toBe(409);
    let sub = (
      await body(
        await req(`/publications/${publicationId}/subscription`, 'PUT', undefined, 'other')
      )
    ).subscription;
    expect(sub.generation).toBe(1);
    sub = (
      await body(
        await req(`/publications/${publicationId}/subscription`, 'PATCH', { muted: true }, 'other')
      )
    ).subscription;
    expect(sub.muted).toBe(true);
    expect((await req('/me/publication/subscribers', 'GET', undefined, 'other')).status).toBe(404);
    expect((await body(await req('/me/publication/subscribers'))).subscribers).toHaveLength(1);
    await body(
      await req(`/publications/${publicationId}/subscription`, 'DELETE', undefined, 'other')
    );
    sub = (
      await body(
        await req(`/publications/${publicationId}/subscription`, 'PUT', undefined, 'other')
      )
    ).subscription;
    expect(sub.generation).toBe(2);
    expect(sub.muted).toBe(false);
  });
  it('deletion retains unavailable IDs and another reader bookmark', async () => {
    await create();
    const selected = (await add()).issue.sections[0].selections[0];
    await body(await publish());
    const highWater = await publicationEventHighWater(bindings.DB);
    const source = await resolvePublishedSelection(bindings.DB, issueId, selected.id);
    expect(source.itemId).toBe('item');
    expect(source.commentary).toBe('Worth reading');
    await bindings.DB.prepare(
      "INSERT INTO user_items(id,user_id,item_id,state,ingested_at,created_at,updated_at) VALUES('reader-bookmark','other','item','BOOKMARKED','2026','2026','2026')"
    ).run();
    await deletePublicationOwner(bindings, 'owner');
    expect(await publicationAvailability(bindings.DB, publicationId, issueId)).toBe(false);
    await expect(
      resolvePublishedSelection(bindings.DB, issueId, selected.id)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await req(`/issues/${issueId}`, 'GET', undefined, null)).status).toBe(404);
    expect(
      await bindings.DB.prepare("SELECT id FROM user_items WHERE id='reader-bookmark'").first()
    ).not.toBeNull();
    expect(
      await bindings.DB.prepare('SELECT id FROM personal_publications WHERE id=?')
        .bind(publicationId)
        .first()
    ).not.toBeNull();
    expect(await publicationEvents(bindings.DB)).toEqual([]);
    expect(await publicationEventHighWater(bindings.DB)).toBe(highWater);
  });
  it('covers fail explicitly without host capabilities', async () => {
    await create();
    const response = await app.request(
      '/api/v1/me/publication-assets',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer owner', 'Content-Type': 'image/png' },
        body: new Uint8Array([1, 2, 3]),
      },
      bindings
    );
    expect(response.status).toBe(503);
  });
  it('sanitizes covers and keeps draft/foreign assets private', async () => {
    await create();
    const images = {
      info: vi.fn(async () => ({ format: 'image/png', width: 400, height: 300, fileSize: 4 })),
      input: vi.fn(() => ({
        transform: vi.fn().mockReturnThis(),
        output: vi.fn(async () => ({
          image: () =>
            new Blob([new Uint8Array([255, 216, 255, 225, 0, 6, 1, 2, 3, 4, 255, 217])]).stream(),
        })),
      })),
    };
    const coverEnv = {
      ...bindings,
      PUBLICATION_MEDIA: bindings.ARTICLE_CONTENT,
      PUBLICATION_IMAGES: images as unknown as ImagesBinding,
    };
    const upload = await app.request(
      '/api/v1/me/publication-assets',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer owner', 'Content-Type': 'image/png' },
        body: new Uint8Array([1, 2, 3, 4]),
      },
      coverEnv
    );
    expect(upload.status).toBe(200);
    const { asset } = (await upload.json()) as { asset: { id: string } };
    expect((await app.request(`/api/v1/publication-assets/${asset.id}`, {}, coverEnv)).status).toBe(
      404
    );
    const preview = await app.request(
      `/api/v1/me/publication-assets/${asset.id}`,
      { headers: { Authorization: 'Bearer owner' } },
      coverEnv
    );
    expect(preview.status).toBe(200);
    expect(preview.headers.get('Cache-Control')).toBe('no-store');
    expect(new Uint8Array(await preview.arrayBuffer())).toEqual(
      new Uint8Array([255, 216, 255, 217])
    );
    expect(
      (await app.request(`/api/v1/me/publication-assets/${asset.id}`, {}, coverEnv)).status
    ).toBe(401);
    expect(
      (
        await app.request(
          `/api/v1/me/publication-assets/${asset.id}`,
          { headers: { Authorization: 'Bearer other' } },
          coverEnv
        )
      ).status
    ).toBe(404);
    const otherService = new PublicationService(bindings.DB);
    await expect(otherService.asset('other', asset.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await body(
      await req(`/me/issues/${issueId}`, 'PATCH', {
        expectedRevision: 1,
        operations: [{ type: 'setPresentation', coverAssetId: asset.id }],
      })
    );
    await add(2);
    await body(await publish(3));
    const publicAsset = await app.request(`/api/v1/publication-assets/${asset.id}`, {}, coverEnv);
    expect(publicAsset.status).toBe(200);
    expect(new Uint8Array(await publicAsset.arrayBuffer())).toEqual(
      new Uint8Array([255, 216, 255, 217])
    );
    images.info.mockResolvedValueOnce({
      format: 'image/png',
      width: 10000,
      height: 10000,
      fileSize: 4,
    });
    expect(
      (
        await app.request(
          '/api/v1/me/publication-assets',
          {
            method: 'POST',
            headers: { Authorization: 'Bearer owner', 'Content-Type': 'image/png' },
            body: new Uint8Array([1]),
          },
          coverEnv
        )
      ).status
    ).toBe(415);
    expect(
      (
        await app.request(
          '/api/v1/me/publication-assets',
          {
            method: 'POST',
            headers: { Authorization: 'Bearer owner', 'Content-Type': 'text/html' },
            body: 'html',
          },
          coverEnv
        )
      ).status
    ).toBe(415);
    const deletionKey = ulid();
    const deletionRequest = () =>
      app.request(
        `/api/v1/me/issues/${issueId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: 'Bearer owner',
            'Content-Type': 'application/json',
            'Idempotency-Key': deletionKey,
          },
          body: JSON.stringify({ expectedRevision: 4 }),
        },
        coverEnv
      );
    expect((await deletionRequest()).status).toBe(200);
    expect((await deletionRequest()).status).toBe(200);
    expect((await bindings.ARTICLE_CONTENT.list({ prefix: 'covers/' })).objects).toEqual([]);
    expect(
      (
        await bindings.DB.prepare('SELECT heading FROM personal_issue_sections WHERE issue_id=?')
          .bind(issueId)
          .all()
      ).results.every((v) => v.heading === null)
    ).toBe(true);
    await deletePublicationOwner(coverEnv, 'owner');
    expect((await app.request(`/api/v1/publication-assets/${asset.id}`, {}, coverEnv)).status).toBe(
      404
    );
    expect((await bindings.ARTICLE_CONTENT.list({ prefix: 'covers/' })).objects).toEqual([]);
  });
  it('suppresses newly private source metadata after publication', async () => {
    await create();
    await add();
    await body(await publish());
    await bindings.DB.prepare(
      `UPDATE items SET raw_metadata='{"private":true}' WHERE id='item'`
    ).run();
    const result = await body(await req(`/issues/${issueId}`, 'GET', undefined, null));
    expect(result.issue.sections).toEqual([]);
  });
  it('supports public newsletter editions using independent public metadata', async () => {
    await create();
    await bindings.DB.prepare(
      `UPDATE items SET raw_metadata='{"publicWebUrl":"https://example.org/public-edition"}' WHERE id='private'`
    ).run();
    const result = await add(1, 'private-bookmark');
    expect(result.issue.sections[0].selections[0].originalUrl).toBe(
      'https://example.org/public-edition'
    );
    expect(JSON.stringify(result.issue)).not.toContain('PRIVATE LIBRARY TITLE');
  });
  it('publishes corrections without treating transient additions as new', async () => {
    await create();
    await add();
    await body(await publish());
    const sid = ulid();
    await body(
      await req(`/me/issues/${issueId}`, 'PATCH', {
        expectedRevision: 3,
        operations: [
          { type: 'addSelection', selectionId: sid, sectionId, bookmarkId: 'bookmark2' },
          { type: 'removeSelection', selectionId: sid },
        ],
      })
    );
    expect((await publicationEvents(bindings.DB)).map((e) => e.kind)).toEqual([
      'ISSUE_PUBLISHED',
      'ISSUE_CORRECTED',
    ]);
  });
  it('retains a previously verified selection when its original disappears', async () => {
    await create();
    await add();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('gone', { status: 404 }))
    );
    const result = await body(await publish());
    expect(result.issue.sections[0].selections[0].originalAvailability).toBe('UNAVAILABLE');
  });
  it('handles larger issues without exceeding D1 parameter limits', async () => {
    await create();
    const operations = [];
    for (let n = 0; n < 25; n++) {
      const item = `bulk-${n}`,
        bookmark = `bulk-bookmark-${n}`;
      await bindings.DB.batch([
        bindings.DB.prepare(
          'INSERT INTO items(id,content_type,provider,provider_id,canonical_url,title,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)'
        ).bind(
          item,
          'ARTICLE',
          'WEB',
          item,
          `https://example.org/${item}`,
          'Library',
          '2026',
          '2026'
        ),
        bindings.DB.prepare(
          'INSERT INTO user_items(id,user_id,item_id,state,ingested_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)'
        ).bind(bookmark, 'owner', item, 'BOOKMARKED', '2026', '2026', '2026'),
      ]);
      operations.push({
        type: 'addSelection',
        selectionId: ulid(),
        sectionId,
        bookmarkId: bookmark,
      });
    }
    const result = await body(
      await req(`/me/issues/${issueId}`, 'PATCH', { expectedRevision: 1, operations })
    );
    expect(result.issue.sections[0].selections).toHaveLength(25);
    await body(await publish());
  });
});
