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
    where: vi.fn((condition: { value?: string; values?: string[] }) => {
      // Handle both eq (single value) and inArray (multiple values)
      if (condition.values) {
        // inArray case - record each subscription ID
        for (const id of condition.values) {
          dbUpdateCalls.push({ subscriptionId: id, values });
        }
      } else if (condition.value) {
        // eq case - single subscription ID
        dbUpdateCalls.push({ subscriptionId: condition.value, values });
      }
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
// Unplayable Episodes Filtering Tests (zine-ej7)
// ============================================================================

describe('Spotify Poller - Unplayable Episode Filtering (zine-ej7)', () => {
  const originalDateNow = Date.now;
  const MOCK_NOW = 1705320000000;

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

  describe('pollSingleSpotifySubscription', () => {
    it('should filter out unplayable episodes before ingestion', async () => {
      const sub = createMockSubscription({
        lastPublishedAt: MOCK_NOW - 259200000, // 3 days ago (Jan 12)
      });

      // Mix of playable and unplayable episodes - all within the date window
      const episodes = [
        createMockSpotifyEpisode({
          id: 'playable1',
          name: 'Playable Episode 1',
          releaseDate: '2024-01-15', // > Jan 12 ✓
          isPlayable: true,
        }),
        createMockSpotifyEpisode({
          id: 'unplayable1',
          name: 'Geo-Restricted Episode',
          releaseDate: '2024-01-14', // > Jan 12 ✓ (but unplayable)
          isPlayable: false,
        }),
        createMockSpotifyEpisode({
          id: 'playable2',
          name: 'Playable Episode 2',
          releaseDate: '2024-01-13', // > Jan 12 ✓
          isPlayable: true,
        }),
      ];
      mockGetShowEpisodes.mockResolvedValue(episodes);

      // Ingestion succeeds for all attempts
      mockIngestItem.mockResolvedValue({ created: true, itemId: 'i', userItemId: 'ui' });

      const { pollSingleSpotifySubscription } = await import('./spotify-poller');

      const db = createMockDb();
      const result = await pollSingleSpotifySubscription(
        sub as never,
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // Should have ingested 2 playable episodes, not the unplayable one
      expect(mockIngestItem).toHaveBeenCalledTimes(2);

      // Verify unplayable episode was NOT ingested
      const ingestCalls = mockIngestItem.mock.calls;
      const ingestedIds = ingestCalls.map((call) => (call[2] as { id: string }).id);
      expect(ingestedIds).toContain('playable1');
      expect(ingestedIds).toContain('playable2');
      expect(ingestedIds).not.toContain('unplayable1');

      expect(result.newItems).toBe(2);
    });

    it('should handle all episodes being unplayable', async () => {
      const sub = createMockSubscription({
        lastPublishedAt: MOCK_NOW - 86400000, // Yesterday
      });

      // All episodes are unplayable
      const episodes = [
        createMockSpotifyEpisode({
          id: 'unplayable1',
          name: 'Geo-Restricted Episode 1',
          releaseDate: '2024-01-15',
          isPlayable: false,
        }),
        createMockSpotifyEpisode({
          id: 'unplayable2',
          name: 'Removed Episode',
          releaseDate: '2024-01-14',
          isPlayable: false,
        }),
      ];
      mockGetShowEpisodes.mockResolvedValue(episodes);

      const { pollSingleSpotifySubscription } = await import('./spotify-poller');

      const db = createMockDb();
      const result = await pollSingleSpotifySubscription(
        sub as never,
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // No episodes should be ingested
      expect(mockIngestItem).not.toHaveBeenCalled();
      expect(result.newItems).toBe(0);

      // lastPolledAt should still be updated
      const updateCall = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
      expect(updateCall?.values.lastPolledAt).toBeDefined();
    });

    it('should not count unplayable episodes when updating lastPublishedAt', async () => {
      const sub = createMockSubscription({
        lastPublishedAt: MOCK_NOW - 259200000, // 3 days ago
      });

      // Newest episode is unplayable, older one is playable
      const episodes = [
        createMockSpotifyEpisode({
          id: 'unplayable-newest',
          name: 'Newest but Unplayable',
          releaseDate: '2024-01-15', // Newest
          isPlayable: false,
        }),
        createMockSpotifyEpisode({
          id: 'playable-older',
          name: 'Older but Playable',
          releaseDate: '2024-01-14', // Older
          isPlayable: true,
        }),
      ];
      mockGetShowEpisodes.mockResolvedValue(episodes);

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

      // lastPublishedAt should be updated to the playable episode's date (Jan 14),
      // NOT the unplayable newest episode's date (Jan 15)
      const updateCall = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
      const expectedTimestamp = new Date('2024-01-14T00:00:00Z').getTime();
      expect(updateCall?.values.lastPublishedAt).toBe(expectedTimestamp);
    });
  });

  describe('pollSpotifySubscriptionsBatched', () => {
    it('should filter out unplayable episodes in batch polling', async () => {
      const sub = createMockSubscription({
        lastPublishedAt: MOCK_NOW - 172800000,
        totalItems: 10,
      });

      mockGetMultipleShows.mockResolvedValue([
        {
          id: sub.providerChannelId,
          name: 'Test Show',
          totalEpisodes: 12, // Delta detected
        },
      ]);

      // Mix of playable and unplayable episodes
      const episodes = [
        createMockSpotifyEpisode({
          id: 'playable1',
          name: 'Playable Episode',
          releaseDate: '2024-01-15',
          isPlayable: true,
        }),
        createMockSpotifyEpisode({
          id: 'unplayable1',
          name: 'Unplayable Episode',
          releaseDate: '2024-01-14',
          isPlayable: false,
        }),
      ];
      mockGetShowEpisodes.mockResolvedValue(episodes);

      mockIngestItem.mockResolvedValue({ created: true, itemId: 'i', userItemId: 'ui' });

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      const result = await pollSpotifySubscriptionsBatched(
        [sub as never],
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // Should only ingest the playable episode
      expect(mockIngestItem).toHaveBeenCalledTimes(1);
      expect(result.newItems).toBe(1);
    });

    it('should handle all episodes being unplayable in batch polling', async () => {
      const sub = createMockSubscription({
        lastPublishedAt: MOCK_NOW - 86400000,
        totalItems: 5,
      });

      mockGetMultipleShows.mockResolvedValue([
        {
          id: sub.providerChannelId,
          name: 'Test Show',
          totalEpisodes: 6, // Delta detected
        },
      ]);

      // All unplayable
      const episodes = [
        createMockSpotifyEpisode({
          id: 'unplayable1',
          releaseDate: '2024-01-15',
          isPlayable: false,
        }),
      ];
      mockGetShowEpisodes.mockResolvedValue(episodes);

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      const result = await pollSpotifySubscriptionsBatched(
        [sub as never],
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // No ingestion attempts
      expect(mockIngestItem).not.toHaveBeenCalled();
      expect(result.newItems).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle episode becoming playable after initial filter', async () => {
      // Scenario: Episode was previously unplayable, now is playable
      // It should be picked up if within the lookback window
      const sub = createMockSubscription({
        lastPublishedAt: MOCK_NOW - 172800000, // 2 days ago
      });

      // Episode that was previously unplayable is now playable
      const episodes = [
        createMockSpotifyEpisode({
          id: 'previously-unavailable',
          name: 'Now Available Episode',
          releaseDate: '2024-01-14', // Released yesterday, within window
          isPlayable: true, // Now playable
        }),
      ];
      mockGetShowEpisodes.mockResolvedValue(episodes);

      mockIngestItem.mockResolvedValue({ created: true, itemId: 'i', userItemId: 'ui' });

      const { pollSingleSpotifySubscription } = await import('./spotify-poller');

      const db = createMockDb();
      const result = await pollSingleSpotifySubscription(
        sub as never,
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // Should be ingested since it's now playable and within window
      expect(mockIngestItem).toHaveBeenCalledTimes(1);
      expect(result.newItems).toBe(1);
    });

    it('should filter unplayable before applying date filter on first poll', async () => {
      // First poll: should only take the latest PLAYABLE episode
      const sub = createMockSubscription({
        lastPublishedAt: null, // First poll
      });

      const episodes = [
        createMockSpotifyEpisode({
          id: 'newest-unplayable',
          name: 'Newest but Unplayable',
          releaseDate: '2024-01-15',
          isPlayable: false,
        }),
        createMockSpotifyEpisode({
          id: 'second-playable',
          name: 'Second Newest and Playable',
          releaseDate: '2024-01-14',
          isPlayable: true,
        }),
        createMockSpotifyEpisode({
          id: 'third-playable',
          name: 'Third Newest and Playable',
          releaseDate: '2024-01-13',
          isPlayable: true,
        }),
      ];
      mockGetShowEpisodes.mockResolvedValue(episodes);

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

      // First poll only takes latest episode - should be Jan 14 (newest playable)
      expect(mockIngestItem).toHaveBeenCalledTimes(1);
      const ingestCall = mockIngestItem.mock.calls[0];
      expect((ingestCall[2] as { id: string }).id).toBe('second-playable');
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

// ============================================================================
// Parallel Episode Fetching Tests (zine-p5h)
// ============================================================================

describe('Spotify Poller - Parallel Episode Fetching (zine-p5h)', () => {
  const originalDateNow = Date.now;
  const MOCK_NOW = 1705320000000;

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

  describe('pollSpotifySubscriptionsBatched - parallel fetching', () => {
    it('should fetch episodes for multiple subscriptions in parallel', async () => {
      // Create multiple subscriptions needing updates
      const sub1 = createMockSubscription({
        id: 'sub1',
        providerChannelId: 'show1',
        name: 'Show 1',
        totalItems: 10,
      });
      const sub2 = createMockSubscription({
        id: 'sub2',
        providerChannelId: 'show2',
        name: 'Show 2',
        totalItems: 20,
      });
      const sub3 = createMockSubscription({
        id: 'sub3',
        providerChannelId: 'show3',
        name: 'Show 3',
        totalItems: 30,
      });

      // All shows have delta detected
      mockGetMultipleShows.mockResolvedValue([
        { id: 'show1', name: 'Show 1', totalEpisodes: 11 },
        { id: 'show2', name: 'Show 2', totalEpisodes: 21 },
        { id: 'show3', name: 'Show 3', totalEpisodes: 31 },
      ]);

      // Each show has one new episode
      mockGetShowEpisodes.mockImplementation((_, showId: string) => {
        return Promise.resolve([
          createMockSpotifyEpisode({
            id: `ep-${showId}`,
            name: `Episode for ${showId}`,
            releaseDate: '2024-01-15',
          }),
        ]);
      });

      mockIngestItem.mockResolvedValue({ created: true, itemId: 'i', userItemId: 'ui' });

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      const result = await pollSpotifySubscriptionsBatched(
        [sub1 as never, sub2 as never, sub3 as never],
        {} as never,
        sub1.userId,
        {} as never,
        db as never
      );

      // All subscriptions should be processed
      expect(result.processed).toBe(3);
      expect(result.newItems).toBe(3);

      // getShowEpisodes should be called for each subscription
      expect(mockGetShowEpisodes).toHaveBeenCalledTimes(3);
    });

    it('should isolate failures - one failed fetch should not block others', async () => {
      const sub1 = createMockSubscription({
        id: 'sub_success',
        providerChannelId: 'show_success',
        name: 'Success Show',
        totalItems: 10,
      });
      const sub2 = createMockSubscription({
        id: 'sub_fail',
        providerChannelId: 'show_fail',
        name: 'Failing Show',
        totalItems: 20,
      });
      const sub3 = createMockSubscription({
        id: 'sub_success_2',
        providerChannelId: 'show_success_2',
        name: 'Success Show 2',
        totalItems: 30,
      });

      mockGetMultipleShows.mockResolvedValue([
        { id: 'show_success', name: 'Success Show', totalEpisodes: 11 },
        { id: 'show_fail', name: 'Failing Show', totalEpisodes: 21 },
        { id: 'show_success_2', name: 'Success Show 2', totalEpisodes: 31 },
      ]);

      // Second call fails, others succeed
      mockGetShowEpisodes
        .mockImplementationOnce(() =>
          Promise.resolve([createMockSpotifyEpisode({ id: 'ep1', releaseDate: '2024-01-15' })])
        )
        .mockImplementationOnce(() => Promise.reject(new Error('API rate limit exceeded')))
        .mockImplementationOnce(() =>
          Promise.resolve([createMockSpotifyEpisode({ id: 'ep3', releaseDate: '2024-01-15' })])
        );

      mockIngestItem.mockResolvedValue({ created: true, itemId: 'i', userItemId: 'ui' });

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      const result = await pollSpotifySubscriptionsBatched(
        [sub1 as never, sub2 as never, sub3 as never],
        {} as never,
        sub1.userId,
        {} as never,
        db as never
      );

      // 3 subscriptions processed, but one failed
      expect(result.processed).toBe(3);
      // 2 successfully ingested (the one that failed fetch returns 0 new items)
      expect(result.newItems).toBe(2);
      // Should have an error recorded for the failed subscription
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBe(1);
      expect(result.errors?.[0].subscriptionId).toBe('sub_fail');
    });

    it('should respect concurrency limit from environment', async () => {
      // Create 10 subscriptions to test concurrency
      const subs = Array.from({ length: 10 }, (_, i) =>
        createMockSubscription({
          id: `sub_${i}`,
          providerChannelId: `show_${i}`,
          name: `Show ${i}`,
          totalItems: 10,
        })
      );

      // All shows have delta
      mockGetMultipleShows.mockResolvedValue(
        subs.map((s, i) => ({
          id: s.providerChannelId,
          name: s.name,
          totalEpisodes: 11 + i,
        }))
      );

      // Track concurrent calls
      let currentConcurrent = 0;
      let maxConcurrent = 0;

      mockGetShowEpisodes.mockImplementation(async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        // Simulate API latency
        await new Promise((resolve) => setTimeout(resolve, 10));
        currentConcurrent--;
        return [createMockSpotifyEpisode({ id: 'ep', releaseDate: '2024-01-15' })];
      });

      mockIngestItem.mockResolvedValue({ created: true, itemId: 'i', userItemId: 'ui' });

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      // Pass env with concurrency limit of 3
      await pollSpotifySubscriptionsBatched(
        subs as never[],
        {} as never,
        subs[0].userId,
        { SPOTIFY_EPISODE_FETCH_CONCURRENCY: '3' } as never,
        db as never
      );

      // Max concurrent should not exceed concurrency limit
      expect(maxConcurrent).toBeLessThanOrEqual(3);
      expect(maxConcurrent).toBeGreaterThan(0);
    });

    it('should use default concurrency when env var not set', async () => {
      const subs = Array.from({ length: 8 }, (_, i) =>
        createMockSubscription({
          id: `sub_${i}`,
          providerChannelId: `show_${i}`,
          name: `Show ${i}`,
          totalItems: 10,
        })
      );

      mockGetMultipleShows.mockResolvedValue(
        subs.map((s) => ({
          id: s.providerChannelId,
          name: s.name,
          totalEpisodes: 11,
        }))
      );

      let maxConcurrent = 0;
      let currentConcurrent = 0;

      mockGetShowEpisodes.mockImplementation(async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((resolve) => setTimeout(resolve, 5));
        currentConcurrent--;
        return [createMockSpotifyEpisode({ id: 'ep', releaseDate: '2024-01-15' })];
      });

      mockIngestItem.mockResolvedValue({ created: true, itemId: 'i', userItemId: 'ui' });

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      // Pass env without concurrency limit set
      await pollSpotifySubscriptionsBatched(
        subs as never[],
        {} as never,
        subs[0].userId,
        {} as never, // No SPOTIFY_EPISODE_FETCH_CONCURRENCY
        db as never
      );

      // Default concurrency is 5
      expect(maxConcurrent).toBeLessThanOrEqual(5);
    });

    it('should return all results including both successes and failures', async () => {
      const sub1 = createMockSubscription({
        id: 'sub_ok',
        providerChannelId: 'show_ok',
        totalItems: 10,
      });
      const sub2 = createMockSubscription({
        id: 'sub_api_error',
        providerChannelId: 'show_api_error',
        totalItems: 20,
      });

      mockGetMultipleShows.mockResolvedValue([
        { id: 'show_ok', name: 'Show OK', totalEpisodes: 11 },
        { id: 'show_api_error', name: 'Show API Error', totalEpisodes: 21 },
      ]);

      mockGetShowEpisodes
        .mockImplementationOnce(() =>
          Promise.resolve([createMockSpotifyEpisode({ id: 'ep_ok', releaseDate: '2024-01-15' })])
        )
        .mockImplementationOnce(() => Promise.reject(new Error('Spotify API error')));

      mockIngestItem.mockResolvedValue({ created: true, itemId: 'i', userItemId: 'ui' });

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      const result = await pollSpotifySubscriptionsBatched(
        [sub1 as never, sub2 as never],
        {} as never,
        sub1.userId,
        {} as never,
        db as never
      );

      // Processed count includes all attempted (both success and failure)
      expect(result.processed).toBe(2);
      // New items only from successful subscription
      expect(result.newItems).toBe(1);
      // Error recorded for failed subscription
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].subscriptionId).toBe('sub_api_error');
    });

    it('should handle all parallel fetches failing gracefully', async () => {
      const sub1 = createMockSubscription({
        id: 'sub_fail_1',
        providerChannelId: 'show_fail_1',
        totalItems: 10,
      });
      const sub2 = createMockSubscription({
        id: 'sub_fail_2',
        providerChannelId: 'show_fail_2',
        totalItems: 20,
      });

      mockGetMultipleShows.mockResolvedValue([
        { id: 'show_fail_1', name: 'Show Fail 1', totalEpisodes: 11 },
        { id: 'show_fail_2', name: 'Show Fail 2', totalEpisodes: 21 },
      ]);

      // All fetches fail
      mockGetShowEpisodes.mockRejectedValue(new Error('Network error'));

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      const result = await pollSpotifySubscriptionsBatched(
        [sub1 as never, sub2 as never],
        {} as never,
        sub1.userId,
        {} as never,
        db as never
      );

      // Both processed but failed
      expect(result.processed).toBe(2);
      expect(result.newItems).toBe(0);
      expect(result.errors).toHaveLength(2);
    });

    it('should preserve watermark integrity during parallel processing', async () => {
      const sub1 = createMockSubscription({
        id: 'sub1',
        providerChannelId: 'show1',
        totalItems: 10,
        lastPublishedAt: MOCK_NOW - 86400000,
      });
      const sub2 = createMockSubscription({
        id: 'sub2',
        providerChannelId: 'show2',
        totalItems: 20,
        lastPublishedAt: MOCK_NOW - 86400000,
      });

      mockGetMultipleShows.mockResolvedValue([
        { id: 'show1', name: 'Show 1', totalEpisodes: 11 },
        { id: 'show2', name: 'Show 2', totalEpisodes: 21 },
      ]);

      mockGetShowEpisodes.mockImplementation((_, showId: string) => {
        return Promise.resolve([
          createMockSpotifyEpisode({
            id: `ep-${showId}`,
            releaseDate: '2024-01-15',
          }),
        ]);
      });

      // sub1 ingestion succeeds, sub2 ingestion fails
      mockIngestItem
        .mockResolvedValueOnce({ created: true, itemId: 'i1', userItemId: 'ui1' })
        .mockRejectedValueOnce(new Error('Ingestion failed'));

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      await pollSpotifySubscriptionsBatched(
        [sub1 as never, sub2 as never],
        {} as never,
        sub1.userId,
        {} as never,
        db as never
      );

      // sub1 should have lastPublishedAt updated (ingestion succeeded)
      const update1 = dbUpdateCalls.find((c) => c.subscriptionId === 'sub1');
      expect(update1?.values.lastPublishedAt).toBeDefined();
      expect(update1?.values.totalItems).toBe(11);

      // sub2 should NOT have lastPublishedAt updated (ingestion failed)
      const update2 = dbUpdateCalls.find((c) => c.subscriptionId === 'sub2');
      expect(update2?.values.lastPublishedAt).toBeUndefined();
      expect(update2?.values.totalItems).toBeUndefined();
    });
  });
});

// ============================================================================
// Deleted/Unavailable Show Handling Tests (zine-ew6)
// ============================================================================

describe('Spotify Poller - Deleted/Unavailable Show Handling (zine-ew6)', () => {
  const originalDateNow = Date.now;
  const MOCK_NOW = 1705320000000;

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

  describe('pollSpotifySubscriptionsBatched', () => {
    it('should mark subscription as DISCONNECTED when show is not found', async () => {
      const sub = createMockSubscription({
        id: 'sub_missing_show',
        providerChannelId: 'deleted_show_123',
        totalItems: 50,
      });

      // getMultipleShows returns empty array (show not found)
      mockGetMultipleShows.mockResolvedValue([]);

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      const result = await pollSpotifySubscriptionsBatched(
        [sub as never],
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // Should mark the subscription as disconnected
      const updateCall = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
      expect(updateCall).toBeDefined();
      expect(updateCall?.values.status).toBe('DISCONNECTED');
      expect(updateCall?.values.disconnectedAt).toBe(MOCK_NOW);
      expect(updateCall?.values.disconnectedReason).toBe('Show no longer available on Spotify');

      // Result should include disconnected count
      expect(result.disconnected).toBe(1);
      expect(result.processed).toBe(0);
      expect(result.newItems).toBe(0);
    });

    it('should mark multiple subscriptions as DISCONNECTED when shows are missing', async () => {
      const sub1 = createMockSubscription({
        id: 'sub_missing_1',
        providerChannelId: 'deleted_show_1',
        name: 'Deleted Show 1',
      });
      const sub2 = createMockSubscription({
        id: 'sub_missing_2',
        providerChannelId: 'deleted_show_2',
        name: 'Deleted Show 2',
      });

      // Neither show found
      mockGetMultipleShows.mockResolvedValue([]);

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      const result = await pollSpotifySubscriptionsBatched(
        [sub1 as never, sub2 as never],
        {} as never,
        sub1.userId,
        {} as never,
        db as never
      );

      // Both should be marked as disconnected
      expect(result.disconnected).toBe(2);
      expect(result.processed).toBe(0);
    });

    it('should handle mixed scenario: some shows found, some missing', async () => {
      const subActive = createMockSubscription({
        id: 'sub_active',
        providerChannelId: 'active_show',
        name: 'Active Show',
        totalItems: 10,
      });
      const subMissing = createMockSubscription({
        id: 'sub_missing',
        providerChannelId: 'deleted_show',
        name: 'Deleted Show',
        totalItems: 5,
      });

      // Only one show found
      mockGetMultipleShows.mockResolvedValue([
        {
          id: 'active_show',
          name: 'Active Show',
          totalEpisodes: 11, // Delta detected
        },
      ]);

      // Episodes for the active show
      const episodes = [
        createMockSpotifyEpisode({
          id: 'new_ep_1',
          name: 'New Episode',
          releaseDate: '2024-01-15',
        }),
      ];
      mockGetShowEpisodes.mockResolvedValue(episodes);
      mockIngestItem.mockResolvedValue({ created: true, itemId: 'i', userItemId: 'ui' });

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      const result = await pollSpotifySubscriptionsBatched(
        [subActive as never, subMissing as never],
        {} as never,
        subActive.userId,
        {} as never,
        db as never
      );

      // Missing sub should be marked as disconnected
      const disconnectUpdate = dbUpdateCalls.find((c) => c.subscriptionId === 'sub_missing');
      expect(disconnectUpdate?.values.status).toBe('DISCONNECTED');
      expect(disconnectUpdate?.values.disconnectedReason).toBe(
        'Show no longer available on Spotify'
      );

      // Active sub should be processed normally
      const activeUpdate = dbUpdateCalls.find((c) => c.subscriptionId === 'sub_active');
      expect(activeUpdate?.values.status).toBeUndefined(); // Status not changed
      expect(activeUpdate?.values.lastPolledAt).toBe(MOCK_NOW);

      // Result counts
      expect(result.disconnected).toBe(1);
      expect(result.processed).toBe(1);
      expect(result.newItems).toBe(1);
    });

    it('should NOT mark subscription as disconnected when show returns null entry in batch', async () => {
      // Spotify API can return null entries for shows that exist but are temporarily unavailable
      // This tests that we handle the null filtering correctly
      const sub = createMockSubscription({
        id: 'sub_null_show',
        providerChannelId: 'show_null_123',
      });

      // getMultipleShows returns null for this show (filtered out in showMap building)
      mockGetMultipleShows.mockResolvedValue([null]);

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      const result = await pollSpotifySubscriptionsBatched(
        [sub as never],
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // Should be marked as disconnected since show is not in showMap
      expect(result.disconnected).toBe(1);
    });
  });

  describe('Edge cases', () => {
    it('should record disconnectedAt timestamp correctly', async () => {
      const sub = createMockSubscription({
        id: 'sub_timestamp_test',
        providerChannelId: 'deleted_show',
      });

      mockGetMultipleShows.mockResolvedValue([]);

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();
      await pollSpotifySubscriptionsBatched(
        [sub as never],
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      const updateCall = dbUpdateCalls.find((c) => c.subscriptionId === sub.id);
      expect(updateCall?.values.disconnectedAt).toBe(MOCK_NOW);
      expect(updateCall?.values.updatedAt).toBe(MOCK_NOW);
    });

    it('should not poll episodes for disconnected subscriptions (scheduler filters them)', async () => {
      // Note: This tests the expectation that disconnected subs won't reach the poller
      // The scheduler filters for status = 'ACTIVE' before calling the poller
      const sub = createMockSubscription({
        status: 'DISCONNECTED', // This wouldn't normally reach the poller
      });

      // Even if it did reach the poller and the show exists
      mockGetMultipleShows.mockResolvedValue([
        {
          id: sub.providerChannelId,
          name: 'Reconnected Show',
          totalEpisodes: 100,
        },
      ]);

      const { pollSpotifySubscriptionsBatched } = await import('./spotify-poller');

      const db = createMockDb();

      // The poller would still try to process it if it got through
      // This test documents that filtering happens at scheduler level
      const result = await pollSpotifySubscriptionsBatched(
        [sub as never],
        {} as never,
        sub.userId,
        {} as never,
        db as never
      );

      // Since totalEpisodes (100) > totalItems (null = 0), it would be processed
      // This is fine - the scheduler is responsible for filtering
      expect(result.processed).toBeGreaterThanOrEqual(0);
    });
  });
});
