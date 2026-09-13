import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../index';
import { createDb } from '../db';
import { apiTokens, creators, items, tags, userItems, userItemTags, users } from '../db/schema';
import { hashApiToken } from '../lib/api-tokens';
import type * as AuthModule from '../lib/auth';
import type { Bindings } from '../types';

vi.mock('googleapis', () => ({ google: {} }));
vi.mock('../lib/auth', async (original) => ({
  ...(await original<typeof AuthModule>()),
  verifyClerkToken: vi.fn(async () => ({
    success: true,
    userId: 'reader',
    payload: { sub: 'reader' },
  })),
}));

const bindings = env as unknown as Bindings & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};
const db = createDb(bindings.DB);
const now = '2026-09-10T12:00:00.000Z';
const token = 'zine_pat_read_contract';
const paths = {
  inbox: '/inbox',
  library: '/bookmarks',
  recentlyOpened: '/bookmarks/opened',
  quickWins: '/bookmarks/quick-wins',
};
type ReadName = keyof typeof paths;
type Page = {
  items: Array<{ id: string; itemId: string; [key: string]: unknown }>;
  nextCursor: string | null;
};

beforeEach(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
  await db
    .insert(users)
    .values(['reader', 'other'].map((id) => ({ id, createdAt: now, updatedAt: now })));
  await db.insert(apiTokens).values({
    id: 'read-token',
    userId: 'reader',
    name: 'Read contract',
    tokenHash: await hashApiToken(token),
    tokenPrefix: 'zine_pat_read',
    scopesJson: JSON.stringify(['bookmarks:read']),
    createdAt: Date.now(),
  });
  await db.insert(creators).values({
    id: 'creator',
    provider: 'YOUTUBE',
    providerCreatorId: 'read-creator',
    name: 'Read-only Labs',
    normalizedName: 'read-only labs',
    imageUrl: 'null',
    createdAt: Date.parse(now),
    updatedAt: Date.parse(now),
  });
  const rows = [
    { id: 'a', state: 'BOOKMARKED', duration: 600, opened: now, bookmarkedAt: null },
    {
      id: 'b',
      state: 'BOOKMARKED',
      duration: 601,
      opened: '2026-09-09T12:00:00.000Z',
      bookmarkedAt: now,
    },
    { id: 'c', state: 'BOOKMARKED', duration: null, opened: null, bookmarkedAt: now },
    { id: 'd', state: 'BOOKMARKED', duration: 0, opened: now, bookmarkedAt: now, finished: true },
    { id: 'e', state: 'INBOX', duration: 120, opened: null, bookmarkedAt: null },
    { id: 'f', state: 'INBOX', duration: 120, opened: null, bookmarkedAt: null, finished: true },
    { id: 'g', state: 'ARCHIVED', duration: 120, opened: now, bookmarkedAt: now },
  ];
  for (const row of rows) {
    await db.insert(items).values({
      id: row.id,
      provider: row.id === 'c' ? 'WEB' : 'YOUTUBE',
      contentType: row.id === 'c' ? 'ARTICLE' : 'VIDEO',
      providerId: row.id,
      canonicalUrl:
        row.id === 'c'
          ? 'https://open.substack.com/pub/example/p/article'
          : `https://example.com/${row.id}`,
      title: `Read fixture ${row.id}`,
      creatorId: 'creator',
      duration: row.duration,
      readingTimeMinutes: row.id === 'c' ? 10 : null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(userItems).values({
      id: row.id,
      userId: 'reader',
      itemId: row.id,
      state: row.state,
      ingestedAt: now,
      bookmarkedAt: row.bookmarkedAt,
      lastOpenedAt: row.opened,
      isFinished: row.finished ?? false,
      progressPosition: 30,
      progressDuration: 120,
      createdAt: now,
      updatedAt: now,
    });
  }
  await db.insert(userItems).values({
    id: 'foreign',
    userId: 'other',
    itemId: 'a',
    state: 'BOOKMARKED',
    ingestedAt: now,
    bookmarkedAt: now,
    lastOpenedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(tags).values([
    {
      id: 'own-tag',
      userId: 'reader',
      name: 'Research',
      normalizedName: 'research',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'foreign-tag',
      userId: 'other',
      name: 'Private',
      normalizedName: 'private',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ]);
  await db.insert(userItemTags).values([
    { id: 'own-assignment', userItemId: 'a', tagId: 'own-tag', createdAt: 1 },
    { id: 'foreign-assignment', userItemId: 'a', tagId: 'foreign-tag', createdAt: 2 },
  ]);
});

describe.each(['REST', 'tRPC'])('%s item read contracts with D1', (api) => {
  async function read(
    name: ReadName,
    options: {
      limit?: number;
      cursor?: string;
      search?: string;
      contentType?: string;
      provider?: string;
      isFinished?: boolean;
    } = {}
  ): Promise<Page> {
    let url: string;
    if (api === 'REST') {
      const query = new URLSearchParams(
        Object.entries(options)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)])
      );
      url = `/api/v1${paths[name]}?${query}`;
    } else {
      const { contentType, provider, isFinished, ...pagination } = options;
      url = `/trpc/items.${name}?input=${encodeURIComponent(JSON.stringify({ json: { ...pagination, filter: { contentType, provider, isFinished } } }))}`;
    }
    const response = await app.request(
      url,
      { headers: { Authorization: `Bearer ${api === 'REST' ? token : 'test-clerk-session'}` } },
      bindings
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Page & { result: { data: { json: Page } } };
    return api === 'REST' ? body : body.result.data.json;
  }

  it.each([
    ['inbox', ['e']],
    ['library', ['c', 'b', 'a']],
    ['recentlyOpened', ['a', 'b']],
    ['quickWins', ['c', 'a']],
  ] as Array<[ReadName, string[]]>)(
    '%s preserves eligibility and cursor ordering without leaking foreign items',
    async (name, expected) => {
      const ids: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 5; page++) {
        const response = await read(name, { limit: 1, cursor });
        ids.push(...response.items.map((item) => item.id));
        if (response.nextCursor === null) break;
        cursor = response.nextCursor;
      }
      expect(ids).toEqual(expected);
    }
  );

  it('preserves finished filtering, content-type filtering, and punctuation/consonant search', async () => {
    expect((await read('library', { isFinished: true })).items.map((item) => item.id)).toEqual([
      'd',
    ]);
    expect(
      (await read('library', { contentType: 'ARTICLE' })).items.map((item) => item.id)
    ).toEqual(['c']);
    expect(
      (await read('quickWins', { contentType: 'VIDEO' })).items.map((item) => item.id)
    ).toEqual(['a']);
    expect(
      (await read('library', { search: 'readonlylabs' })).items.map((item) => item.id)
    ).toEqual(['c', 'b', 'a']);
    expect((await read('library', { search: 'rdnlylbs' })).items.map((item) => item.id)).toEqual([
      'c',
      'b',
      'a',
    ]);
    expect((await read('library', { provider: 'YOUTUBE' })).items.map((item) => item.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('preserves mapped URLs, legacy null images, progress, and owner-scoped tags', async () => {
    const page = await read('library');
    expect(page.items.find((item) => item.id === 'a')).toMatchObject({
      creator: 'Read-only Labs',
      creatorImageUrl: null,
      progress: { position: 30, duration: 120, percent: 25 },
      tags: [{ id: 'own-tag', name: 'Research' }],
      bookmarkedAt: null,
    });
    expect(page.items.find((item) => item.id === 'c')).toMatchObject({
      canonicalUrl: 'https://example.substack.com/p/article',
      contentType: 'ARTICLE',
      tags: [],
    });
  });
});
