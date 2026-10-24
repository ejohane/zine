import { ContentType, Provider } from '@zine/shared';
import { extractArticle } from '../lib/article-extractor';
import { fetchLinkPreview } from '../lib/link-preview';
import type * as LinkPreviewModule from '../lib/link-preview';
import { expectLoggerErrorCalls } from '../test/mock-logger';
import { applyD1Migrations, env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { app } from '../index';
import { dispatchBookmarkEnrichment, getBookmarkEnrichmentHealth } from '../enrichment/outbox';
import { createDb } from '../db';
import {
  bookmarkEnrichmentOutbox,
  rssFeeds,
  rssFeedItems,
  apiTokens,
  tags,
  userItemTags,
  creators,
  collections,
  items,
  itemEnrichments,
  userPeople,
  userPersonMentions,
  userItemConsumptionEvents,
  userItems,
  users,
} from '../db/schema';
import { ENRICHMENT_SCHEMA_VERSION } from '../enrichment/types';
import { hashApiToken } from '../lib/api-tokens';
import type { Bindings } from '../types';
import type * as AuthModule from '../lib/auth';

// These bookmark journeys never call YouTube. Keep its Node-only SDK out of the
// unbundled test runtime; auth, routing, tRPC procedures, and D1 remain real.
vi.mock('googleapis', () => ({ google: {} }));
vi.mock('../lib/link-preview', () => ({ fetchLinkPreview: vi.fn() }));
vi.mock('../lib/article-extractor', () => ({ extractArticle: vi.fn() }));

// Clerk's remote verifier is the only auth boundary stubbed for the tRPC HTTP
// tests. Middleware, procedures, REST PAT verification, and D1 are exercised.
vi.mock('../lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthModule>()),
  verifyClerkToken: vi.fn(async () => ({
    success: true,
    userId: 'owner',
    payload: { sub: 'owner' },
  })),
}));

const token = 'zine_pat_route_integration';
const now = '2026-09-06T12:00:00.000Z';
const bindings = env as unknown as Bindings & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};
const db = createDb(bindings.DB);

async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  requestBindings: Bindings = bindings
) {
  return app.request(
    `/api/v1${path}`,
    {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    requestBindings
  );
}

async function toggle(id: string) {
  return app.request(
    '/trpc/items.toggleFinished',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer test-clerk-session', 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { id } }),
    },
    bindings
  );
}

afterEach(() => vi.useRealTimers());

beforeEach(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
  await db
    .insert(users)
    .values(['owner', 'other'].map((id) => ({ id, createdAt: now, updatedAt: now })));
  await db.insert(apiTokens).values({
    id: 'token',
    userId: 'owner',
    name: 'Integration',
    tokenHash: await hashApiToken(token),
    tokenPrefix: 'zine_pat_route',
    scopesJson: JSON.stringify(['bookmarks:read', 'bookmarks:write']),
    createdAt: Date.now(),
  });
  await db.insert(items).values({
    id: 'item',
    contentType: 'VIDEO',
    provider: 'YOUTUBE',
    providerId: 'video',
    canonicalUrl: 'https://www.youtube.com/watch?v=video',
    title: 'Route integration fixture',
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(userItems).values(
    ['owner', 'other'].map((userId) => ({
      id: `${userId}-bookmark`,
      userId,
      itemId: 'item',
      state: 'BOOKMARKED',
      ingestedAt: now,
      bookmarkedAt: now,
      createdAt: now,
      updatedAt: now,
    }))
  );
});

describe('assembled Worker REST API with D1', () => {
  it('previews, replaces and clears Home Lab through authenticated REST and the native Home read path', async () => {
    const original = {
      version: 1,
      sections: [
        {
          id: 'watch',
          title: 'Watch next',
          layout: 'horizontal',
          card: 'landscape',
          itemIds: ['owner-bookmark'],
        },
        {
          id: 'shortlist',
          title: 'Shortlist',
          layout: 'vertical',
          card: 'row',
          itemIds: ['owner-bookmark'],
        },
      ],
    };
    expect((await request('/home/components')).status).toBe(200);
    expect(await (await request('/home/composition')).json()).toMatchObject({ composition: null });
    const preview = await request('/home/composition/preview', 'POST', { composition: original });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({ valid: true, composition: original });
    expect(await (await request('/home/composition')).json()).toMatchObject({ composition: null });
    expect(
      await (await request('/home/composition', 'PUT', { composition: original })).json()
    ).toMatchObject({ published: true, verified: true });
    expect(await (await request('/home')).json()).toMatchObject({ composition: original });
    const replacement = {
      ...original,
      sections: [
        {
          id: 'new',
          title: 'New page',
          layout: 'two_column',
          card: 'grid',
          itemIds: ['owner-bookmark'],
        },
      ],
    };
    expect((await request('/home/composition', 'PUT', { composition: replacement })).status).toBe(
      200
    );
    expect(await (await request('/home')).json()).toMatchObject({ composition: replacement });
    expect(
      (
        await request('/home/composition', 'PUT', {
          composition: {
            ...original,
            sections: [{ ...original.sections[0], itemIds: ['other-bookmark'] }],
          },
        })
      ).status
    ).toBe(422);
    expect(await (await request('/home/composition')).json()).toMatchObject({
      composition: replacement,
    });
    await db
      .update(apiTokens)
      .set({ scopesJson: JSON.stringify(['bookmarks:read']) })
      .where(eq(apiTokens.id, 'token'));
    expect(
      (await request('/home/composition/preview', 'POST', { composition: original })).status
    ).toBe(200);
    expect((await request('/home/composition', 'PUT', { composition: original })).status).toBe(403);
    await db
      .update(apiTokens)
      .set({ scopesJson: JSON.stringify(['bookmarks:read', 'bookmarks:write']) })
      .where(eq(apiTokens.id, 'token'));
    expect(
      (await request('/home/composition', 'PUT', { composition: { version: 1, sections: [] } }))
        .status
    ).toBe(200);
    expect(await (await request('/home')).json()).toMatchObject({
      composition: { version: 1, sections: [] },
      compositionItems: [],
    });
    expect(await db.select().from(collections)).toEqual([]);
    expect((await db.select().from(userItems)).length).toBe(2);
  });

  it('rejects unauthenticated or malformed Home Lab publication', async () => {
    expect(
      (await app.request('/api/v1/home/composition', { method: 'PUT' }, bindings)).status
    ).toBe(401);
    expect(
      (
        await request('/home/composition', 'PUT', {
          composition: { version: 1, sections: [], userId: 'other' },
        })
      ).status
    ).toBe(400);
  });

  it('persists finish and unfinish, emits one event per change, and reads back through tRPC-backed REST', async () => {
    const finish = await request('/bookmarks/owner-bookmark', 'PATCH', { isFinished: true });
    expect(finish.status).toBe(200);
    const first = await db.query.userItems.findFirst({ where: eq(userItems.id, 'owner-bookmark') });
    expect(first).toMatchObject({ isFinished: true, finishedAt: expect.any(String) });

    expect((await request('/bookmarks/owner-bookmark', 'PATCH', { isFinished: true })).status).toBe(
      200
    );
    expect(await db.select().from(userItemConsumptionEvents)).toHaveLength(1);
    const read = await request('/bookmarks/owner-bookmark');
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      item: { isFinished: true, finishedAt: first!.finishedAt },
    });

    expect(
      (await request('/bookmarks/owner-bookmark', 'PATCH', { isFinished: false })).status
    ).toBe(200);
    expect(
      await db.query.userItems.findFirst({ where: eq(userItems.id, 'owner-bookmark') })
    ).toMatchObject({ isFinished: false, finishedAt: null });
    const events = await db.select().from(userItemConsumptionEvents);
    expect(events.map((event) => event.eventType).sort()).toEqual(['FINISHED', 'UNFINISHED']);
    expect(
      events.every((event) => event.userId === 'owner' && event.userItemId === 'owner-bookmark')
    ).toBe(true);
  });

  it.each(['INBOX', 'ARCHIVED'])(
    'saves and finishes an unsaved %s item, with idempotent retries',
    async (state) => {
      await db
        .update(userItems)
        .set({ state, bookmarkedAt: null })
        .where(eq(userItems.id, 'owner-bookmark'));
      expect(
        (await request('/bookmarks/owner-bookmark', 'PATCH', { isFinished: true })).status
      ).toBe(200);
      const saved = await db.query.userItems.findFirst({
        where: eq(userItems.id, 'owner-bookmark'),
      });
      expect(saved).toMatchObject({
        state: 'BOOKMARKED',
        bookmarkedAt: expect.any(String),
        isFinished: true,
        finishedAt: expect.any(String),
      });
      expect(
        (await request('/bookmarks/owner-bookmark', 'PATCH', { isFinished: true })).status
      ).toBe(200);
      expect(
        await db.query.userItems.findFirst({ where: eq(userItems.id, 'owner-bookmark') })
      ).toEqual(saved);
      expect(
        (await db.select().from(userItemConsumptionEvents)).map((event) => event.eventType).sort()
      ).toEqual(['FINISHED', 'SAVED']);
      expect(await (await request('/bookmarks/owner-bookmark')).json()).toMatchObject({
        item: { state: 'BOOKMARKED', isFinished: true },
      });
      expect(
        (await request('/bookmarks/owner-bookmark', 'PATCH', { isFinished: false })).status
      ).toBe(200);
      expect(
        await db.query.userItems.findFirst({ where: eq(userItems.id, 'owner-bookmark') })
      ).toMatchObject({ state: 'BOOKMARKED', isFinished: false });
    }
  );

  it('does not save an inbox item when marking unfinished', async () => {
    await db
      .update(userItems)
      .set({ state: 'INBOX', bookmarkedAt: null })
      .where(eq(userItems.id, 'owner-bookmark'));
    expect(
      (await request('/bookmarks/owner-bookmark', 'PATCH', { isFinished: false })).status
    ).toBe(404);
    expect(
      await db.query.userItems.findFirst({ where: eq(userItems.id, 'owner-bookmark') })
    ).toMatchObject({ state: 'INBOX', bookmarkedAt: null, isFinished: false });
    expect(await db.select().from(userItemConsumptionEvents)).toHaveLength(0);
  });

  it('rejects cross-user reads and mutations without changing data or emitting events', async () => {
    expect((await request('/bookmarks/other-bookmark')).status).toBe(404);
    expect((await request('/bookmarks/other-bookmark', 'PATCH', { isFinished: true })).status).toBe(
      404
    );
    expect(
      await db.query.userItems.findFirst({ where: eq(userItems.id, 'other-bookmark') })
    ).toMatchObject({ isFinished: false, finishedAt: null });
    expect(await db.select().from(userItemConsumptionEvents)).toHaveLength(0);
  });

  it('rejects malformed mutations and read-only tokens before changing data', async () => {
    expect(
      (await request('/bookmarks/owner-bookmark', 'PATCH', { isFinished: 'true' })).status
    ).toBe(400);
    await db
      .update(apiTokens)
      .set({ scopesJson: JSON.stringify(['bookmarks:read']) })
      .where(eq(apiTokens.id, 'token'));
    expect((await request('/bookmarks/owner-bookmark', 'PATCH', { isFinished: true })).status).toBe(
      403
    );
    expect(
      await db.query.userItems.findFirst({ where: eq(userItems.id, 'owner-bookmark') })
    ).toMatchObject({ isFinished: false });
    expect(await db.select().from(userItemConsumptionEvents)).toHaveLength(0);
  });
});

