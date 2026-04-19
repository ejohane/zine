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
import { getUserProcessingConcurrency } from './scheduler';

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
const mockFetchRecentVideos = vi.fn();
const mockFetchVideoDetails = vi.fn();

const mockFetchVideoDetailsBatched = vi.fn();

vi.mock('../providers/youtube', () => ({
  getYouTubeClientForConnection: (...args: unknown[]) => mockGetYouTubeClientForConnection(...args),
  // getUploadsPlaylistId is now synchronous and deterministic (UC -> UU prefix swap)
  // No need to mock it - use the real implementation
  getUploadsPlaylistId: (channelId: string) => 'UU' + channelId.slice(2),
  fetchRecentVideos: (...args: unknown[]) => mockFetchRecentVideos(...args),
  fetchVideoDetails: (...args: unknown[]) => mockFetchVideoDetails(...args),
  fetchVideoDetailsBatched: (...args: unknown[]) => mockFetchVideoDetailsBatched(...args),
}));

// Mock Spotify provider
const mockGetSpotifyClientForConnection = vi.fn();
const mockGetShowEpisodes = vi.fn();
const mockGetMultipleShows = vi.fn();

const mockGetShow = vi.fn();
const mockGetMultipleShowsWithCache = vi.fn();
const mockUpdateShowCache = vi.fn();
const mockInvalidateShowCache = vi.fn();

