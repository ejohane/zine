/**
 * Shared Test Utilities for tRPC and Integration Tests
 *
 * Provides mocks for:
 * - KV namespace (OAuth state, rate limiting)
 * - Database operations
 * - YouTube and Spotify API responses
 * - Test context creation
 */

import { vi } from 'vitest';
import type { Bindings } from '../types';

// ============================================================================
// Mock KV Namespace
// ============================================================================

/**
 * Create a mock KV namespace for testing OAuth state and rate limiting
 */
export function createMockKV() {
  const store = new Map<string, string>();

  return {
    get: vi.fn(async (key: string) => store.get(key) || null),
    put: vi.fn(async (key: string, value: string, _options?: { expirationTtl?: number }) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    // Helper to access store for assertions
    _store: store,
    // Helper to clear store
    _clear: () => store.clear(),
  } as unknown as KVNamespace & {
    _store: Map<string, string>;
    _clear: () => void;
  };
}

// ============================================================================
// Mock Environment
// ============================================================================

/**
 * Create a mock environment with all required bindings
 */
export function createMockEnv(overrides: Partial<Bindings> = {}): Bindings {
  return {
    DB: {} as unknown as D1Database,
    OAUTH_STATE_KV: createMockKV(),
    KV: createMockKV(),
    WEBHOOK_IDEMPOTENCY: createMockKV(),
    ENVIRONMENT: 'test',
    CLERK_WEBHOOK_SECRET: 'whsec_test_secret',
    CLERK_JWKS_URL: 'https://test.clerk.accounts.dev/.well-known/jwks.json',
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    OAUTH_REDIRECT_URI: 'zine://oauth/callback',
    SPOTIFY_CLIENT_ID: 'test-spotify-client-id',
    SPOTIFY_CLIENT_SECRET: 'test-spotify-client-secret',
    SPOTIFY_REDIRECT_URI: 'zine://oauth/spotify/callback',
    ...overrides,
  } as Bindings;
}

// ============================================================================
// Mock YouTube API
// ============================================================================

/**
 * YouTube API mock helpers
 */
export const mockYouTubeAPI = {
  /**
   * Create mock channel data
   */
  channel: (overrides: Partial<YouTubeChannelMock> = {}): YouTubeChannelMock => ({
    id: 'UCtest123',
    snippet: {
      title: 'Test Channel',
      description: 'A test YouTube channel',
      thumbnails: {
        default: { url: 'https://example.com/thumb.jpg' },
      },
      customUrl: '@testchannel',
    },
    contentDetails: {
      relatedPlaylists: {
        uploads: 'UUtest123',
      },
    },
    statistics: {
      subscriberCount: '100000',
      videoCount: '50',
    },
    ...overrides,
  }),

  /**
   * Create mock playlist item (video)
   */
  playlistItem: (overrides: Partial<YouTubePlaylistItemMock> = {}): YouTubePlaylistItemMock => ({
    snippet: {
      publishedAt: new Date().toISOString(),
      channelId: 'UCtest123',
      title: 'Test Video',
      description: 'Test video description',
      channelTitle: 'Test Channel',
      thumbnails: {
        default: { url: 'https://example.com/video-thumb.jpg' },
      },
      resourceId: {
        videoId: 'video123',
      },
    },
    contentDetails: {
      videoId: 'video123',
      videoPublishedAt: new Date().toISOString(),
    },
    ...overrides,
  }),

  /**
   * Create multiple mock playlist items
   */
  playlistItems: (count: number, baseDate?: Date): YouTubePlaylistItemMock[] => {
    const base = baseDate || new Date();
    return Array.from({ length: count }, (_, i) => {
      const publishedAt = new Date(base.getTime() - i * 24 * 60 * 60 * 1000).toISOString();
      return mockYouTubeAPI.playlistItem({
        snippet: {
          publishedAt,
          channelId: 'UCtest123',
          title: `Test Video ${i + 1}`,
          description: `Description ${i + 1}`,
          channelTitle: 'Test Channel',
          thumbnails: { default: { url: `https://example.com/thumb-${i}.jpg` } },
          resourceId: { videoId: `video${i + 1}` },
        },
        contentDetails: {
          videoId: `video${i + 1}`,
          videoPublishedAt: publishedAt,
        },
      });
    });
  },

  /**
   * Create mock subscription item
   */
  subscription: (overrides: Partial<YouTubeSubscriptionMock> = {}): YouTubeSubscriptionMock => ({
    snippet: {
      title: 'Subscribed Channel',
      description: 'A subscribed channel',
      resourceId: {
        channelId: 'UCsubscribed123',
      },
      thumbnails: {
        default: { url: 'https://example.com/sub-thumb.jpg' },
      },
    },
    ...overrides,
  }),

  /**
   * Create error response
   */
  error: (status: number, message: string) => ({
    status,
    message,
    error: { code: status, message },
  }),
};

// YouTube type definitions for mocks
interface YouTubeChannelMock {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails: { default: { url: string } };
    customUrl?: string;
  };
  contentDetails: {
    relatedPlaylists: { uploads: string };
  };
  statistics: {
    subscriberCount: string;
    videoCount: string;
  };
}