describe('finish contracts across REST and tRPC HTTP', () => {
  it.each(['INBOX', 'BOOKMARKED', 'ARCHIVED'])(
    'toggles %s items twice with fresh timestamps and one event per toggle',
    async (state) => {
      await db
        .update(userItems)
        .set({ state, finishedAt: now })
        .where(eq(userItems.id, 'owner-bookmark'));
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-06T13:00:00.000Z'));
      const first = await toggle('owner-bookmark');
      expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({
        result: {
          data: {
            json: {
              success: true,
              isFinished: true,
              finishedAt: '2026-09-06T13:00:00.000Z',
            },
          },
        },
      });
      expect(
        await db.query.userItems.findFirst({ where: eq(userItems.id, 'owner-bookmark') })
      ).toMatchObject({
        state,
        isFinished: true,
        finishedAt: '2026-09-06T13:00:00.000Z',
        updatedAt: '2026-09-06T13:00:00.000Z',
      });
      vi.setSystemTime(new Date('2026-09-06T13:01:00.000Z'));
      const second = await toggle('owner-bookmark');
      expect(second.status).toBe(200);
      expect(await second.json()).toMatchObject({
        result: { data: { json: { success: true, isFinished: false, finishedAt: null } } },
      });
      expect(
        await db.query.userItems.findFirst({ where: eq(userItems.id, 'owner-bookmark') })
      ).toMatchObject({
        state,
        isFinished: false,
        finishedAt: null,
        updatedAt: '2026-09-06T13:01:00.000Z',
      });
      expect(
        await db
          .select()
          .from(userItemConsumptionEvents)
          .orderBy(userItemConsumptionEvents.occurredAt)
      ).toMatchObject([
        {
          eventType: 'FINISHED',
          occurredAt: Date.parse('2026-09-06T13:00:00Z'),
          source: 'MANUAL_FINISH_TOGGLE',
          metadata: JSON.stringify({
            version: 1,
            title: 'Route integration fixture',
            creatorName: null,
            contentType: 'VIDEO',
            provider: 'YOUTUBE',
            artworkUrl: null,
          }),
          userId: 'owner',
          itemId: 'item',
          userItemId: 'owner-bookmark',
        },
        {
          eventType: 'UNFINISHED',
          occurredAt: Date.parse('2026-09-06T13:01:00Z'),
          source: 'MANUAL_FINISH_TOGGLE',
          metadata: JSON.stringify({
            version: 1,
            title: 'Route integration fixture',
            creatorName: null,
            contentType: 'VIDEO',
            provider: 'YOUTUBE',
            artworkUrl: null,
          }),
        },
      ]);
    }
  );

  it.each(['INBOX', 'ARCHIVED'])('REST rejects unfinishing unsaved %s items', async (state) => {
    await db.update(userItems).set({ state }).where(eq(userItems.id, 'owner-bookmark'));
    const response = await request('/bookmarks/owner-bookmark', 'PATCH', { isFinished: false });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: 'BOOKMARK_NOT_FOUND',
      error: 'Bookmark not found',
    });
    expect(await db.select().from(userItemConsumptionEvents)).toHaveLength(0);
    expect(
      await db.query.userItems.findFirst({ where: eq(userItems.id, 'owner-bookmark') })
    ).toMatchObject({ state, isFinished: false, updatedAt: now });
  });

  it.each(['other-bookmark', 'missing'])(
    'tRPC rejects inaccessible item %s without writes',
    async (id) => {
      const response = await toggle(id);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: { json: { message: 'Item not found', data: { code: 'NOT_FOUND' } } },
      });
      expect(await db.select().from(userItemConsumptionEvents)).toHaveLength(0);
      expect(
        (await db.select().from(userItems)).every(
          (item) => !item.isFinished && item.updatedAt === now
        )
      ).toBe(true);
    }
  );

  it('preserves REST timestamps and event metadata, including repeated set requests', async () => {
    await db.update(userItems).set({ finishedAt: now }).where(eq(userItems.id, 'owner-bookmark'));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-06T13:00:00Z'));
    const first = await request('/bookmarks/owner-bookmark', 'PATCH', { isFinished: true });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      bookmark: { id: 'owner-bookmark', itemId: 'item', isFinished: true, finishedAt: now },
    });
    const before = await db.query.userItems.findFirst({
      where: eq(userItems.id, 'owner-bookmark'),
    });
    vi.setSystemTime(new Date('2026-09-06T13:01:00Z'));
    expect((await request('/bookmarks/owner-bookmark', 'PATCH', { isFinished: true })).status).toBe(
      200
    );
    expect(
      await db.query.userItems.findFirst({ where: eq(userItems.id, 'owner-bookmark') })
    ).toEqual(before);
    expect(await db.select().from(userItemConsumptionEvents)).toMatchObject([
      {
        eventType: 'FINISHED',
        occurredAt: Date.parse('2026-09-06T13:00:00Z'),
        metadata: JSON.stringify({
          version: 1,
          title: 'Route integration fixture',
          creatorName: null,
          contentType: 'VIDEO',
          provider: 'YOUTUBE',
          artworkUrl: null,
          source: 'api_v1',
        }),
        source: 'MANUAL_FINISH_TOGGLE',
      },
    ]);
  });

  it('saves an already finished unsaved item without duplicating its consumption event', async () => {
    await db
      .update(userItems)
      .set({ state: 'ARCHIVED', isFinished: true, finishedAt: now, bookmarkedAt: null })
      .where(eq(userItems.id, 'owner-bookmark'));
    const response = await request('/bookmarks/owner-bookmark', 'PATCH', { isFinished: true });
    expect(response.status).toBe(200);
    expect(
      await db.query.userItems.findFirst({ where: eq(userItems.id, 'owner-bookmark') })
    ).toMatchObject({
      state: 'BOOKMARKED',
      isFinished: true,
      finishedAt: now,
      bookmarkedAt: expect.any(String),
    });
    expect(await db.select().from(userItemConsumptionEvents)).toMatchObject([
      { eventType: 'SAVED' },
    ]);
  });

  it('shares persisted state across REST sets and tRPC toggles', async () => {
    expect((await request('/bookmarks/owner-bookmark', 'PATCH', { isFinished: true })).status).toBe(
      200
    );
    expect((await toggle('owner-bookmark')).status).toBe(200);
    const read = await request('/bookmarks/owner-bookmark');
    expect(await read.json()).toMatchObject({ item: { isFinished: false, finishedAt: null } });
    expect(await db.select().from(userItemConsumptionEvents)).toHaveLength(2);
    expect(
      (await request('/bookmarks/owner-bookmark', 'PATCH', { isFinished: false })).status
    ).toBe(200);
    expect(await db.select().from(userItemConsumptionEvents)).toHaveLength(2);
  });
});

