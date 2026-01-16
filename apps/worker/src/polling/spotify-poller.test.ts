/**
 * Tests for Spotify Polling Provider
 *
 * Tests watermark integrity - ensuring lastPublishedAt is only updated
 * based on successfully ingested episodes, not all fetched episodes.
 *
 * This prevents the critical bug where:
 * 1. Ingestion fails or all episodes are skipped
 * 2. lastPublishedAt gets updated anyway based on ALL fetched episodes
 * 3. Future polls filter out those episodes forever
 * 4. The subscription is stuck with missed episodes
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mock Dependencies
// ============================================================================

// Mock Spotify provider
const mockGetShowEpisodes = vi.fn();
const mockGetMultipleShows = vi.fn();

vi.mock('../providers/spotify', () => ({
  getSpotifyClientForConnection: vi.fn().mockResolvedValue({}),
  getShowEpisodes: (...args: unknown[]) => mockGetShowEpisodes(...args),
  getMultipleShows: (...args: unknown[]) => mockGetMultipleShows(...args),
}));

// Mock ingestion processor
const mockIngestItem = vi.fn();

vi.mock('../ingestion/processor', () => ({
  ingestItem: (...args: unknown[]) => mockIngestItem(...args),
}));

// Mock transformers
vi.mock('../ingestion/transformers', () => ({
  transformSpotifyEpisode: vi.fn((raw) => ({
    id: raw.id,
    title: raw.name,
    publishedAt: new Date(raw.release_date).getTime(),
  })),
}));

// Track database updates
const dbUpdateCalls: Array<{
  subscriptionId: string;
  values: Record<string, unknown>;
}> = [];

// Mock drizzle
vi.mock('drizzle-orm', () => ({
  eq: (field: unknown, value: unknown) => ({ field, value }),
  inArray: (field: unknown, values: unknown[]) => ({ field, values }),
}));

const mockDbUpdate = vi.fn(() => ({
  set: vi.fn((values: Record<string, unknown>) => ({
    where: vi.fn((condition: { value: string }) => {
      dbUpdateCalls.push({ subscriptionId: condition.value, values });
      return Promise.resolve();
    }),
  })),
}));

// ============================================================================
// Test Fixtures
// ============================================================================

const MOCK_NOW = 1705320000000; // 2024-01-15T12:00:00.000Z

function createMockSubscription(overrides: Partial<MockSubscription> = {}): MockSubscription {
  return {
    id: 'sub_spotify_123',
    userId: 'user_test_123',
    provider: 'SPOTIFY',
    providerChannelId: 'show123abc456',
    name: 'Test Podcast',
    status: 'ACTIVE',
    lastPolledAt: null,
    pollIntervalSeconds: 3600,
    lastPublishedAt: null,
    totalItems: null,
    imageUrl: 'https://i.scdn.co/image/abc123',
    ...overrides,
  };
}

function createMockSpotifyEpisode(overrides: Partial<MockSpotifyEpisode> = {}): MockSpotifyEpisode {
  return {
    id: 'episode123',
    name: 'Test Episode',
    description: 'Test description',
    releaseDate: '2024-01-15', // MOCK_NOW day
    durationMs: 3600000,
    externalUrl: 'https://open.spotify.com/episode/episode123',
    images: [{ url: 'https://i.scdn.co/image/episode123', height: 640, width: 640 }],
    isPlayable: true,
    ...overrides,
  };
}

function createMockDb() {
  return {
    update: mockDbUpdate,
    query: {},
  };
}

interface MockSubscription {
  id: string;
  userId: string;
  provider: string;
  providerChannelId: string;
  name: string;
  status: string;
  lastPolledAt: number | null;
  pollIntervalSeconds: number;
  lastPublishedAt: number | null;
  totalItems: number | null;
  imageUrl: string | null;
}

interface MockSpotifyEpisode {
  id: string;
  name: string;
  description: string;
  releaseDate: string;
  durationMs: number;
  externalUrl: string;
  images: Array<{ url: string; height: number; width: number }>;
  isPlayable: boolean;
}

// ============================================================================
// Tests
// ============================================================================

describe('Spotify Poller - Watermark Integrity', () => {
  const originalDateNow = Date.now;

  beforeEach(() => {
    Date.now = vi.fn(() => MOCK_NOW);
    vi.clearAllMocks();
    dbUpdateCalls.length = 0;

    // Default mock implementations
    mockGetShowEpisodes.mockResolvedValue([]);
    mockGetMultipleShows.mockResolvedValue([]);
    mockIngestItem.mockResolvedValue({ created: false, skipped: 'already_exists' });
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  // ==========================================================================
  // pollSingleSpotifySubscription Tests
  // ==========================================================================

  describe('pollSingleSpotifySubscription', () => {
    it('should NOT update lastPublishedAt when ingestion fails for all episodes', async () => {
      const sub = createMockSubscription({
        lastPublishedAt: MOCK_NOW - 86400000, // Yesterday
      });

      // Fetch returns episodes with newer dates
      const episodes = [
        createMockSpotifyEpisode({
          id: 'episode1',
          releaseDate: '2024-01-15', // Today - newer than lastPublishedAt
        }),
      ];
      mockGetShowEpisodes.mockResolvedValue(episodes);

      // But ingestion throws an error for all
      mockIngestItem.mockRejectedValue(new Error('Ingestion failed'));

      const { pollSingleSpotifySubscription } = await import('./spotify-poller');

      const db = createMockDb();
      await pollSingleSpotifySubscription(
        sub as never,
        {} as never, // client
        sub.userId,
        {} as never, // env
        db as never
      );

      // Verify lastPublishedAt was NOT updated
      expect(dbUpdateCalls.length).toBeGreaterThan(0);
      const updateCall = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
      expect(updateCall).toBeDefined();
      expect(updateCall?.values.lastPolledAt).toBeDefined();
      expect(updateCall?.values.lastPublishedAt).toBeUndefined();
    });

    it('should NOT update lastPublishedAt when all episodes are skipped (already seen)', async () => {
      const sub = createMockSubscription({
        lastPublishedAt: MOCK_NOW - 86400000, // Yesterday
      });

      // Fetch returns episodes
      const episodes = [
        createMockSpotifyEpisode({
          id: 'episode1',
          releaseDate: '2024-01-15',
        }),
      ];
      mockGetShowEpisodes.mockResolvedValue(episodes);

      // All episodes are skipped (already seen)
      mockIngestItem.mockResolvedValue({ created: false, skipped: 'already_exists' });

      const { pollSingleSpotifySubscription } = await import('./spotify-poller');

      const db = createMockDb();
      await pollSingleSpotifySubscription(
        sub as never,
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // Verify lastPublishedAt was NOT updated (no new items created)
      const updateCall = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
      expect(updateCall).toBeDefined();
      expect(updateCall?.values.lastPublishedAt).toBeUndefined();
    });

    it('should update lastPublishedAt ONLY to newest successfully ingested episode', async () => {
      const sub = createMockSubscription({
        lastPublishedAt: MOCK_NOW - 172800000, // 2 days ago
      });

      // Fetch returns multiple episodes with different dates
      const episodes = [
        createMockSpotifyEpisode({
          id: 'episode1',
          name: 'Latest Episode',
          releaseDate: '2024-01-15', // Newest
        }),
        createMockSpotifyEpisode({
          id: 'episode2',
          name: 'Older Episode',
          releaseDate: '2024-01-14', // Older
        }),
      ];
      mockGetShowEpisodes.mockResolvedValue(episodes);

      // Only the older episode is successfully ingested
      // The newer one fails
      mockIngestItem
        .mockRejectedValueOnce(new Error('Failed to ingest newest')) // episode1 fails
        .mockResolvedValueOnce({ created: true, itemId: 'item2', userItemId: 'ui2' }); // episode2 succeeds

      const { pollSingleSpotifySubscription } = await import('./spotify-poller');

      const db = createMockDb();
      await pollSingleSpotifySubscription(
        sub as never,
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // Verify lastPublishedAt was updated to the SUCCESSFULLY ingested episode's date
      // NOT the newest fetched episode
      const updateCall = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
      expect(updateCall).toBeDefined();

      // 2024-01-14 at midnight UTC
      const expectedTimestamp = new Date('2024-01-14T00:00:00Z').getTime();
      expect(updateCall?.values.lastPublishedAt).toBe(expectedTimestamp);
    });

    it('should update lastPublishedAt to newest when all episodes ingested successfully', async () => {
      const sub = createMockSubscription({
        lastPublishedAt: MOCK_NOW - 172800000, // 2 days ago
      });

      const episodes = [
        createMockSpotifyEpisode({
          id: 'episode1',
          releaseDate: '2024-01-15', // Newest
        }),
        createMockSpotifyEpisode({
          id: 'episode2',
          releaseDate: '2024-01-14',
        }),
      ];
      mockGetShowEpisodes.mockResolvedValue(episodes);

      // Both episodes succeed
      mockIngestItem.mockResolvedValue({ created: true, itemId: 'item', userItemId: 'ui' });

      const { pollSingleSpotifySubscription } = await import('./spotify-poller');

      const db = createMockDb();
      await pollSingleSpotifySubscription(
        sub as never,
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // lastPublishedAt should be the newest date (2024-01-15)
      const updateCall = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
      const expectedTimestamp = new Date('2024-01-15T00:00:00Z').getTime();
      expect(updateCall?.values.lastPublishedAt).toBe(expectedTimestamp);
    });

    it('should handle mixed success/failure and track correct timestamp', async () => {
      const sub = createMockSubscription({
        lastPublishedAt: MOCK_NOW - 259200000, // 3 days ago
      });

      // Three episodes: Jan 15, Jan 14, Jan 13
      const episodes = [
        createMockSpotifyEpisode({ id: 'ep1', releaseDate: '2024-01-15' }),
        createMockSpotifyEpisode({ id: 'ep2', releaseDate: '2024-01-14' }),
        createMockSpotifyEpisode({ id: 'ep3', releaseDate: '2024-01-13' }),
      ];
      mockGetShowEpisodes.mockResolvedValue(episodes);

      // ep1 fails, ep2 succeeds, ep3 fails
      mockIngestItem
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ created: true, itemId: 'i2', userItemId: 'ui2' })
        .mockRejectedValueOnce(new Error('Failed'));

      const { pollSingleSpotifySubscription } = await import('./spotify-poller');

      const db = createMockDb();
      await pollSingleSpotifySubscription(
        sub as never,
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // Should be Jan 14 (ep2) - the only successfully ingested one
      const updateCall = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
      const expectedTimestamp = new Date('2024-01-14T00:00:00Z').getTime();
      expect(updateCall?.values.lastPublishedAt).toBe(expectedTimestamp);
    });
  });

  // ==========================================================================
  // pollSpotifySubscriptionsBatched Tests
  // ==========================================================================

  describe('pollSpotifySubscriptionsBatched', () => {
    it('should NOT update lastPublishedAt or totalItems when ingestion fails', async () => {
      const sub = createMockSubscription({
        lastPublishedAt: MOCK_NOW - 86400000,
        totalItems: 50,
      });

      // Show has new episodes (delta detected)
      mockGetMultipleShows.mockResolvedValue([
        {
          id: sub.providerChannelId,
          name: 'Test Show',
          totalEpisodes: 55, // 5 new episodes
        },
      ]);

      const episodes = [createMockSpotifyEpisode({ id: 'ep1', releaseDate: '2024-01-15' })];
      mockGetShowEpisodes.mockResolvedValue(episodes);

      // Ingestion fails
      mockIngestItem.mockRejectedValue(new Error('Ingestion failed'));

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      await pollSpotifySubscriptionsBatched(
        [sub as never],
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // Neither lastPublishedAt nor totalItems should be updated
      const updateCall = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
      expect(updateCall).toBeDefined();
      expect(updateCall?.values.lastPublishedAt).toBeUndefined();
      expect(updateCall?.values.totalItems).toBeUndefined();
    });

    it('should update lastPublishedAt AND totalItems only when ingestion succeeds', async () => {
      const sub = createMockSubscription({
        lastPublishedAt: MOCK_NOW - 86400000,
        totalItems: 50,
      });

      mockGetMultipleShows.mockResolvedValue([
        {
          id: sub.providerChannelId,
          name: 'Test Show',
          totalEpisodes: 51,
        },
      ]);

      const episodes = [createMockSpotifyEpisode({ id: 'ep1', releaseDate: '2024-01-15' })];
      mockGetShowEpisodes.mockResolvedValue(episodes);

      // Ingestion succeeds
      mockIngestItem.mockResolvedValue({ created: true, itemId: 'i', userItemId: 'ui' });

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      await pollSpotifySubscriptionsBatched(
        [sub as never],
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // Both should be updated
      const updateCall = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
      expect(updateCall).toBeDefined();
      expect(updateCall?.values.lastPublishedAt).toBeDefined();
      expect(updateCall?.values.totalItems).toBe(51);
    });

    it('should handle partial success across multiple subscriptions', async () => {
      const sub1 = createMockSubscription({
        id: 'sub1',
        providerChannelId: 'show1',
        totalItems: 10,
      });
      const sub2 = createMockSubscription({
        id: 'sub2',
        providerChannelId: 'show2',
        totalItems: 20,
      });

      mockGetMultipleShows.mockResolvedValue([
        { id: 'show1', name: 'Show 1', totalEpisodes: 11 },
        { id: 'show2', name: 'Show 2', totalEpisodes: 21 },
      ]);

      // Both shows have new episodes
      mockGetShowEpisodes
        .mockResolvedValueOnce([createMockSpotifyEpisode({ id: 'ep1' })])
        .mockResolvedValueOnce([createMockSpotifyEpisode({ id: 'ep2' })]);

      // First subscription fails, second succeeds
      mockIngestItem
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ created: true, itemId: 'i', userItemId: 'ui' });

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      await pollSpotifySubscriptionsBatched(
        [sub1 as never, sub2 as never],
        {} as never,
        sub1.userId,
        {} as never,
        db as never
      );

      // sub1 should NOT have lastPublishedAt/totalItems updated
      const update1 = dbUpdateCalls.find((c) => c.subscriptionId === 'sub1');
      expect(update1?.values.lastPublishedAt).toBeUndefined();
      expect(update1?.values.totalItems).toBeUndefined();

      // sub2 SHOULD have both updated
      const update2 = dbUpdateCalls.find((c) => c.subscriptionId === 'sub2');
      expect(update2?.values.lastPublishedAt).toBeDefined();
      expect(update2?.values.totalItems).toBe(21);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty episode list gracefully', async () => {
      const sub = createMockSubscription({ lastPublishedAt: null });

      mockGetShowEpisodes.mockResolvedValue([]);

      const { pollSingleSpotifySubscription } = await import('./spotify-poller');

      const db = createMockDb();
      const result = await pollSingleSpotifySubscription(
        sub as never,
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      expect(result.newItems).toBe(0);
      // lastPolledAt should be updated, but not lastPublishedAt
      const updateCall = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
      expect(updateCall?.values.lastPolledAt).toBeDefined();
    });

    it('should handle first poll (no lastPublishedAt) correctly', async () => {
      const sub = createMockSubscription({ lastPublishedAt: null });

      const episodes = [
        createMockSpotifyEpisode({ id: 'ep1', releaseDate: '2024-01-15' }),
        createMockSpotifyEpisode({ id: 'ep2', releaseDate: '2024-01-14' }),
      ];
      mockGetShowEpisodes.mockResolvedValue(episodes);

      // On first poll, only latest episode is ingested
      mockIngestItem.mockResolvedValue({ created: true, itemId: 'i', userItemId: 'ui' });

      const { pollSingleSpotifySubscription } = await import('./spotify-poller');

      const db = createMockDb();
      await pollSingleSpotifySubscription(
        sub as never,
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // Only latest episode (Jan 15) should set the watermark
      const updateCall = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
      const expectedTimestamp = new Date('2024-01-15T00:00:00Z').getTime();
      expect(updateCall?.values.lastPublishedAt).toBe(expectedTimestamp);
    });

    it('should handle episodes with various date formats', async () => {
      const sub = createMockSubscription({
        lastPublishedAt: new Date('2023-01-01T00:00:00Z').getTime(),
      });

      // Episodes with different date formats (Spotify can return YYYY, YYYY-MM, or YYYY-MM-DD)
      const episodes = [
        createMockSpotifyEpisode({ id: 'ep1', releaseDate: '2024-01-15' }), // Full date
        createMockSpotifyEpisode({ id: 'ep2', releaseDate: '2024-01' }), // Year-month
        createMockSpotifyEpisode({ id: 'ep3', releaseDate: '2024' }), // Year only
      ];
      mockGetShowEpisodes.mockResolvedValue(episodes);

      // All succeed
      mockIngestItem.mockResolvedValue({ created: true, itemId: 'i', userItemId: 'ui' });

      const { pollSingleSpotifySubscription } = await import('./spotify-poller');

      const db = createMockDb();
      await pollSingleSpotifySubscription(
        sub as never,
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // Should use the newest (Jan 15)
      const updateCall = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
      expect(updateCall?.values.lastPublishedAt).toBeDefined();
    });
  });
});

// ============================================================================
// Regression Tests for Bug zine-ej0
// ============================================================================

describe('Regression: zine-ej0 - lastPublishedAt Corruption Bug', () => {
  const originalDateNow = Date.now;
  const MOCK_NOW = 1705320000000;

  beforeEach(() => {
    Date.now = vi.fn(() => MOCK_NOW);
    vi.clearAllMocks();
    dbUpdateCalls.length = 0;
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  it('should NOT advance watermark past failed ingestions - preventing permanent data loss', async () => {
    // This is the EXACT scenario that caused the bug:
    // 1. Poll fetches episode from Jan 15
    // 2. Ingestion fails (error, duplicate check, etc.)
    // 3. OLD BUG: lastPublishedAt updated to Jan 15 anyway
    // 4. Future polls filter out episode <= Jan 15
    // 5. Episode is PERMANENTLY missed

    const sub = createMockSubscription({
      lastPublishedAt: new Date('2024-01-10T00:00:00Z').getTime(), // Jan 10
    });

    // Fetched episode from Jan 15
    const episodes = [
      createMockSpotifyEpisode({
        id: 'missed-episode',
        name: 'This Episode Should Not Be Missed',
        releaseDate: '2024-01-15',
      }),
    ];
    mockGetShowEpisodes.mockResolvedValue(episodes);

    // Ingestion fails
    mockIngestItem.mockRejectedValue(new Error('Database constraint violation'));

    const { pollSingleSpotifySubscription } = await import('./spotify-poller');

    const db = createMockDb();
    await pollSingleSpotifySubscription(
      sub as never,
      {} as never,
      sub.userId,
      {} as never,
      db as never
    );

    // CRITICAL: lastPublishedAt should NOT be updated
    // This ensures the episode can be retried on next poll
    const updateCall = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
    expect(updateCall?.values.lastPublishedAt).toBeUndefined();

    // Verify lastPolledAt IS updated (so we don't poll too frequently)
    expect(updateCall?.values.lastPolledAt).toBeDefined();
  });

  it('should preserve episode recovery opportunity after transient failure', async () => {
    // Scenario: API returns an episode, ingestion fails transiently
    // On retry, the episode should still be picked up

    const sub = createMockSubscription({
      lastPublishedAt: new Date('2024-01-05T00:00:00Z').getTime(),
    });

    // First poll: episode exists, ingestion fails
    const episodes = [createMockSpotifyEpisode({ id: 'recoverable', releaseDate: '2024-01-15' })];
    mockGetShowEpisodes.mockResolvedValue(episodes);
    mockIngestItem.mockRejectedValue(new Error('Transient DB error'));

    const { pollSingleSpotifySubscription } = await import('./spotify-poller');

    const db = createMockDb();
    await pollSingleSpotifySubscription(
      sub as never,
      {} as never,
      sub.userId,
      {} as never,
      db as never
    );

    // Watermark should NOT advance
    const firstUpdate = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
    expect(firstUpdate?.values.lastPublishedAt).toBeUndefined();

    // Simulate retry: same episode, now succeeds
    dbUpdateCalls.length = 0;
    mockIngestItem.mockResolvedValue({ created: true, itemId: 'i', userItemId: 'ui' });

    await pollSingleSpotifySubscription(
      sub as never, // Still has old lastPublishedAt from first call
      {} as never,
      sub.userId,
      {} as never,
      db as never
    );

    // NOW watermark should advance
    const secondUpdate = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
    const expectedTimestamp = new Date('2024-01-15T00:00:00Z').getTime();
    expect(secondUpdate?.values.lastPublishedAt).toBe(expectedTimestamp);
  });
});
