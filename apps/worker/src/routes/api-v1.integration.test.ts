import { applyD1Migrations, env } from 'cloudflare:test';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import { createDb } from '../db';
import { apiTokens, items, userItemConsumptionEvents, userItems, users } from '../db/schema';
import { hashApiToken } from '../lib/api-tokens';
import type { Bindings } from '../types';

// These bookmark journeys never call YouTube. Keep its Node-only SDK out of the
// unbundled test runtime; auth, routing, tRPC procedures, and D1 remain real.
vi.mock('googleapis', () => ({ google: {} }));

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