describe.each(['REST', 'tRPC'] as const)('%s library state operations with D1', (api) => {
  const send = vi.fn(async () => {});
  async function mutate(operation: 'bookmark' | 'archive' | 'unbookmark', id = 'owner-bookmark') {
    const requestBindings = { ...bindings, ENRICHMENT_QUEUE: { send } as unknown as Queue };
    const path =
      api === 'tRPC'
        ? `/trpc/items.${operation}`
        : operation === 'unbookmark'
          ? `/api/v1/bookmarks/${id}`
          : `/api/v1/inbox/${id}/${operation}`;
    return app.request(
      path,
      {
        method: api === 'REST' && operation === 'unbookmark' ? 'DELETE' : 'POST',
        headers: {
          Authorization: `Bearer ${api === 'REST' ? token : 'test-clerk-session'}`,
          'Content-Type': 'application/json',
        },
        ...(api === 'tRPC' ? { body: JSON.stringify({ json: { id } }) } : {}),
      },
      requestBindings as Bindings
    );
  }
  const read = () => db.query.userItems.findFirst({ where: eq(userItems.id, 'owner-bookmark') });
  beforeEach(async () => {
    send.mockReset();
    await db.insert(itemEnrichments).values({
      id: 'enrichment',
      itemId: 'item',
      schemaVersion: ENRICHMENT_SCHEMA_VERSION,
      contentHash: 'fixture',
      status: 'COMPLETE',
      entitiesJson: JSON.stringify([{ name: 'Test Person', type: 'PERSON', confidence: 0.9 }]),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  it.each(['INBOX', 'BOOKMARKED', 'ARCHIVED'])(
    'bookmarks %s, queues only Inbox transitions, and indexes People',
    async (state) => {
      await db
        .update(userItems)
        .set({ state, archivedAt: now, isFinished: true, finishedAt: now })
        .where(eq(userItems.id, 'owner-bookmark'));
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
      expect((await mutate('bookmark')).status).toBe(200);
      expect(await read()).toMatchObject({
        state: 'BOOKMARKED',
        bookmarkedAt: state === 'BOOKMARKED' ? now : '2026-09-07T12:00:00.000Z',
        updatedAt: state === 'BOOKMARKED' ? now : '2026-09-07T12:00:00.000Z',
        archivedAt: now,
        isFinished: true,
        finishedAt: now,
      });
      expect(send).toHaveBeenCalledTimes(state === 'INBOX' ? 1 : 0);
      if (state === 'INBOX')
        expect(send).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'owner',
            userItemId: 'owner-bookmark',
            itemId: 'item',
            trigger: 'inbox_bookmark',
          })
        );
      expect(await db.select().from(userPeople)).toMatchObject([{ userId: 'owner', itemCount: 1 }]);
      expect(await db.select().from(userPersonMentions)).toMatchObject([{ isActive: true }]);
      vi.setSystemTime(new Date('2026-09-07T12:01:00Z'));
      expect((await mutate('bookmark')).status).toBe(200);
      expect(await read()).toMatchObject({
        bookmarkedAt: state === 'BOOKMARKED' ? now : '2026-09-07T12:00:00.000Z',
      });
      expect(send).toHaveBeenCalledTimes(state === 'INBOX' ? 1 : 0);
      expect(await db.select().from(userPeople)).toMatchObject([{ itemCount: 1 }]);
      expect(await db.select().from(userItemConsumptionEvents)).toMatchObject(
        state === 'BOOKMARKED' ? [] : [{ eventType: 'SAVED' }]
      );
    }
  );

  it.each(['archive', 'unbookmark'] as const)(
    '%s deactivates People and preserves its timestamp rules',
    async (operation) => {
      expect((await mutate('bookmark')).status).toBe(200);
      const savedAt = (await read())!.bookmarkedAt;
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-07T12:00:00Z'));
      expect((await mutate(operation)).status).toBe(200);
      expect(await read()).toMatchObject({
        state: 'ARCHIVED',
        archivedAt: '2026-09-07T12:00:00.000Z',
        updatedAt: '2026-09-07T12:00:00.000Z',
        bookmarkedAt: operation === 'archive' ? savedAt : null,
      });
      expect(await db.select().from(userPeople)).toMatchObject([{ itemCount: 0 }]);
      expect(await db.select().from(userPersonMentions)).toMatchObject([{ isActive: false }]);
      expect((await mutate(operation)).status).toBe(operation === 'archive' ? 200 : 400);
      expect((await mutate('bookmark')).status).toBe(200);
      expect(await db.select().from(userPersonMentions)).toMatchObject([{ isActive: true }]);
      expect(await db.select().from(userPeople)).toMatchObject([{ itemCount: 1 }]);
      expect(send).not.toHaveBeenCalled();
      expect(await db.select().from(userItemConsumptionEvents)).toMatchObject([
        { eventType: 'SAVED' },
      ]);
    }
  );

  it.each(['INBOX', 'ARCHIVED'])(
    'archives %s without changing saved or finished fields',
    async (state) => {
      await db
        .update(userItems)
        .set({ state, bookmarkedAt: null, isFinished: true, finishedAt: now })
        .where(eq(userItems.id, 'owner-bookmark'));
      expect((await mutate('archive')).status).toBe(200);
      expect(await read()).toMatchObject({
        state: 'ARCHIVED',
        bookmarkedAt: null,
        isFinished: true,
        finishedAt: now,
      });
      expect(send).not.toHaveBeenCalled();
    }
  );

  it('returns success, indexes People, and durably retries failed enrichment delivery', async () => {
    await db
      .update(userItems)
      .set({ state: 'INBOX', bookmarkedAt: null })
      .where(eq(userItems.id, 'owner-bookmark'));
    vi.useFakeTimers({ toFake: ['Date'] });
    const startedAt = Date.now();
    send.mockRejectedValueOnce(new Error('Queue unavailable'));
    expect((await mutate('bookmark')).status).toBe(200);
    expect(await read()).toMatchObject({ state: 'BOOKMARKED', bookmarkedAt: expect.any(String) });
    expect(await db.select().from(userPeople)).toMatchObject([{ itemCount: 1 }]);
    expect(await db.select().from(bookmarkEnrichmentOutbox)).toMatchObject([
      { userId: 'owner', userItemId: 'owner-bookmark', trigger: 'inbox_bookmark' },
    ]);
    expect((await mutate('bookmark')).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1); // respect the retry delay
    expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(1);
    vi.setSystemTime(startedAt + 5 * 60 * 1000);
    const jobs: Promise<unknown>[] = [];
    await worker.scheduled(
      { cron: '*/5 * * * *' } as ScheduledEvent,
      { ...bindings, ENRICHMENT_QUEUE: { send } as unknown as Queue } as Bindings,
      { waitUntil: (job: Promise<unknown>) => jobs.push(job) } as unknown as ExecutionContext
    );
    await Promise.all(jobs);
    expect(send).toHaveBeenCalledTimes(2);
    expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(0);
  });

  it('rolls back the save if its durable enrichment intent cannot be written', async () => {
    await db
      .update(userItems)
      .set({ state: 'INBOX', bookmarkedAt: null })
      .where(eq(userItems.id, 'owner-bookmark'));
    const before = await read();
    await bindings.DB.prepare(
      "CREATE TRIGGER reject_enrichment_intent BEFORE INSERT ON bookmark_enrichment_outbox BEGIN SELECT RAISE(ABORT, 'test failure'); END"
    ).run();
    try {
      expect((await mutate('bookmark')).status).toBe(500);
      if (api === 'REST') expectLoggerErrorCalls([['Unhandled error']]);
      expect(await read()).toEqual(before);
      expect(send).not.toHaveBeenCalled();
      expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(0);
    } finally {
      await bindings.DB.prepare('DROP TRIGGER reject_enrichment_intent').run();
    }
  });

  it.each(['INBOX', 'ARCHIVED'])('rejects unbookmark of %s without writes', async (state) => {
    await db.update(userItems).set({ state }).where(eq(userItems.id, 'owner-bookmark'));
    const before = await read();
    const response = await mutate('unbookmark');
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject(
      api === 'REST'
        ? { code: 'BAD_REQUEST', error: 'Item is not bookmarked' }
        : { error: { json: { message: 'Item is not bookmarked', data: { code: 'BAD_REQUEST' } } } }
    );
    expect(await read()).toEqual(before);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['bookmark', 'archive', 'unbookmark'] as const)(
    '%s rejects missing and foreign items without writes',
    async (operation) => {
      const before = await db.select().from(userItems);
      for (const id of ['missing', 'other-bookmark']) {
        const response = await mutate(operation, id);
        expect(response.status).toBe(404);
        const message = operation === 'unbookmark' ? 'Item not found' : `Item ${id} not found`;
        expect(await response.json()).toMatchObject(
          api === 'REST'
            ? { code: 'NOT_FOUND', error: message }
            : { error: { json: { message, data: { code: 'NOT_FOUND' } } } }
        );
      }
      expect(await db.select().from(userItems)).toEqual(before);
      expect(send).not.toHaveBeenCalled();
      expect(await db.select().from(userPeople)).toHaveLength(0);
    }
  );
});

describe('durable manual saves and enrichment delivery', () => {
  const input = {
    url: 'https://www.youtube.com/watch?v=video',
    canonicalUrl: 'https://www.youtube.com/watch?v=video',
    title: 'Fixture',
    provider: 'YOUTUBE',
    contentType: 'VIDEO',
    providerId: 'video',
    thumbnailUrl: null,
    creator: 'Test Creator',
    duration: 120,
  };
  const send = vi.fn(async () => {});
  const queueBindings = () =>
    ({ ...bindings, ENRICHMENT_QUEUE: { send } as unknown as Queue }) as Bindings;
  const context = () => ({ db, env: queueBindings(), requestId: 'test', traceId: 'test' });
  const save = () =>
    app.request(
      '/trpc/bookmarks.save',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer test-clerk-session', 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: input }),
      },
      queueBindings()
    );
  beforeEach(() => send.mockReset());

  it.each(['INBOX', 'ARCHIVED', 'new'])(
    'keeps %s manual saves successful across queue failure and retry',
    async (state) => {
      if (state === 'new') await db.delete(userItems).where(eq(userItems.id, 'owner-bookmark'));
      else await db.update(userItems).set({ state }).where(eq(userItems.id, 'owner-bookmark'));
      vi.useFakeTimers({ toFake: ['Date'] });
      const now = Date.now();
      send.mockRejectedValueOnce(new Error('Queue unavailable'));
      const result = await save();
      expect(result.status).toBe(200);
      const saved = await db.query.userItems.findFirst({ where: eq(userItems.userId, 'owner') });
      expect(saved).toMatchObject({ state: 'BOOKMARKED' });
      expect(await db.select().from(bookmarkEnrichmentOutbox)).toMatchObject([
        { userItemId: saved!.id, trigger: 'manual_save' },
      ]);
      expect((await save()).status).toBe(200);
      expect(send).toHaveBeenCalledTimes(1);
      vi.setSystemTime(now + 5 * 60 * 1000);
      expect((await save()).status).toBe(200);
      expect(send).toHaveBeenCalledTimes(2);
      expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(0);
    }
  );

  it('keeps pending work when no queue is configured and recovers once it is available', async () => {
    const { bookmarkEnrichmentIntent } = await import('../enrichment/outbox');
    await bookmarkEnrichmentIntent(db, {
      userId: 'owner',
      userItemId: 'owner-bookmark',
      itemId: 'item',
      trigger: 'inbox_bookmark',
    });
    await dispatchBookmarkEnrichment({
      ...context(),
      env: { ...bindings, ENRICHMENT_QUEUE: undefined },
    });
    expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(1);
    await dispatchBookmarkEnrichment(context());
    expect(send).toHaveBeenCalledTimes(1);
    expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(0);
  });

  it('claims pending work once across overlapping dispatchers and limits request retries to the owner', async () => {
    const { bookmarkEnrichmentIntent } = await import('../enrichment/outbox');
    for (const userId of ['owner', 'other'])
      await bookmarkEnrichmentIntent(db, {
        userId,
        userItemId: `${userId}-bookmark`,
        itemId: 'item',
        trigger: 'inbox_bookmark',
      });
    await Promise.all([
      dispatchBookmarkEnrichment(context(), { userId: 'owner', userItemId: 'owner-bookmark' }),
      dispatchBookmarkEnrichment(context(), { userId: 'owner', userItemId: 'owner-bookmark' }),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await db.select().from(bookmarkEnrichmentOutbox)).toMatchObject([{ userId: 'other' }]);
    await dispatchBookmarkEnrichment(context());
    expect(send).toHaveBeenCalledTimes(2);
    expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(0);
  });

  it('recovers an expired claim after a Worker interruption', async () => {
    const { bookmarkEnrichmentIntent } = await import('../enrichment/outbox');
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = Date.now();
    await bookmarkEnrichmentIntent(db, {
      userId: 'owner',
      userItemId: 'owner-bookmark',
      itemId: 'item',
      trigger: 'inbox_bookmark',
    });
    await db.update(bookmarkEnrichmentOutbox).set({ nextAttemptAt: now + 5 * 60 * 1000 });
    await dispatchBookmarkEnrichment(context());
    expect(send).not.toHaveBeenCalled();
    vi.setSystemTime(now + 5 * 60 * 1000);
    await dispatchBookmarkEnrichment(context());
    expect(send).toHaveBeenCalledTimes(1);
    expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(0);
  });
  it('exposes pending age without identities and recovers health after delivery', async () => {
    const { bookmarkEnrichmentIntent } = await import('../enrichment/outbox');
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = Date.now();
    await bookmarkEnrichmentIntent(db, {
      userId: 'owner',
      userItemId: 'owner-bookmark',
      itemId: 'item',
      trigger: 'inbox_bookmark',
    });
    expect(await getBookmarkEnrichmentHealth(queueBindings())).toEqual({
      status: 'ok',
      configured: true,
      pending: 1,
      oldestAt: now,
    });
    vi.setSystemTime(now + 31 * 60 * 1000);
    expect(await getBookmarkEnrichmentHealth(queueBindings())).toMatchObject({
      status: 'degraded',
      pending: 1,
    });
    await dispatchBookmarkEnrichment(context());
    expect(await getBookmarkEnrichmentHealth(queueBindings())).toEqual({
      status: 'ok',
      configured: true,
      pending: 0,
      oldestAt: null,
    });
  });
});

describe('REST completion saves with durable enrichment and People', () => {
  const send = vi.fn(async () => {});
  const complete = (id = 'owner-bookmark', isFinished = true) =>
    app.request(
      `/api/v1/bookmarks/${id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFinished }),
      },
      { ...bindings, ENRICHMENT_QUEUE: { send } } as unknown as Bindings
    );
  const read = () => db.query.userItems.findFirst({ where: eq(userItems.id, 'owner-bookmark') });
  beforeEach(async () => {
    send.mockReset();
    await db
      .update(userItems)
      .set({ state: 'INBOX', bookmarkedAt: null })
      .where(eq(userItems.id, 'owner-bookmark'));
    await db.insert(itemEnrichments).values({
      id: 'completion-enrichment',
      itemId: 'item',
      schemaVersion: ENRICHMENT_SCHEMA_VERSION,
      contentHash: 'fixture',
      status: 'COMPLETE',
      entitiesJson: JSON.stringify([{ name: 'Test Person', type: 'PERSON', confidence: 0.9 }]),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  it.each(['INBOX', 'ARCHIVED'])(
    'enriches and indexes newly saved %s content once across retries',
    async (state) => {
      await db.update(userItems).set({ state }).where(eq(userItems.id, 'owner-bookmark'));
      expect((await complete()).status).toBe(200);
      const saved = await read();
      expect(saved).toMatchObject({
        state: 'BOOKMARKED',
        isFinished: true,
        bookmarkedAt: expect.any(String),
      });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'owner',
          userItemId: 'owner-bookmark',
          itemId: 'item',
          trigger: state === 'INBOX' ? 'inbox_bookmark' : 'manual_save',
        })
      );
      expect(await db.select().from(userPeople)).toMatchObject([{ userId: 'owner', itemCount: 1 }]);
      expect(await db.select().from(userPersonMentions)).toMatchObject([{ isActive: true }]);
      expect((await complete()).status).toBe(200);
      expect(await read()).toEqual(saved);
      expect(send).toHaveBeenCalledTimes(1);
      expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(0);
      expect(
        (await db.select().from(userItemConsumptionEvents)).map((event) => event.eventType).sort()
      ).toEqual(['FINISHED', 'SAVED']);
      expect((await complete('owner-bookmark', false)).status).toBe(200);
      expect(send).toHaveBeenCalledTimes(1);
      expect(await db.select().from(userPersonMentions)).toMatchObject([{ isActive: true }]);
    }
  );

  it('keeps a committed completion successful during queue failure and retries delivery without repeating writes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    send.mockRejectedValueOnce(new Error('Queue unavailable'));
    expect((await complete()).status).toBe(200);
    const saved = await read();
    expect(saved).toMatchObject({ state: 'BOOKMARKED', isFinished: true });
    expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(1);
    expect(await db.select().from(userPeople)).toMatchObject([{ itemCount: 1 }]);
    vi.setSystemTime(new Date(Date.parse(now) + 5 * 60 * 1000));
    expect((await complete()).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
    expect(await read()).toEqual(saved);
    expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(0);
    expect(
      (await db.select().from(userItemConsumptionEvents)).map((event) => event.eventType).sort()
    ).toEqual(['FINISHED', 'SAVED']);
  });

  it.each(['bookmark_enrichment_outbox', 'user_item_consumption_events'])(
    'rolls back saving, finishing, and intent if %s rejects its write',
    async (table) => {
      const before = await read();
      await bindings.DB.exec(
        `CREATE TRIGGER reject_completion BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'test failure'); END`
      );
      try {
        expect((await complete()).status).toBe(500);
        expectLoggerErrorCalls([['Unhandled error']]);
        expect(await read()).toEqual(before);
        expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(0);
        expect(await db.select().from(userItemConsumptionEvents)).toHaveLength(0);
        expect(await db.select().from(userPeople)).toHaveLength(0);
        expect(send).not.toHaveBeenCalled();
      } finally {
        await bindings.DB.exec('DROP TRIGGER reject_completion');
      }
    }
  );

  it('saves and indexes already-finished unsaved content without inventing a completion event', async () => {
    await db
      .update(userItems)
      .set({ isFinished: true, finishedAt: now })
      .where(eq(userItems.id, 'owner-bookmark'));
    expect((await complete()).status).toBe(200);
    expect(await read()).toMatchObject({ state: 'BOOKMARKED', finishedAt: now });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await db.select().from(userPeople)).toMatchObject([{ itemCount: 1 }]);
    expect(await db.select().from(userItemConsumptionEvents)).toMatchObject([
      { eventType: 'SAVED' },
    ]);
  });

  it('does not enqueue new work when completing saved content or toggling unsaved content through tRPC', async () => {
    expect((await toggle('owner-bookmark')).status).toBe(200);
    expect(await read()).toMatchObject({ state: 'INBOX', isFinished: true });
    await db
      .update(userItems)
      .set({ state: 'BOOKMARKED', isFinished: false })
      .where(eq(userItems.id, 'owner-bookmark'));
    expect((await complete()).status).toBe(200);
    expect(send).not.toHaveBeenCalled();
    expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(0);
    expect(await db.select().from(userPeople)).toHaveLength(0);
  });

  it('does not schedule work or index People for another user', async () => {
    await db.update(userItems).set({ state: 'INBOX' }).where(eq(userItems.id, 'other-bookmark'));
    expect((await complete('other-bookmark')).status).toBe(404);
    expect(send).not.toHaveBeenCalled();
    expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(0);
    expect(await db.select().from(userPeople)).toHaveLength(0);
  });
});

it.skipIf(!(env as unknown as { BOOK_LIVE_PROOF: boolean }).BOOK_LIVE_PROOF)(
  'LIVE: saves the actual publisher page through REST and verifies persisted book, tags, duplicate save and completion',
  async () => {
    const real = await vi.importActual<typeof LinkPreviewModule>('../lib/link-preview');
    vi.mocked(fetchLinkPreview).mockImplementation(real.fetchLinkPreview);
    const url =
      'https://www.penguinrandomhouse.com/books/57757/the-inner-game-of-tennis-50th-anniversary-edition-by-w-timothy-gallwey/9780307758859/';
    const saved = await request('/bookmarks', 'POST', { url, tags: ['Books'] });
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as {
      bookmark: { itemId: string; userItemId: string; status: string };
    };
    const { itemId, userItemId } = body.bookmark;
    expect(body.bookmark.status).toBe('created');
    const persisted = await db.query.items.findFirst({ where: eq(items.id, itemId) });
    expect(persisted).toMatchObject({
      contentType: 'BOOK',
      title: 'The Inner Game of Tennis',
      thumbnailUrl: 'https://images.penguinrandomhouse.com/cover/9780307758859',
      articleContentKey: null,
      readingTimeMinutes: null,
    });
    expect(persisted?.summary).toContain('relaxed concentration');
    expect(
      await db.query.creators.findFirst({ where: eq(creators.id, persisted!.creatorId!) })
    ).toMatchObject({ name: 'W. Timothy Gallwey' });
    const library = await request('/bookmarks?contentType=BOOK');
    expect(library.status).toBe(200);
    expect(await library.json()).toMatchObject({
      items: [
        { id: userItemId, contentType: 'BOOK', isFinished: false, tags: [{ name: 'Books' }] },
      ],
    });
    const repeated = await request('/bookmarks', 'POST', { url });
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toMatchObject({
      bookmark: { itemId, userItemId, status: 'already_bookmarked' },
    });
    expect((await request(`/bookmarks/${userItemId}`, 'PATCH', { isFinished: true })).status).toBe(
      200
    );
    expect(
      await db.query.userItems.findFirst({ where: eq(userItems.id, userItemId) })
    ).toMatchObject({ isFinished: true, state: 'BOOKMARKED' });
    const detail = await request(`/bookmarks/${userItemId}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      item: { title: 'The Inner Game of Tennis', contentType: 'BOOK', isFinished: true },
    });
    console.log(
      'LIVE_BOOK_REST_PROOF',
      JSON.stringify({
        title: persisted?.title,
        contentType: persisted?.contentType,
        thumbnailUrl: persisted?.thumbnailUrl,
        created: true,
        duplicateDeduplicated: true,
        libraryBookFilter: true,
        tagsPersisted: true,
        completionPersisted: true,
        articleContentKey: persisted?.articleContentKey,
      })
    );
  },
  60000
);

