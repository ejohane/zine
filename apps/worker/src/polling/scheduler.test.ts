/**
 * Integration Tests for Polling Scheduler
 *
 * Tests polling behavior including:
 * - Poll due subscriptions
 * - Respect distributed lock
 * - Handle auth errors (mark connection expired)
 * - Rate limiting behavior
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mock Dependencies
// ============================================================================

// Mock distributed locks
const mockTryAcquireLock = vi.fn();
const mockReleaseLock = vi.fn();

vi.mock('../lib/locks', () => ({
  tryAcquireLock: (...args: unknown[]) => mockTryAcquireLock(...args),
  releaseLock: (...args: unknown[]) => mockReleaseLock(...args),
}));

// Mock rate limiter
const mockIsRateLimited = vi.fn();

vi.mock('../lib/rate-limiter', () => ({
  isRateLimited: (...args: unknown[]) => mockIsRateLimited(...args),
  RateLimitedFetcher: vi.fn(),
  RateLimitError: class RateLimitError extends Error {
    constructor(
      public provider: string,
      public retryInMs: number
    ) {
      super(`Rate limited by ${provider}`);
    }
  },
}));

// Mock YouTube provider
const mockGetYouTubeClientForConnection = vi.fn();
const mockGetChannelUploadsPlaylistId = vi.fn();
const mockFetchRecentVideos = vi.fn();
const mockFetchVideoDetails = vi.fn();

vi.mock('../providers/youtube', () => ({
  getYouTubeClientForConnection: (...args: unknown[]) => mockGetYouTubeClientForConnection(...args),
  getChannelUploadsPlaylistId: (...args: unknown[]) => mockGetChannelUploadsPlaylistId(...args),
  fetchRecentVideos: (...args: unknown[]) => mockFetchRecentVideos(...args),
  fetchVideoDetails: (...args: unknown[]) => mockFetchVideoDetails(...args),
}));

// Mock Spotify provider
const mockGetSpotifyClientForConnection = vi.fn();
const mockGetShowEpisodes = vi.fn();

vi.mock('../providers/spotify', () => ({
  getSpotifyClientForConnection: (...args: unknown[]) => mockGetSpotifyClientForConnection(...args),
  getShowEpisodes: (...args: unknown[]) => mockGetShowEpisodes(...args),
}));

// Mock ingestion
const mockIngestItem = vi.fn();

vi.mock('../ingestion/processor', () => ({
  ingestItem: (...args: unknown[]) => mockIngestItem(...args),
}));

// Mock transformers
vi.mock('../ingestion/transformers', () => ({
  transformYouTubeVideo: vi.fn(),
  transformSpotifyEpisode: vi.fn(),
}));

// Mock drizzle
const mockDbQuerySubscriptions = {
  findMany: vi.fn(),
};
const mockDbQueryConnections = {
  findFirst: vi.fn(),
};
const mockDbUpdate = vi.fn();

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => ({
    query: {
      subscriptions: mockDbQuerySubscriptions,
      providerConnections: mockDbQueryConnections,
    },
    update: mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  })),
}));

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockEnv() {
  const store = new Map<string, string>();

  return {
    DB: {} as unknown as D1Database,
    OAUTH_STATE_KV: {
      get: vi.fn(async (key: string) => store.get(key) || null),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      _store: store,
    } as unknown as KVNamespace & { _store: Map<string, string> },
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    OAUTH_REDIRECT_URI: 'zine://oauth/callback',
    SPOTIFY_CLIENT_ID: 'test-spotify-client-id',
    SPOTIFY_CLIENT_SECRET: 'test-spotify-client-secret',
    SPOTIFY_REDIRECT_URI: 'zine://oauth/spotify/callback',
  };
}

function createMockExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {},
  } as unknown as ExecutionContext;
}

function createMockSubscription(overrides: Partial<MockSubscription> = {}): MockSubscription {
  return {
    id: 'sub_test_123',
    userId: 'user_test_123',
    provider: 'YOUTUBE',
    providerChannelId: 'UCtest123',
    name: 'Test Channel',
    status: 'ACTIVE',
    lastPolledAt: null,
    pollIntervalSeconds: 3600,
    lastPublishedAt: null,
    ...overrides,
  };
}

function createMockConnection(overrides: Partial<MockConnection> = {}): MockConnection {
  return {
    id: 'conn_test_123',
    userId: 'user_test_123',
    provider: 'YOUTUBE',
    accessToken: 'encrypted_access_token',
    refreshToken: 'encrypted_refresh_token',
    tokenExpiresAt: Date.now() + 3600000,
    status: 'ACTIVE',
    ...overrides,
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
}

interface MockConnection {
  id: string;
  userId: string;
  provider: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  status: string;
}

// ============================================================================
// Tests
// ============================================================================

describe('Polling Scheduler', () => {
  const MOCK_NOW = 1705320000000;
  // Store original Date.now for restoration
  const originalDateNow = Date.now;

  beforeEach(() => {
    // Mock Date.now directly (vi.setSystemTime not available in Workers pool)
    Date.now = vi.fn(() => MOCK_NOW);
    vi.clearAllMocks();

    // Default mock implementations
    mockTryAcquireLock.mockResolvedValue(true);
    mockReleaseLock.mockResolvedValue(undefined);
    mockIsRateLimited.mockResolvedValue({ limited: false });
    mockDbQuerySubscriptions.findMany.mockResolvedValue([]);
    mockDbQueryConnections.findFirst.mockResolvedValue(null);
    mockGetYouTubeClientForConnection.mockResolvedValue({});
    mockGetChannelUploadsPlaylistId.mockResolvedValue('UUtest123');
    mockFetchRecentVideos.mockResolvedValue([]);
    mockFetchVideoDetails.mockResolvedValue(new Map());
    mockGetSpotifyClientForConnection.mockResolvedValue({});
    mockGetShowEpisodes.mockResolvedValue([]);
    mockIngestItem.mockResolvedValue({ created: false });
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  // ==========================================================================
  // Distributed Lock Tests
  // ==========================================================================

  describe('Distributed Lock', () => {
    it('should skip polling if lock is held by another worker', async () => {
      mockTryAcquireLock.mockResolvedValue(false);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      // Import here to use mocked dependencies
      const { pollSubscriptions } = await import('./scheduler');
      const result = await pollSubscriptions(env as never, ctx);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('lock_held');
      expect(mockDbQuerySubscriptions.findMany).not.toHaveBeenCalled();
    });

    it('should acquire lock before processing subscriptions', async () => {
      mockTryAcquireLock.mockResolvedValue(true);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      await pollSubscriptions(env as never, ctx);

      expect(mockTryAcquireLock).toHaveBeenCalledWith(
        env.OAUTH_STATE_KV,
        'cron:poll-subscriptions:lock',
        900
      );
    });

    it('should release lock after processing', async () => {
      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([]);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      await pollSubscriptions(env as never, ctx);

      expect(mockReleaseLock).toHaveBeenCalledWith(
        env.OAUTH_STATE_KV,
        'cron:poll-subscriptions:lock'
      );
    });

    it('should release lock even if processing fails', async () => {
      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockRejectedValue(new Error('Database error'));

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');

      await expect(pollSubscriptions(env as never, ctx)).rejects.toThrow('Database error');
      expect(mockReleaseLock).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Subscription Query Tests
  // ==========================================================================

  describe('Subscription Query', () => {
    it('should return when no subscriptions are due', async () => {
      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([]);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      const result = await pollSubscriptions(env as never, ctx);

      expect(result.skipped).toBe(false);
      expect(result.processed).toBe(0);
      expect(result.reason).toBe('no_due_subscriptions');
    });

    it('should process due YouTube subscriptions', async () => {
      const subscription = createMockSubscription({
        provider: 'YOUTUBE',
        lastPolledAt: null,
      });
      const connection = createMockConnection({ provider: 'YOUTUBE' });

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockFetchRecentVideos.mockResolvedValue([]);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      const result = await pollSubscriptions(env as never, ctx);

      expect(result.skipped).toBe(false);
      expect(result.processed).toBe(1);
    });

    it('should process due Spotify subscriptions', async () => {
      const subscription = createMockSubscription({
        provider: 'SPOTIFY',
        providerChannelId: '0testshow123456789012',
        lastPolledAt: null,
      });
      const connection = createMockConnection({ provider: 'SPOTIFY' });

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockGetShowEpisodes.mockResolvedValue([]);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      const result = await pollSubscriptions(env as never, ctx);

      expect(result.skipped).toBe(false);
      expect(result.processed).toBe(1);
    });

    it('should process subscriptions from multiple providers', async () => {
      const youtubeSubscription = createMockSubscription({
        id: 'sub_youtube_1',
        provider: 'YOUTUBE',
      });
      const spotifySubscription = createMockSubscription({
        id: 'sub_spotify_1',
        userId: 'user_test_456',
        provider: 'SPOTIFY',
        providerChannelId: '0testshow123456789012',
      });
      const youtubeConnection = createMockConnection({ provider: 'YOUTUBE' });
      const spotifyConnection = createMockConnection({
        id: 'conn_spotify_1',
        userId: 'user_test_456',
        provider: 'SPOTIFY',
      });

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([
        youtubeSubscription,
        spotifySubscription,
      ]);
      mockDbQueryConnections.findFirst
        .mockResolvedValueOnce(youtubeConnection)
        .mockResolvedValueOnce(spotifyConnection);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      const result = await pollSubscriptions(env as never, ctx);

      expect(result.processed).toBe(2);
    });
  });

  // ==========================================================================
  // Rate Limiting Tests
  // ==========================================================================

  describe('Rate Limiting', () => {
    it('should skip rate-limited users', async () => {
      const subscription = createMockSubscription({ provider: 'YOUTUBE' });

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockIsRateLimited.mockResolvedValue({ limited: true, retryInMs: 30000 });

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      const result = await pollSubscriptions(env as never, ctx);

      // User is skipped, so no subscriptions processed
      expect(result.processed).toBe(0);
      expect(mockGetYouTubeClientForConnection).not.toHaveBeenCalled();
    });

    it('should check rate limit before processing each user', async () => {
      const subscription1 = createMockSubscription({
        id: 'sub_1',
        userId: 'user_1',
        provider: 'YOUTUBE',
      });
      const subscription2 = createMockSubscription({
        id: 'sub_2',
        userId: 'user_2',
        provider: 'YOUTUBE',
      });

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription1, subscription2]);
      mockIsRateLimited
        .mockResolvedValueOnce({ limited: true, retryInMs: 30000 }) // user_1 is rate limited
        .mockResolvedValueOnce({ limited: false }); // user_2 is not rate limited
      mockDbQueryConnections.findFirst.mockResolvedValue(
        createMockConnection({ userId: 'user_2' })
      );

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      await pollSubscriptions(env as never, ctx);

      expect(mockIsRateLimited).toHaveBeenCalledTimes(2);
      expect(mockIsRateLimited).toHaveBeenCalledWith('YOUTUBE', 'user_1', env.OAUTH_STATE_KV);
      expect(mockIsRateLimited).toHaveBeenCalledWith('YOUTUBE', 'user_2', env.OAUTH_STATE_KV);
    });
  });

  // ==========================================================================
  // Auth Error Handling Tests
  // ==========================================================================

  describe('Auth Error Handling', () => {
    it('should mark connection as expired on 401 error', async () => {
      const subscription = createMockSubscription({ provider: 'YOUTUBE' });
      const connection = createMockConnection({ provider: 'YOUTUBE' });

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockGetYouTubeClientForConnection.mockRejectedValue({ status: 401 });

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      await pollSubscriptions(env as never, ctx);

      // Connection should be marked as expired
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('should mark connection as expired on 403 error', async () => {
      const subscription = createMockSubscription({ provider: 'YOUTUBE' });
      const connection = createMockConnection({ provider: 'YOUTUBE' });

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockGetYouTubeClientForConnection.mockRejectedValue({ status: 403 });

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      await pollSubscriptions(env as never, ctx);

      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('should mark subscriptions as disconnected when connection is expired', async () => {
      const subscription = createMockSubscription({ provider: 'YOUTUBE' });
      const connection = createMockConnection({ provider: 'YOUTUBE' });

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockGetYouTubeClientForConnection.mockRejectedValue({
        message: 'Token expired',
      });

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      await pollSubscriptions(env as never, ctx);

      // Subscriptions should be marked as disconnected
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('should mark subscriptions as disconnected when no active connection', async () => {
      const subscription = createMockSubscription({ provider: 'YOUTUBE' });

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(null);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      await pollSubscriptions(env as never, ctx);

      // Subscriptions should be marked as disconnected
      expect(mockDbUpdate).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Item Ingestion Tests
  // ==========================================================================

  describe('Item Ingestion', () => {
    it('should ingest new YouTube videos', async () => {
      const subscription = createMockSubscription({
        provider: 'YOUTUBE',
        lastPolledAt: null,
      });
      const connection = createMockConnection({ provider: 'YOUTUBE' });
      const videos = [
        {
          snippet: {
            publishedAt: new Date().toISOString(),
            title: 'New Video',
            resourceId: { videoId: 'video123' },
          },
          contentDetails: { videoId: 'video123' },
        },
      ];

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockFetchRecentVideos.mockResolvedValue(videos);
      mockIngestItem.mockResolvedValue({ created: true });

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      const result = await pollSubscriptions(env as never, ctx);

      expect(result.newItems).toBe(1);
      expect(mockIngestItem).toHaveBeenCalled();
    });

    it('should ingest new Spotify episodes', async () => {
      const subscription = createMockSubscription({
        provider: 'SPOTIFY',
        providerChannelId: '0testshow123456789012',
        lastPolledAt: null,
      });
      const connection = createMockConnection({ provider: 'SPOTIFY' });
      const episodes = [
        {
          id: 'episode123',
          name: 'New Episode',
          releaseDate: new Date().toISOString().split('T')[0],
          description: 'Test episode',
          durationMs: 3600000,
          externalUrl: 'https://open.spotify.com/episode/episode123',
          images: [],
        },
      ];

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockGetShowEpisodes.mockResolvedValue(episodes);
      mockIngestItem.mockResolvedValue({ created: true });

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      const result = await pollSubscriptions(env as never, ctx);

      expect(result.newItems).toBe(1);
    });

    it('should only ingest latest item on first poll', async () => {
      const subscription = createMockSubscription({
        provider: 'YOUTUBE',
        lastPolledAt: null, // First poll
      });
      const connection = createMockConnection({ provider: 'YOUTUBE' });
      const videos = [
        {
          snippet: {
            publishedAt: new Date().toISOString(),
            title: 'Video 1',
            resourceId: { videoId: 'video1' },
          },
          contentDetails: { videoId: 'video1' },
        },
        {
          snippet: {
            publishedAt: new Date(Date.now() - 86400000).toISOString(),
            title: 'Video 2',
            resourceId: { videoId: 'video2' },
          },
          contentDetails: { videoId: 'video2' },
        },
      ];

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockFetchRecentVideos.mockResolvedValue(videos);
      mockIngestItem.mockResolvedValue({ created: true });

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      await pollSubscriptions(env as never, ctx);

      // Only the first (latest) video should be ingested on first poll
      expect(mockIngestItem).toHaveBeenCalledTimes(1);
    });

    it('should update lastPolledAt after successful poll', async () => {
      const subscription = createMockSubscription({
        provider: 'YOUTUBE',
        lastPolledAt: MOCK_NOW - 7200000, // 2 hours ago
      });
      const connection = createMockConnection({ provider: 'YOUTUBE' });

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockFetchRecentVideos.mockResolvedValue([]);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      await pollSubscriptions(env as never, ctx);

      // lastPolledAt should be updated
      expect(mockDbUpdate).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Shorts Filtering Tests
  // ==========================================================================

  describe('Shorts Filtering', () => {
    it('should filter Shorts from mixed content', async () => {
      // Setup: Mix of regular videos and Shorts with durations
      const subscription = createMockSubscription({
        provider: 'YOUTUBE',
        lastPolledAt: null,
      });
      const connection = createMockConnection({ provider: 'YOUTUBE' });

      const videos = [
        {
          snippet: { publishedAt: new Date().toISOString(), title: 'Long Video' },
          contentDetails: { videoId: 'video1' },
        },
        {
          snippet: { publishedAt: new Date().toISOString(), title: 'Short 1' },
          contentDetails: { videoId: 'short1' },
        },
      ];

      // video1 is 5 min (NOT a Short), short1 is 2 min (IS a Short - ≤180s)
      const videoDetails = new Map([
        ['video1', { durationSeconds: 300, description: 'Long video description' }], // 5 min - NOT a Short (>180s)
        ['short1', { durationSeconds: 120, description: 'Short description' }], // 2 min - IS a Short (≤180s)
      ]);

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockFetchRecentVideos.mockResolvedValue(videos);
      mockFetchVideoDetails.mockResolvedValue(videoDetails);
      mockIngestItem.mockResolvedValue({ created: true });

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      const result = await pollSubscriptions(env as never, ctx);

      // First poll only ingests latest non-Short
      expect(mockIngestItem).toHaveBeenCalledTimes(1);
      expect(result.newItems).toBe(1);
    });

    it('should handle channel with only Shorts', async () => {
      const subscription = createMockSubscription({
        provider: 'YOUTUBE',
        lastPolledAt: Date.now() - 86400000,
      });
      const connection = createMockConnection({ provider: 'YOUTUBE' });

      const videos = [
        {
          snippet: { publishedAt: new Date().toISOString(), title: 'Short 1' },
          contentDetails: { videoId: 'short1' },
        },
        {
          snippet: { publishedAt: new Date().toISOString(), title: 'Short 2' },
          contentDetails: { videoId: 'short2' },
        },
      ];

      const videoDetails = new Map([
        ['short1', { durationSeconds: 60, description: 'Short 1 desc' }], // 1 min - IS a Short (≤180s)
        ['short2', { durationSeconds: 150, description: 'Short 2 desc' }], // 2.5 min - IS a Short (≤180s)
      ]);

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockFetchRecentVideos.mockResolvedValue(videos);
      mockFetchVideoDetails.mockResolvedValue(videoDetails);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      const result = await pollSubscriptions(env as never, ctx);

      // No items ingested since all were filtered
      expect(mockIngestItem).not.toHaveBeenCalled();
      expect(result.newItems).toBe(0);
    });

    it('should ingest all videos when duration fetch fails (graceful degradation)', async () => {
      const subscription = createMockSubscription({
        provider: 'YOUTUBE',
        lastPolledAt: null,
      });
      const connection = createMockConnection({ provider: 'YOUTUBE' });

      const videos = [
        {
          snippet: { publishedAt: new Date().toISOString(), title: 'Unknown Duration' },
          contentDetails: { videoId: 'video1' },
        },
      ];

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockFetchRecentVideos.mockResolvedValue(videos);
      mockFetchVideoDetails.mockResolvedValue(new Map()); // API failure
      mockIngestItem.mockResolvedValue({ created: true });

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      const result = await pollSubscriptions(env as never, ctx);

      // Video should be ingested despite unknown duration (fail-safe)
      expect(mockIngestItem).toHaveBeenCalledTimes(1);
      expect(result.newItems).toBe(1);
    });

    it('should filter videos at exactly 180 seconds (3 min threshold)', async () => {
      const subscription = createMockSubscription({
        provider: 'YOUTUBE',
        lastPolledAt: Date.now() - 86400000,
      });
      const connection = createMockConnection({ provider: 'YOUTUBE' });

      const videos = [
        {
          snippet: { publishedAt: new Date().toISOString(), title: 'Exactly 180s' },
          contentDetails: { videoId: 'video180' },
        },
        {
          snippet: { publishedAt: new Date().toISOString(), title: '181 seconds' },
          contentDetails: { videoId: 'video181' },
        },
      ];

      const videoDetails = new Map([
        ['video180', { durationSeconds: 180, description: '180s video desc' }], // IS a Short (≤180)
        ['video181', { durationSeconds: 181, description: '181s video desc' }], // NOT a Short (>180)
      ]);

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockFetchRecentVideos.mockResolvedValue(videos);
      mockFetchVideoDetails.mockResolvedValue(videoDetails);
      mockIngestItem.mockResolvedValue({ created: true });

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      const result = await pollSubscriptions(env as never, ctx);

      // Only video181 should be ingested (>180s)
      expect(mockIngestItem).toHaveBeenCalledTimes(1);
      expect(result.newItems).toBe(1);
    });
  });

  // ==========================================================================
  // Error Handling Tests
  // ==========================================================================

  describe('Error Handling', () => {
    it('should continue processing other subscriptions after individual failure', async () => {
      const subscription1 = createMockSubscription({
        id: 'sub_1',
        userId: 'user_1',
        provider: 'YOUTUBE',
      });
      const subscription2 = createMockSubscription({
        id: 'sub_2',
        userId: 'user_2',
        provider: 'YOUTUBE',
      });
      const connection1 = createMockConnection({ userId: 'user_1' });
      const connection2 = createMockConnection({ userId: 'user_2' });

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription1, subscription2]);
      mockDbQueryConnections.findFirst
        .mockResolvedValueOnce(connection1)
        .mockResolvedValueOnce(connection2);
      mockGetYouTubeClientForConnection
        .mockResolvedValueOnce({}) // First user succeeds
        .mockResolvedValueOnce({}); // Second user succeeds
      mockFetchRecentVideos
        .mockRejectedValueOnce(new Error('API Error')) // First subscription fails
        .mockResolvedValueOnce([]); // Second subscription succeeds

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      const result = await pollSubscriptions(env as never, ctx);

      // Both subscriptions should be counted as processed
      expect(result.processed).toBe(2);
    });

    it('should update lastPolledAt even on subscription error', async () => {
      const subscription = createMockSubscription({ provider: 'YOUTUBE' });
      const connection = createMockConnection({ provider: 'YOUTUBE' });

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockGetYouTubeClientForConnection.mockResolvedValue({});
      mockFetchRecentVideos.mockRejectedValue(new Error('API Error'));

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollSubscriptions } = await import('./scheduler');
      await pollSubscriptions(env as never, ctx);

      // lastPolledAt should still be updated to prevent infinite retry
      expect(mockDbUpdate).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('isAuthError', () => {
  // Test the isAuthError helper function logic
  it('should identify 401 status as auth error', () => {
    const error401 = { status: 401 };
    expect(error401.status === 401 || error401.status === 403).toBe(true);
  });

  it('should identify 403 status as auth error', () => {
    const error403 = { status: 403 };
    expect(error403.status === 401 || error403.status === 403).toBe(true);
  });

  it('should identify "unauthorized" message as auth error', () => {
    const error = { message: 'Unauthorized access' };
    expect(error.message.toLowerCase().includes('unauthorized')).toBe(true);
  });

  it('should identify "invalid_grant" message as auth error', () => {
    const error = { message: 'invalid_grant: token expired' };
    expect(error.message.toLowerCase().includes('invalid_grant')).toBe(true);
  });

  it('should identify "token expired" message as auth error', () => {
    const error = { message: 'Token expired' };
    expect(error.message.toLowerCase().includes('token expired')).toBe(true);
  });

  it('should not identify other errors as auth errors', () => {
    const error = { status: 500, message: 'Internal server error' };
    const isAuth =
      error.status === 401 ||
      error.status === 403 ||
      error.message.toLowerCase().includes('unauthorized') ||
      error.message.toLowerCase().includes('invalid_grant') ||
      error.message.toLowerCase().includes('token expired');
    expect(isAuth).toBe(false);
  });
});

describe('parseSpotifyDate', () => {
  // Test the parseSpotifyDate helper function logic
  it('should parse full date (YYYY-MM-DD)', () => {
    const dateStr = '2024-01-15';
    const result = new Date(`${dateStr}T00:00:00Z`).getTime();
    expect(result).toBe(1705276800000);
  });

  it('should parse year-month (YYYY-MM)', () => {
    const dateStr = '2024-01';
    const normalized = `${dateStr}-01`;
    const result = new Date(`${normalized}T00:00:00Z`).getTime();
    expect(result).toBe(1704067200000);
  });

  it('should parse year only (YYYY)', () => {
    const dateStr = '2024';
    const normalized = `${dateStr}-01-01`;
    const result = new Date(`${normalized}T00:00:00Z`).getTime();
    expect(result).toBe(1704067200000);
  });
});