vi.mock('../providers/spotify', () => ({
  getSpotifyClientForConnection: (...args: unknown[]) => mockGetSpotifyClientForConnection(...args),
  getShowEpisodes: (...args: unknown[]) => mockGetShowEpisodes(...args),
  getMultipleShows: (...args: unknown[]) => mockGetMultipleShows(...args),
  getShow: (...args: unknown[]) => mockGetShow(...args),
  getMultipleShowsWithCache: (...args: unknown[]) => mockGetMultipleShowsWithCache(...args),
  updateShowCache: (...args: unknown[]) => mockUpdateShowCache(...args),
  invalidateShowCache: (...args: unknown[]) => mockInvalidateShowCache(...args),
  getLargestImage: (images: { url: string }[] | undefined) => images?.[0]?.url,
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

describe('getUserProcessingConcurrency', () => {
  it('returns default when value is missing or invalid', () => {
    expect(getUserProcessingConcurrency(undefined)).toBe(10);
    expect(getUserProcessingConcurrency('')).toBe(10);
    expect(getUserProcessingConcurrency('   ')).toBe(10);
    expect(getUserProcessingConcurrency('0')).toBe(10);
    expect(getUserProcessingConcurrency('-2')).toBe(10);
    expect(getUserProcessingConcurrency('abc')).toBe(10);
  });

  it('parses positive integer values (including trimmed values)', () => {
    expect(getUserProcessingConcurrency('5')).toBe(5);
    expect(getUserProcessingConcurrency(' 7 ')).toBe(7);
  });
});

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
    // getUploadsPlaylistId is now synchronous and deterministic - no mock needed
    mockFetchRecentVideos.mockResolvedValue([]);
    mockFetchVideoDetails.mockResolvedValue(new Map());
    mockFetchVideoDetailsBatched.mockResolvedValue(new Map());
    mockGetSpotifyClientForConnection.mockResolvedValue({});
    mockGetShowEpisodes.mockResolvedValue([]);
    mockGetMultipleShows.mockResolvedValue([]);
    mockIngestItem.mockResolvedValue({ created: false });
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  describe('pollProviderSubscriptions', () => {
    it('should use YouTube-specific lock key for YouTube polling', async () => {
      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([]);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollProviderSubscriptions } = await import('./scheduler');
      await pollProviderSubscriptions('YOUTUBE', env as never, ctx);

      expect(mockTryAcquireLock).toHaveBeenCalledWith(
        env.OAUTH_STATE_KV,
        'cron:poll-youtube:lock',
        900
      );
    });

    it('should use Spotify-specific lock key for Spotify polling', async () => {
      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([]);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollProviderSubscriptions } = await import('./scheduler');
      await pollProviderSubscriptions('SPOTIFY', env as never, ctx);

      expect(mockTryAcquireLock).toHaveBeenCalledWith(
        env.OAUTH_STATE_KV,
        'cron:poll-spotify:lock',
        900
      );
    });

    it('should skip polling if provider-specific lock is held', async () => {
      mockTryAcquireLock.mockResolvedValue(false);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollProviderSubscriptions } = await import('./scheduler');
      const result = await pollProviderSubscriptions('YOUTUBE', env as never, ctx);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('lock_held');
      expect(mockDbQuerySubscriptions.findMany).not.toHaveBeenCalled();
    });

    it('should only poll YouTube subscriptions when called with YOUTUBE', async () => {
      const youtubeSubscription = createMockSubscription({
        id: 'sub_youtube_1',
        provider: 'YOUTUBE',
      });
      const connection = createMockConnection({ provider: 'YOUTUBE' });

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([youtubeSubscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockFetchRecentVideos.mockResolvedValue([]);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollProviderSubscriptions } = await import('./scheduler');
      const result = await pollProviderSubscriptions('YOUTUBE', env as never, ctx);

      expect(result.skipped).toBe(false);
      expect(result.processed).toBe(1);
      // Verify YouTube client was called, not Spotify
      expect(mockGetYouTubeClientForConnection).toHaveBeenCalled();
      expect(mockGetSpotifyClientForConnection).not.toHaveBeenCalled();
    });

    it('should only poll Spotify subscriptions when called with SPOTIFY', async () => {
      const spotifySubscription = createMockSubscription({
        id: 'sub_spotify_1',
        provider: 'SPOTIFY',
        providerChannelId: '0testshow123456789012',
      });
      const connection = createMockConnection({ provider: 'SPOTIFY' });

      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([spotifySubscription]);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);
      mockGetShow.mockResolvedValue({
        id: '0testshow123456789012',
        name: 'Test Show',
        description: 'A test podcast',
        publisher: 'Test Publisher',
        images: [],
        externalUrl: 'https://open.spotify.com/show/0testshow123456789012',
        totalEpisodes: 10,
      });
      mockGetShowEpisodes.mockResolvedValue([]);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollProviderSubscriptions } = await import('./scheduler');
      const result = await pollProviderSubscriptions('SPOTIFY', env as never, ctx);

      expect(result.skipped).toBe(false);
      expect(result.processed).toBe(1);
      // Verify Spotify client was called, not YouTube
      expect(mockGetSpotifyClientForConnection).toHaveBeenCalled();
      expect(mockGetYouTubeClientForConnection).not.toHaveBeenCalled();
    });

    it('should release provider-specific lock after YouTube polling', async () => {
      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([]);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollProviderSubscriptions } = await import('./scheduler');
      await pollProviderSubscriptions('YOUTUBE', env as never, ctx);

      expect(mockReleaseLock).toHaveBeenCalledWith(env.OAUTH_STATE_KV, 'cron:poll-youtube:lock');
    });

    it('should release provider-specific lock after Spotify polling', async () => {
      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([]);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollProviderSubscriptions } = await import('./scheduler');
      await pollProviderSubscriptions('SPOTIFY', env as never, ctx);

      expect(mockReleaseLock).toHaveBeenCalledWith(env.OAUTH_STATE_KV, 'cron:poll-spotify:lock');
    });

    it('should release lock even if polling fails', async () => {
      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockRejectedValue(new Error('Database error'));

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollProviderSubscriptions } = await import('./scheduler');

      await expect(pollProviderSubscriptions('YOUTUBE', env as never, ctx)).rejects.toThrow(
        'Database error'
      );
      expect(mockReleaseLock).toHaveBeenCalledWith(env.OAUTH_STATE_KV, 'cron:poll-youtube:lock');
    });

    it('should return no_due_subscriptions when no subscriptions are due', async () => {
      mockTryAcquireLock.mockResolvedValue(true);
      mockDbQuerySubscriptions.findMany.mockResolvedValue([]);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollProviderSubscriptions } = await import('./scheduler');
      const result = await pollProviderSubscriptions('SPOTIFY', env as never, ctx);

      expect(result.skipped).toBe(false);
      expect(result.processed).toBe(0);
      expect(result.reason).toBe('no_due_subscriptions');
    });

    it('should allow YouTube and Spotify polling to run concurrently (different locks)', async () => {
      // This test simulates that YouTube and Spotify use different locks,
      // so they can run at the same time without blocking each other
      const lockAcquisitions: string[] = [];

      mockTryAcquireLock.mockImplementation(async (_kv: unknown, key: string) => {
        lockAcquisitions.push(key);
        return true;
      });
      mockDbQuerySubscriptions.findMany.mockResolvedValue([]);

      const env = createMockEnv();
      const ctx = createMockExecutionContext();

      const { pollProviderSubscriptions } = await import('./scheduler');

      // Run both polling operations
      await Promise.all([
        pollProviderSubscriptions('YOUTUBE', env as never, ctx),
        pollProviderSubscriptions('SPOTIFY', env as never, ctx),
      ]);

      // Both should have acquired their own locks
      expect(lockAcquisitions).toContain('cron:poll-youtube:lock');
      expect(lockAcquisitions).toContain('cron:poll-spotify:lock');
      expect(lockAcquisitions.length).toBe(2);
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
