import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb } from '../db';
import { items, users, rssFeeds, rssFeedItems } from '../db/schema';
import type { Bindings } from '../types';
import { resolvePlayerDestination } from './player-destinations';
import {
  enrichPodcastDestinations,
  backfillPodcastDestinations,
} from './saved-player-destinations';
import { savedPlayerLinks } from './player-destination-data';
vi.mock('googleapis', () => ({ google: {} }));
vi.mock('./player-destinations', () => ({ resolvePlayerDestination: vi.fn() }));
const bindings = env as unknown as Bindings & {
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};
const db = createDb(bindings.DB);
const links = {
  OVERCAST: { kind: 'show', url: 'https://overcast.fm/+itunes123' },
  APPLE_PODCASTS: { kind: 'episode', url: 'https://podcasts.apple.com/podcast/id123?i=456' },
  POCKET_CASTS: { kind: 'episode', url: 'https://pca.st/episode/456' },
} as const;
async function state() {
  return (await db.query.items.findFirst({ where: eq(items.id, 'episode') }))!;
}
async function seed() {
  await db.insert(users).values({ id: 'owner', createdAt: 'now', updatedAt: 'now' });
  await db.insert(items).values({
    id: 'episode',
    provider: 'RSS',
    providerId: 'one',
    contentType: 'PODCAST',
    title: 'Episode',
    canonicalUrl: 'https://example.com/episode',
    createdAt: 'now',
    updatedAt: 'now',
    rawMetadata: JSON.stringify({ audioUrl: 'https://example.com/audio.mp3', rawGuid: 'one' }),
  });
  await db.insert(rssFeeds).values({
    id: 'feed',
    userId: 'owner',
    title: 'Show',
    feedUrl: 'https://example.com/feed',
    feedUrlHash: 'hash',
    feedType: 'PODCAST',
    createdAt: 1,
    updatedAt: 1,
  });
  await db
    .insert(rssFeedItems)
    .values({ id: 'map', rssFeedId: 'feed', itemId: 'episode', entryId: 'one', fetchedAt: 1 });
}
describe('saved podcast destinations', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
    await seed();
    vi.mocked(resolvePlayerDestination).mockImplementation(async (player) => ({
      player,
      playerName: player,
      destination: links[player],
      temporarilyUnavailable: false,
    }));
  });
  it('persists all players independently of preference and preserves the original item', async () => {
    const before = await state();
    await enrichPodcastDestinations(db, bindings, 'episode', 1000);
    const after = await state();
    expect(savedPlayerLinks(after.podcastDestinations)).toEqual(links);
    expect({ ...after, podcastDestinations: null }).toEqual(before);
    await enrichPodcastDestinations(db, bindings, 'episode', 86400000);
    expect(resolvePlayerDestination).toHaveBeenCalledTimes(3);
  });
  it('retains partial links and retries only unresolved players after the backoff', async () => {
    vi.mocked(resolvePlayerDestination).mockImplementation(async (player) => {
      if (player === 'POCKET_CASTS') throw new Error('directory down');
      return {
        player,
        playerName: player,
        destination: links[player],
        temporarilyUnavailable: false,
      };
    });
    await enrichPodcastDestinations(db, bindings, 'episode', 1000);
    expect(savedPlayerLinks((await state()).podcastDestinations)).toEqual({
      OVERCAST: links.OVERCAST,
      APPLE_PODCASTS: links.APPLE_PODCASTS,
    });
    await enrichPodcastDestinations(db, bindings, 'episode', 2000);
    expect(resolvePlayerDestination).toHaveBeenCalledTimes(3);
    vi.mocked(resolvePlayerDestination).mockResolvedValue({
      player: 'POCKET_CASTS',
      playerName: 'Pocket Casts',
      destination: links.POCKET_CASTS,
      temporarilyUnavailable: false,
    });
    await enrichPodcastDestinations(db, bindings, 'episode', 3601000);
    expect(resolvePlayerDestination).toHaveBeenCalledTimes(4);
    expect(savedPlayerLinks((await state()).podcastDestinations)).toEqual(links);
  });
  it('upgrades an available show fallback to an episode later', async () => {
    vi.mocked(resolvePlayerDestination).mockImplementation(async (player) => ({
      player,
      playerName: player,
      destination: { ...links[player], kind: 'show' },
      temporarilyUnavailable: false,
    }));
    await enrichPodcastDestinations(db, bindings, 'episode', 1000);
    vi.mocked(resolvePlayerDestination).mockImplementation(async (player) => ({
      player,
      playerName: player,
      destination: links[player],
      temporarilyUnavailable: false,
    }));
    await enrichPodcastDestinations(db, bindings, 'episode', 3601000);
    expect(savedPlayerLinks((await state()).podcastDestinations)).toEqual(links);
    expect(resolvePlayerDestination).toHaveBeenCalledTimes(5);
  });
  it('backfills existing RSS items through scheduled enrichment without a UI request', async () => {
    await backfillPodcastDestinations(bindings);
    expect(savedPlayerLinks((await state()).podcastDestinations)).toEqual(links);
    await backfillPodcastDestinations(bindings);
    expect(resolvePlayerDestination).toHaveBeenCalledTimes(3);
  });
  it('reads legacy or invalid saved state as no destinations', () => {
    expect(savedPlayerLinks(null)).toEqual({});
    expect(savedPlayerLinks('{bad')).toEqual({});
  });
});