async function verifyAmazonBookShare(live: boolean) {
  const real = await vi.importActual<typeof LinkPreviewModule>('../lib/link-preview');
  vi.mocked(fetchLinkPreview).mockImplementation(real.fetchLinkPreview);
  const url = 'https://www.amazon.com/dp/B00SFZB93Y?ref_=quick_view_ref_tag';
  const sharedText =
    "I think you might like this book: The Devil's Chessboard: Allen Dulles, the CIA, and the Rise of America's Secret Government by David Talbothttps://www.amazon.com/dp/B00SFZB93Y?ref_=quick_view_ref_tag";
  const unavailable = live
    ? null
    : vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => new Response('Unavailable', { status: 500 }));
  try {
    const preview = await request('/bookmarks/preview', 'POST', { url, sharedText });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      item: {
        contentType: 'BOOK',
        creator: 'David Talbot',
        canonicalUrl: 'https://www.amazon.com/dp/B00SFZB93Y',
      },
    });
    const saved = await request('/bookmarks', 'POST', { url, sharedText, tags: ['Books'] });
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as {
      bookmark: { itemId: string; userItemId: string; status: string };
    };
    const { itemId, userItemId } = body.bookmark;
    expect(body.bookmark.status).toBe('created');
    const stored = await db.query.items.findFirst({ where: eq(items.id, itemId) });
    expect(stored).toMatchObject({
      contentType: 'BOOK',
      providerId: 'amazon.com:B00SFZB93Y',
      title:
        "The Devil's Chessboard: Allen Dulles, the CIA, and the Rise of America's Secret Government",
      articleContentKey: null,
    });
    expect(JSON.parse(stored!.rawMetadata!).book.asin).toBe('B00SFZB93Y');
    expect(
      await db.query.creators.findFirst({ where: eq(creators.id, stored!.creatorId!) })
    ).toMatchObject({ name: 'David Talbot' });
    const repeat = await request('/bookmarks', 'POST', {
      url: 'https://www.amazon.com/gp/product/B00SFZB93Y?tag=another',
      sharedText,
    });
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toMatchObject({
      bookmark: { itemId, userItemId, status: 'already_bookmarked' },
    });
    const library = await request('/bookmarks?contentType=BOOK');
    expect(await library.json()).toMatchObject({
      items: [{ id: userItemId, contentType: 'BOOK', tags: [{ name: 'Books' }] }],
    });
    expect((await request(`/bookmarks/${userItemId}`, 'PATCH', { isFinished: true })).status).toBe(
      200
    );
    const detail = await request(`/bookmarks/${userItemId}`);
    expect(await detail.json()).toMatchObject({ item: { contentType: 'BOOK', isFinished: true } });
    if (live) {
      const cover = await fetch(stored!.thumbnailUrl!);
      expect(cover.status).toBe(200);
      expect(cover.headers.get('content-type')).toContain('image/');
      expect((await cover.arrayBuffer()).byteLength).toBeGreaterThan(1000);
      console.log(
        'LIVE_AMAZON_BOOK_PROOF',
        JSON.stringify({
          asin: 'B00SFZB93Y',
          title: stored?.title,
          metadataSource: JSON.parse(stored!.rawMetadata!).metadataSource,
          coverAccessible: true,
          persisted: true,
          duplicateDeduplicated: true,
          tagsPersisted: true,
          completionPersisted: true,
        })
      );
    }
  } finally {
    unavailable?.mockRestore();
  }
}