interface YouTubePlaylistItemMock {
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    channelTitle: string;
    thumbnails: { default: { url: string } };
    resourceId: { videoId: string };
  };
  contentDetails: {
    videoId: string;
    videoPublishedAt: string;
  };
}

interface YouTubeSubscriptionMock {
  snippet: {
    title: string;
    description: string;
    resourceId: { channelId: string };
    thumbnails: { default: { url: string } };
  };
}

// ============================================================================
// Mock Spotify API
// ============================================================================

/**
 * Spotify API mock helpers
 */
export const mockSpotifyAPI = {
  /**
   * Create mock show data
   */
  show: (overrides: Partial<SpotifyShowMock> = {}): SpotifyShowMock => ({
    id: '0testshow123456789012',
    name: 'Test Podcast',
    description: 'A test podcast show',
    publisher: 'Test Publisher',
    images: [{ url: 'https://example.com/show.jpg', height: 300, width: 300 }],
    external_urls: { spotify: 'https://open.spotify.com/show/0testshow123456789012' },
    total_episodes: 50,
    ...overrides,
  }),

  /**
   * Create mock episode data
   */
  episode: (overrides: Partial<SpotifyEpisodeMock> = {}): SpotifyEpisodeMock => ({
    id: '0testepisode1234567890',
    name: 'Test Episode',
    description: 'A test podcast episode',
    release_date: new Date().toISOString().split('T')[0],
    duration_ms: 3600000, // 1 hour
    images: [{ url: 'https://example.com/episode.jpg', height: 300, width: 300 }],
    external_urls: { spotify: 'https://open.spotify.com/episode/0testepisode1234567890' },
    ...overrides,
  }),

  /**
   * Create multiple mock episodes
   */
  episodes: (count: number, baseDate?: Date): SpotifyEpisodeMock[] => {
    const base = baseDate || new Date();
    return Array.from({ length: count }, (_, i) => {
      const releaseDate = new Date(base.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      return mockSpotifyAPI.episode({
        id: `0testepisode${String(i + 1).padStart(10, '0')}`,
        name: `Test Episode ${i + 1}`,
        description: `Description ${i + 1}`,
        release_date: releaseDate.toISOString().split('T')[0],
        duration_ms: 3600000 + i * 600000,
      });
    });
  },

  /**
   * Create mock saved show (user's library)
   */
  savedShow: (overrides: Partial<SpotifySavedShowMock> = {}): SpotifySavedShowMock => ({
    added_at: new Date().toISOString(),
    show: mockSpotifyAPI.show(overrides.show),
    ...overrides,
  }),

  /**
   * Create error response
   */
  error: (status: number, message: string) => ({
    status,
    message,
    error: { status, message },
  }),
};

// Spotify type definitions for mocks
interface SpotifyShowMock {
  id: string;
  name: string;
  description: string;
  publisher: string;
  images: { url: string; height: number; width: number }[];
  external_urls: { spotify: string };
  total_episodes: number;
}

interface SpotifyEpisodeMock {
  id: string;
  name: string;
  description: string;
  release_date: string;
  duration_ms: number;
  images: { url: string; height: number; width: number }[];
  external_urls: { spotify: string };
}

interface SpotifySavedShowMock {
  added_at: string;
  show: SpotifyShowMock;
}

// ============================================================================
// Mock Database Helpers
// ============================================================================

/**
 * Create mock database query results
 */
export const mockDbResults = {
  /**
   * Create mock provider connection
   */
  providerConnection: (
    overrides: Partial<MockProviderConnection> = {}
  ): MockProviderConnection => ({
    id: 'conn_test_123',
    userId: 'user_test_123',
    provider: 'YOUTUBE',
    providerUserId: 'youtube_user_123',
    accessToken: 'encrypted_access_token',
    refreshToken: 'encrypted_refresh_token',
    tokenExpiresAt: Date.now() + 3600000, // 1 hour from now
    scopes: 'https://www.googleapis.com/auth/youtube.readonly',
    connectedAt: Date.now() - 86400000, // 1 day ago
    lastRefreshedAt: Date.now() - 3600000, // 1 hour ago
    status: 'ACTIVE',
    ...overrides,
  }),

  /**
   * Create mock subscription
   */
  subscription: (overrides: Partial<MockSubscription> = {}): MockSubscription => ({
    id: 'sub_test_123',
    userId: 'user_test_123',
    provider: 'YOUTUBE',
    providerChannelId: 'UCtest123',
    name: 'Test Channel',
    description: 'Test channel description',
    imageUrl: 'https://example.com/channel.jpg',
    externalUrl: 'https://youtube.com/@testchannel',
    totalItems: 50,
    lastPublishedAt: Date.now() - 86400000,
    lastPolledAt: Date.now() - 3600000,
    pollIntervalSeconds: 3600,
    status: 'ACTIVE',
    createdAt: Date.now() - 86400000 * 7,
    updatedAt: Date.now() - 3600000,
    ...overrides,
  }),

  /**
   * Create mock user item
   */
  userItem: (overrides: Partial<MockUserItem> = {}): MockUserItem => ({
    id: 'ui_test_123',
    userId: 'user_test_123',
    itemId: 'item_test_123',
    state: 'INBOX',
    ingestedAt: new Date().toISOString(),
    bookmarkedAt: null,
    archivedAt: null,
    progressPosition: null,
    progressDuration: null,
    progressUpdatedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),

  /**
   * Create mock item
   */
  item: (overrides: Partial<MockItem> = {}): MockItem => ({
    id: 'item_test_123',
    contentType: 'VIDEO',
    provider: 'YOUTUBE',
    providerId: 'video123',
    canonicalUrl: 'https://youtube.com/watch?v=video123',
    title: 'Test Video',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    creator: 'Test Creator',
    publisher: null,
    summary: 'Test summary',
    duration: 3600,
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),
};

// Database mock type definitions
interface MockProviderConnection {
  id: string;
  userId: string;
  provider: string;
  providerUserId: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  scopes: string | null;
  connectedAt: number;
  lastRefreshedAt: number | null;
  status: string;
}

interface MockSubscription {
  id: string;
  userId: string;
  provider: string;
  providerChannelId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  externalUrl: string | null;
  totalItems: number | null;
  lastPublishedAt: number | null;
  lastPolledAt: number | null;
  pollIntervalSeconds: number;
  status: string;
  createdAt: number;
  updatedAt: number;
}

interface MockUserItem {
  id: string;
  userId: string;
  itemId: string;
  state: string;
  ingestedAt: string;
  bookmarkedAt: string | null;
  archivedAt: string | null;
  progressPosition: number | null;
  progressDuration: number | null;
  progressUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MockItem {
  id: string;
  contentType: string;
  provider: string;
  providerId: string;
  canonicalUrl: string;
  title: string;
  thumbnailUrl: string | null;
  creator: string;
  publisher: string | null;
  summary: string | null;
  duration: number | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Test Constants
// ============================================================================

export const TEST_USER_ID = 'user_test_123';
export const TEST_STATE = 'a'.repeat(32); // Min length state
export const TEST_CODE = 'test_authorization_code';
export const TEST_CODE_VERIFIER = 'a'.repeat(43); // Min length verifier

// ============================================================================
// OAuth State Helpers
// ============================================================================

/**
 * Register a mock OAuth state in KV
 */
export async function registerMockOAuthState(
  kv: KVNamespace & { _store?: Map<string, string> },
  state: string,
  userId: string
): Promise<void> {
  const key = `oauth:state:${state}`;
  if (kv._store) {
    kv._store.set(key, userId);
  } else {
    await kv.put(key, userId, { expirationTtl: 1800 });
  }
}

/**
 * Create mock OAuth token response
 */
export function createMockTokenResponse(provider: 'YOUTUBE' | 'SPOTIFY') {
  return {
    access_token: `mock_${provider.toLowerCase()}_access_token`,
    refresh_token: `mock_${provider.toLowerCase()}_refresh_token`,
    expires_in: 3600,
    token_type: 'Bearer',
    scope:
      provider === 'YOUTUBE'
        ? 'https://www.googleapis.com/auth/youtube.readonly'
        : 'user-library-read',
  };
}

/**
 * Create mock provider user info response
 */
export function createMockProviderUserInfo(provider: 'YOUTUBE' | 'SPOTIFY') {
  if (provider === 'YOUTUBE') {
    return {
      id: 'google_user_123',
      email: 'test@gmail.com',
      name: 'Test User',
    };
  } else {
    return {
      id: 'spotify_user_123',
      email: 'test@spotify.com',
      display_name: 'Test User',
    };
  }
}
