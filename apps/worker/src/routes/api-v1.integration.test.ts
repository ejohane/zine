import { expectLoggerErrorCalls } from '../test/mock-logger';
import { applyD1Migrations, env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { app } from '../index';
import { dispatchBookmarkEnrichment, getBookmarkEnrichmentHealth } from '../enrichment/outbox';
import { createDb } from '../db';
import {
  bookmarkEnrichmentOutbox,
  apiTokens,
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

async function request(path: string, method = 'GET', body?: unknown) {
  return app.request(
    `/api/v1${path}`,
    {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    bindings
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
      expect(await db.select().from(userItemConsumptionEvents)).toHaveLength(1);
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
          metadata: null,
          userId: 'owner',
          itemId: 'item',
          userItemId: 'owner-bookmark',
        },
        {
          eventType: 'UNFINISHED',
          occurredAt: Date.parse('2026-09-06T13:01:00Z'),
          source: 'MANUAL_FINISH_TOGGLE',
          metadata: null,
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
        metadata: JSON.stringify({ source: 'api_v1' }),
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
    expect(await db.select().from(userItemConsumptionEvents)).toHaveLength(0);
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
        bookmarkedAt: '2026-09-07T12:00:00.000Z',
        updatedAt: '2026-09-07T12:00:00.000Z',
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
      expect(await read()).toMatchObject({ bookmarkedAt: '2026-09-07T12:01:00.000Z' });
      expect(send).toHaveBeenCalledTimes(state === 'INBOX' ? 1 : 0);
      expect(await db.select().from(userPeople)).toMatchObject([{ itemCount: 1 }]);
      expect(await db.select().from(userItemConsumptionEvents)).toHaveLength(0);
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
      expect(await db.select().from(userItemConsumptionEvents)).toHaveLength(0);
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