it('saves the exact Kindle share through REST even when Amazon is unavailable', () =>
  verifyAmazonBookShare(false));
it.skipIf(!(env as unknown as { BOOK_LIVE_PROOF: boolean }).BOOK_LIVE_PROOF)(
  'LIVE: saves the exact Amazon Kindle share and verifies cover, tags, duplicate handling and completion',
  () => verifyAmazonBookShare(true),
  60000
);

async function verifyAmazonShortBook(live: boolean) {
  const real = await vi.importActual<typeof LinkPreviewModule>('../lib/link-preview');
  vi.mocked(fetchLinkPreview).mockImplementation(real.fetchLinkPreview);
  // Queue consumption is outside this persistence proof and must not outlive D1 rollback.
  const requestBindings = {
    ...bindings,
    ENRICHMENT_QUEUE: { send: vi.fn(async () => {}) } as unknown as Queue,
  };
  const shortRequest = (path: string, method = 'GET', body?: unknown) =>
    request(path, method, body, requestBindings);
  const shortUrl = 'https://a.co/0gbZxe3s';
  const otherShortUrl = 'https://a.co/0108tGE8';
  const canonicalUrl = 'https://www.amazon.com/dp/B000O76ON6';
  const network = live
    ? null
    : vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.startsWith('https://a.co/'))
          return new Response(null, {
            status: 302,
            headers: { location: canonicalUrl + '?ref_=k4w_ss_dp_bot' },
          });
        const response = new Response(
          url.includes('/gp/aw/d/')
            ? '<html><span id="productTitle">Neuromancer (Sprawl Trilogy Book 1)</span><div id="bylineInfo"><span class="author"><a class="a-link-normal">William Gibson</a></span></div><div id="bookDescription_feature_div"><div class="a-expander-content">A science fiction masterpiece.</div></div></html>'
            : '<html><title>Amazon</title></html>',
          { headers: { 'content-type': 'text/html' } }
        );
        Object.defineProperty(response, 'url', { value: url });
        return response;
      });
  try {
    const preview = await shortRequest('/bookmarks/preview', 'POST', { url: shortUrl });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
      item: {
        contentType: 'BOOK',
        canonicalUrl,
        creator: 'William Gibson',
        title: 'Neuromancer (Sprawl Trilogy Book 1)',
      },
    });
    const saved = await shortRequest('/bookmarks', 'POST', { url: shortUrl, tags: ['Books'] });
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as {
      bookmark: { itemId: string; userItemId: string; status: string };
    };
    const { itemId, userItemId } = body.bookmark;
    expect(body.bookmark.status).toBe('created');
    const stored = await db.query.items.findFirst({ where: eq(items.id, itemId) });
    expect(stored).toMatchObject({
      contentType: 'BOOK',
      providerId: 'amazon.com:B000O76ON6',
      title: 'Neuromancer (Sprawl Trilogy Book 1)',
      articleContentKey: null,
    });
    expect(JSON.parse(stored!.rawMetadata!).book.asin).toBe('B000O76ON6');
    for (const url of [otherShortUrl, canonicalUrl]) {
      const repeated = await shortRequest('/bookmarks', 'POST', { url });
      expect(repeated.status).toBe(200);
      expect(await repeated.json()).toMatchObject({
        bookmark: { itemId, userItemId, status: 'already_bookmarked' },
      });
    }
    expect(await (await shortRequest('/bookmarks?contentType=BOOK')).json()).toMatchObject({
      items: [
        {
          id: userItemId,
          contentType: 'BOOK',
          creator: 'William Gibson',
          tags: [{ name: 'Books' }],
        },
      ],
    });
    expect(
      (await shortRequest(`/bookmarks/${userItemId}`, 'PATCH', { isFinished: true })).status
    ).toBe(200);
    expect(await (await shortRequest(`/bookmarks/${userItemId}`)).json()).toMatchObject({
      item: { contentType: 'BOOK', isFinished: true },
    });
    if (live) {
      const cover = await fetch(stored!.thumbnailUrl!);
      expect(cover.status).toBe(200);
      expect(cover.headers.get('content-type')).toContain('image/');
      expect((await cover.arrayBuffer()).byteLength).toBeGreaterThan(1000);
      console.log(
        'LIVE_AMAZON_SHORT_LINK_PROOF',
        JSON.stringify({
          shortUrl,
          otherShortUrl,
          canonicalUrl,
          title: stored!.title,
          metadataSource: JSON.parse(stored!.rawMetadata!).metadataSource,
          persisted: true,
          aliasesDeduplicated: true,
          coverAccessible: true,
          completionPersisted: true,
        })
      );
    }
  } finally {
    network?.mockRestore();
  }
}

it('saves bare Amazon short links through REST and deduplicates short and direct aliases', () =>
  verifyAmazonShortBook(false));
it.skipIf(!(env as unknown as { BOOK_LIVE_PROOF: boolean }).BOOK_LIVE_PROOF)(
  'LIVE: saves both reported Amazon short links as Neuromancer without share text',
  () => verifyAmazonShortBook(true),
  120000
);

describe.each(['REST', 'tRPC'])('%s manual bookmark save contract', (api) => {
  const metadata = {
    canonicalUrl: 'https://www.youtube.com/watch?v=save-contract',
    title: 'Save contract',
    provider: Provider.YOUTUBE,
    contentType: ContentType.VIDEO,
    providerId: 'save-contract',
    thumbnailUrl: null,
    creator: 'Contract Creator',
    duration: 120,
    source: 'opengraph' as const,
  };
  const send = vi.fn(async () => {});
  const save = (overrides: Record<string, unknown> = {}, requestedTags?: string[]) => {
    const preview = { ...metadata, ...overrides };
    vi.mocked(fetchLinkPreview).mockResolvedValue(preview);
    return app.request(
      api === 'REST' ? '/api/v1/bookmarks' : '/trpc/bookmarks.save',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${api === 'REST' ? token : 'test-clerk-session'}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          api === 'REST'
            ? { url: preview.canonicalUrl, tags: requestedTags }
            : { json: { ...preview, url: preview.canonicalUrl, tags: requestedTags } }
        ),
      },
      { ...bindings, ENRICHMENT_QUEUE: { send } } as unknown as Bindings
    );
  };
  const result = async (response: Response) => {
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      bookmark: { itemId: string; userItemId: string; status: string };
      result: { data: { json: { itemId: string; userItemId: string; status: string } } };
    };
    return api === 'REST' ? json.bookmark : json.result.data.json;
  };
  beforeEach(() => send.mockReset());

  it('creates canonical content and a creator, merges normalized tags on duplicates, and preserves saved time', async () => {
    const first = await result(await save({}, [' Design ', 'design']));
    expect(first.status).toBe('created');
    const before = await db.query.userItems.findFirst({
      where: eq(userItems.id, first.userItemId),
    });
    expect(before).toMatchObject({ userId: 'owner', state: 'BOOKMARKED', isFinished: false });
    const item = await db.query.items.findFirst({ where: eq(items.id, first.itemId) });
    expect(item).toMatchObject({
      providerId: 'save-contract',
      title: 'Save contract',
      duration: 120,
    });
    expect(await db.select().from(creators)).toMatchObject([
      { id: item!.creatorId, name: 'Contract Creator' },
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    const repeat = await result(await save({}, ['API', 'design']));
    expect(repeat).toEqual({ ...first, status: 'already_bookmarked' });
    expect(
      (await db.query.userItems.findFirst({ where: eq(userItems.id, first.userItemId) }))!
        .bookmarkedAt
    ).toBe(before!.bookmarkedAt);
    expect(await db.select().from(userItemTags)).toHaveLength(2);
    expect((await db.select().from(tags)).every((tag) => tag.userId === 'owner')).toBe(true);
    expect(await db.select().from(items)).toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(['INBOX', 'ARCHIVED'])(
    'rebookmarks %s without changing finished state and recovers queue failures',
    async (state) => {
      await db
        .update(userItems)
        .set({ state, isFinished: true, finishedAt: now })
        .where(eq(userItems.id, 'owner-bookmark'));
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(now));
      send.mockRejectedValueOnce(new Error('Queue unavailable'));
      const first = await result(await save({ providerId: 'video' }, ['Saved']));
      expect(first).toEqual({
        itemId: 'item',
        userItemId: 'owner-bookmark',
        status: 'rebookmarked',
      });
      expect(
        await db.query.userItems.findFirst({ where: eq(userItems.id, first.userItemId) })
      ).toMatchObject({ state: 'BOOKMARKED', isFinished: true, finishedAt: now });
      expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(1);
      vi.setSystemTime(new Date(Date.parse(now) + 5 * 60 * 1000));
      expect((await result(await save({ providerId: 'video' }))).status).toBe('already_bookmarked');
      expect(await db.select().from(bookmarkEnrichmentOutbox)).toHaveLength(0);
      expect(send).toHaveBeenCalledTimes(2);
      expect(await db.select().from(userItemConsumptionEvents)).toMatchObject([
        { eventType: 'SAVED' },
      ]);
    }
  );

  it('persists books, filters the Library, preserves tags on duplicate save, and persists completion', async () => {
    vi.mocked(extractArticle).mockClear();
    const book = {
      provider: Provider.WEB,
      contentType: ContentType.BOOK,
      providerId: 'https://www.penguinrandomhouse.com/books/57757/book/9780307758859',
      canonicalUrl: 'https://www.penguinrandomhouse.com/books/57757/book/9780307758859',
      title: 'The Inner Game of Tennis',
      creator: 'W. Timothy Gallwey',
      thumbnailUrl: 'https://images.penguinrandomhouse.com/cover/9780307758859',
      description: 'A guide to relaxed concentration.',
      siteName: 'Random House Group',
      duration: null,
      hasArticleContent: true,
    };
    const first = await result(await save(book, ['Books']));
    expect(first.status).toBe('created');
    expect(await db.query.items.findFirst({ where: eq(items.id, first.itemId) })).toMatchObject({
      contentType: 'BOOK',
      title: book.title,
      summary: book.description,
      thumbnailUrl: book.thumbnailUrl,
      articleContentKey: null,
      readingTimeMinutes: null,
    });
    expect(vi.mocked(extractArticle)).not.toHaveBeenCalled();
    const request = (path: string, method = 'GET') =>
      app.request(
        path,
        {
          method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          ...(method === 'PATCH' ? { body: JSON.stringify({ isFinished: true }) } : {}),
        },
        bindings
      );
    const library = await request('/api/v1/bookmarks?contentType=BOOK');
    expect(library.status).toBe(200);
    expect(await library.json()).toMatchObject({
      items: [{ id: first.userItemId, contentType: 'BOOK', creator: book.creator }],
    });
    expect((await result(await save(book, ['Tennis']))).status).toBe('already_bookmarked');
    expect(await db.select().from(userItemTags)).toHaveLength(2);
    expect((await request(`/api/v1/bookmarks/${first.userItemId}`, 'PATCH')).status).toBe(200);
    const detail = await request(`/api/v1/bookmarks/${first.userItemId}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ item: { contentType: 'BOOK', isFinished: true } });
  });

  it('rejects invalid preview metadata before creating content', async () => {
    const response = await save({ title: '' });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject(
      api === 'REST'
        ? { code: 'BAD_REQUEST' }
        : { error: { json: { data: { code: 'BAD_REQUEST' } } } }
    );
    expect(await db.select().from(items)).toHaveLength(1);
    expect(await db.select().from(creators)).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('stores extracted WEB article HTML and fills missing reading metadata', async () => {
    vi.mocked(extractArticle).mockResolvedValueOnce({
      title: 'Article',
      author: null,
      authorImageUrl: null,
      siteName: null,
      publishedAt: null,
      thumbnailUrl: null,
      excerpt: null,
      wordCount: 600,
      readingTimeMinutes: 3,
      content: '<p>Contract article body</p>',
      isArticle: true,
    });
    const saved = await result(
      await save({
        provider: 'WEB',
        contentType: 'ARTICLE',
        hasArticleContent: true,
        wordCount: 800,
      })
    );
    const item = await db.query.items.findFirst({ where: eq(items.id, saved.itemId) });
    expect(item).toMatchObject({
      wordCount: 800,
      readingTimeMinutes: 3,
      articleContentKey: `articles/${saved.itemId}.html`,
    });
    expect(await (await bindings.ARTICLE_CONTENT.get(item!.articleContentKey!))!.text()).toBe(
      '<p>Contract article body</p>'
    );
  });

  it('keeps article extraction best effort when the remote fetch fails', async () => {
    vi.mocked(extractArticle).mockRejectedValueOnce(new Error('Article fetch unavailable'));
    const saved = await result(
      await save({ provider: 'WEB', contentType: 'ARTICLE', hasArticleContent: true })
    );
    expectLoggerErrorCalls([['Failed to extract/store article content']]);
    expect(await db.query.items.findFirst({ where: eq(items.id, saved.itemId) })).toMatchObject({
      articleContentKey: null,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('normalizes Substack links into one canonical article', async () => {
    const response = await result(
      await save({
        canonicalUrl: 'https://example.substack.com/p/test-post?utm_source=test',
        provider: 'WEB',
        contentType: 'ARTICLE',
        providerId: 'original-id',
      })
    );
    expect(await db.query.items.findFirst({ where: eq(items.id, response.itemId) })).toMatchObject({
      provider: 'SUBSTACK',
      contentType: 'ARTICLE',
      canonicalUrl: 'https://example.substack.com/p/test-post',
    });
    expect(
      (
        await result(
          await save({
            canonicalUrl: 'https://example.substack.com/p/test-post',
            provider: 'WEB',
            contentType: 'ARTICLE',
            providerId: 'another-id',
          })
        )
      ).status
    ).toBe('already_bookmarked');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('deduplicates podcast saves by episode identity while retaining the latest timestamp', async () => {
    const first = await result(
      await save({
        provider: 'WEB',
        contentType: 'PODCAST',
        providerId: 'pocket_casts:episode-123',
        canonicalUrl: 'https://pca.st/episode/episode-123?t=30',
        title: 'Episode',
        creator: 'Example Show',
        duration: 1800,
      })
    );
    const repeat = await result(
      await save({
        provider: 'WEB',
        contentType: 'PODCAST',
        providerId: 'pocket_casts:episode-123',
        canonicalUrl: 'https://pca.st/episode/episode-123?t=420',
        title: 'Episode',
        creator: 'Example Show',
        duration: 1800,
      })
    );

    expect(repeat).toEqual({ ...first, status: 'already_bookmarked' });
    expect(await db.query.items.findFirst({ where: eq(items.id, first.itemId) })).toMatchObject({
      contentType: 'PODCAST',
      canonicalUrl: 'https://pca.st/episode/episode-123?t=30',
    });
    expect(
      await db.query.userItems.findFirst({ where: eq(userItems.id, first.userItemId) })
    ).toMatchObject({
      handoffUrl: 'https://pca.st/episode/episode-123?t=420',
    });
    const libraryResponse = await request('/bookmarks');
    expect(libraryResponse.status).toBe(200);
    const library = (await libraryResponse.json()) as {
      items: Array<{ id: string; canonicalUrl: string }>;
    };
    expect(library.items[0]).toMatchObject({
      id: first.userItemId,
      canonicalUrl: 'https://pca.st/episode/episode-123?t=420',
    });
  });
});

describe('saved player links in normal bookmark responses', () => {
  it('returns destinations with list, detail and home data without directory requests', async () => {
    const destinations = {
      OVERCAST: { kind: 'show', url: 'https://overcast.fm/+itunes123' },
      APPLE_PODCASTS: { kind: 'episode', url: 'https://podcasts.apple.com/podcast/id123?i=456' },
      POCKET_CASTS: { kind: 'episode', url: 'https://pca.st/episode/456' },
    };
    await db
      .update(items)
      .set({
        contentType: 'PODCAST',
        provider: 'RSS',
        podcastDestinations: JSON.stringify({ destinations, nextAttemptAt: null, attempts: 1 }),
      })
      .where(eq(items.id, 'item'));
    const network = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('No directory requests on reads'));
    try {
      const detail = await request('/bookmarks/owner-bookmark');
      expect(detail.status).toBe(200);
      expect(await detail.json()).toMatchObject({ item: { podcastDestinations: destinations } });
      const list = await request('/bookmarks');
      expect(await list.json()).toMatchObject({ items: [{ podcastDestinations: destinations }] });
      const { toHomeItemViews } = await import('../items/views');
      const item = (await db.query.items.findFirst({ where: eq(items.id, 'item') }))!;
      const userItem = (await db.query.userItems.findFirst({
        where: eq(userItems.id, 'owner-bookmark'),
      }))!;
      expect(
        toHomeItemViews([{ items: item, user_items: userItem, creators: null }])[0]
          .podcastDestinations
      ).toEqual(destinations);
      expect(network).not.toHaveBeenCalled();
    } finally {
      network.mockRestore();
    }
  });
});

describe('podcast destination ownership and source preservation', () => {
  it('requires authentication and rejects invalid players and another user bookmark', async () => {
    const unauthenticated = await app.request(
      '/api/v1/bookmarks/owner-bookmark/podcast-destination?player=OVERCAST',
      {},
      bindings
    );
    expect(unauthenticated.status).toBe(401);
    expect(
      (await request('/bookmarks/owner-bookmark/podcast-destination?player=UNSUPPORTED')).status
    ).toBe(400);
    expect(
      (await request('/bookmarks/other-bookmark/podcast-destination?player=OVERCAST')).status
    ).toBe(404);
    expect(
      (await request('/bookmarks/owner-bookmark/podcast-destination?player=OVERCAST')).status
    ).toBe(422);
  });

  it('resolves a feed belonging to the user without changing saved links or read state', async () => {
    await db
      .update(items)
      .set({
        contentType: 'PODCAST',
        provider: 'RSS',
        canonicalUrl: 'https://publisher.example/episode',
        rawMetadata: JSON.stringify({
          audioUrl: 'https://publisher.example/audio.mp3',
          rawGuid: 'one',
        }),
      })
      .where(eq(items.id, 'item'));
    await db
      .update(userItems)
      .set({ handoffUrl: 'https://overcast.fm/+original?t=90' })
      .where(eq(userItems.id, 'owner-bookmark'));
    await db.insert(rssFeeds).values({
      id: 'podcast-feed',
      userId: 'owner',
      title: 'Show',
      feedUrl: 'https://publisher.example/rss',
      feedUrlHash: 'hash',
      feedType: 'PODCAST',
      sourceUrl: 'https://overcast.fm/itunes123',
      createdAt: 1,
      updatedAt: 1,
    });
    await db.insert(rssFeedItems).values({
      id: 'podcast-map',
      rssFeedId: 'podcast-feed',
      itemId: 'item',
      entryId: 'one',
      fetchedAt: 1,
    });
    const before = await db.query.userItems.findFirst({
      where: eq(userItems.id, 'owner-bookmark'),
    });
    const directory = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        results: [{ kind: 'podcast', collectionId: 123, feedUrl: 'https://publisher.example/rss' }],
      })
    );
    const response = await request(
      '/bookmarks/owner-bookmark/podcast-destination?player=OVERCAST'
    ).finally(() => directory.mockRestore());
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.originalUrl).toBe('https://overcast.fm/+original?t=90');
    expect(body.publisherUrl).toBe('https://publisher.example/episode');
    expect(body.destination).toEqual({
      kind: 'show',
      url: 'https://overcast.fm/+itunes123',
    });
    expect(
      await db.query.userItems.findFirst({ where: eq(userItems.id, 'owner-bookmark') })
    ).toEqual(before);
  });
});

describe('tag suggestion REST lifecycle', () => {
  it('merges acceptance, rejects other owners and invalid decisions, and persists dismissal', async () => {
    await bindings.DB.prepare(
      "INSERT INTO tag_suggestions (id,user_item_id,normalized_name,name,confidence,generated_at) VALUES ('suggestion','owner-bookmark','ai','AI',0.95,1),('dismiss','owner-bookmark','testing','Testing',0.9,1)"
    ).run();
    expect((await request('/bookmarks/other-bookmark/tag-suggestions')).status).toBe(404);
    expect(
      (
        await request('/bookmarks/other-bookmark/tag-suggestions/suggestion', 'POST', {
          decision: 'ACCEPTED',
        })
      ).status
    ).toBe(404);
    expect(
      (
        await request('/bookmarks/owner-bookmark/tag-suggestions/suggestion', 'POST', {
          decision: 'BOGUS',
        })
      ).status
    ).toBe(400);
    const pending = await request('/bookmarks/owner-bookmark/tag-suggestions');
    expect(await pending.json()).toMatchObject({
      suggestions: [{ name: 'AI' }, { name: 'Testing' }],
    });
    for (let n = 0; n < 2; n++) {
      const accepted = await request(
        '/bookmarks/owner-bookmark/tag-suggestions/suggestion',
        'POST',
        { decision: 'ACCEPTED' }
      );
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toMatchObject({
        tags: [{ name: 'AI' }],
        suggestions: [{ name: 'Testing' }],
      });
    }
    expect(
      (
        await request('/bookmarks/owner-bookmark/tag-suggestions/dismiss', 'POST', {
          decision: 'DISMISSED',
        })
      ).status
    ).toBe(200);
    expect(await (await request('/bookmarks/owner-bookmark/tag-suggestions')).json()).toMatchObject(
      { suggestions: [] }
    );
    expect(await (await request('/bookmarks/owner-bookmark')).json()).toMatchObject({
      item: { tags: [{ name: 'AI' }] },
    });
  });
});
