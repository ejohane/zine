/**
 * Tests for Spotify Provider API Client
 *
 * Tests for Spotify Web API interactions including:
 * - Show operations (getShowDetails, getShowEpisodes)
 * - Search functionality (searchShows)
 * - Error handling (401, 403, 404, rate limiting)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import {
  createSpotifyClient,
  getSpotifyClientForConnection,
  getUserSavedShows,
  getAllUserSavedShows,
  getShowEpisodes,
  getLatestEpisode,
  getShow,
  searchShows,
  checkSavedShows,
  type SpotifyShow,
  type SpotifyEpisode,
} from './spotify';

// ============================================================================
// Mocks
// ============================================================================

// Mock token-refresh module
vi.mock('../lib/token-refresh', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
}));

// Mock SpotifyApi SDK
const mockSavedShows = vi.fn();
const mockShowsGet = vi.fn();
const mockShowsEpisodes = vi.fn();
const mockSearch = vi.fn();
const mockHasSavedShow = vi.fn();

vi.mock('@spotify/web-api-ts-sdk', () => ({
  SpotifyApi: {
    withAccessToken: vi.fn(() => ({
      currentUser: {
        shows: {
          savedShows: mockSavedShows,
          hasSavedShow: mockHasSavedShow,
        },
      },
      shows: {
        get: mockShowsGet,
        episodes: mockShowsEpisodes,
      },
      search: mockSearch,
    })),
  },
}));

// ============================================================================
// Test Fixtures
// ============================================================================

const MOCK_NOW = 1705320000000; // 2024-01-15T12:00:00.000Z

function createMockEnv() {
  return {
    DB: {} as D1Database,
    OAUTH_STATE_KV: {} as KVNamespace,
    ENCRYPTION_KEY: 'test-encryption-key',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-secret',
    SPOTIFY_CLIENT_ID: 'spotify-client-id',
    SPOTIFY_CLIENT_SECRET: 'spotify-secret',
  };
}

function createMockConnection() {
  return {
    id: 'conn-123',
    userId: 'user-456',
    provider: 'SPOTIFY' as const,
    providerUserId: 'spotify-user',
    accessToken: 'encrypted:access-token',
    refreshToken: 'encrypted:refresh-token',
    tokenExpiresAt: MOCK_NOW + 3600000,
    scopes: 'user-library-read',
    connectedAt: MOCK_NOW - 86400000,
    lastRefreshedAt: null,
    status: 'ACTIVE' as const,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createMockSpotifyShow(overrides: Partial<SpotifyShow> = {}): SpotifyShow {
  return {
    id: '4rOoJ6Egrf8K2IrywzwOMk',
    name: 'Test Podcast',
    description: 'A test podcast for testing',
    publisher: 'Test Publisher',
    images: [
      { url: 'https://i.scdn.co/image/abc123-large', height: 640, width: 640 },
      { url: 'https://i.scdn.co/image/abc123-medium', height: 300, width: 300 },
    ],
    externalUrl: 'https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk',
    totalEpisodes: 100,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createMockSpotifyEpisode(overrides: Partial<SpotifyEpisode> = {}): SpotifyEpisode {
  return {
    id: 'episode123abc',
    name: 'Test Episode',
    description: 'Test episode description',
    releaseDate: '2024-01-15',
    durationMs: 3600000,
    externalUrl: 'https://open.spotify.com/episode/episode123abc',
    images: [{ url: 'https://i.scdn.co/image/episode123', height: 640, width: 640 }],
    isPlayable: true,
    ...overrides,
  };
}

// SDK response format (snake_case)
function createMockSDKShow(overrides: Record<string, unknown> = {}) {
  return {
    id: '4rOoJ6Egrf8K2IrywzwOMk',
    name: 'Test Podcast',
    description: 'A test podcast for testing',
    publisher: 'Test Publisher',
    images: [
      { url: 'https://i.scdn.co/image/abc123-large', height: 640, width: 640 },
      { url: 'https://i.scdn.co/image/abc123-medium', height: 300, width: 300 },
    ],
    external_urls: { spotify: 'https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk' },
    total_episodes: 100,
    ...overrides,
  };
}

function createMockSDKEpisode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'episode123abc',
    name: 'Test Episode',
    description: 'Test episode description',
    release_date: '2024-01-15',
    duration_ms: 3600000,
    external_urls: { spotify: 'https://open.spotify.com/episode/episode123abc' },
    images: [{ url: 'https://i.scdn.co/image/episode123', height: 640, width: 640 }],
    is_playable: true,
    ...overrides,
  };
}

// ============================================================================
// Test Setup
// ============================================================================

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MOCK_NOW);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// createSpotifyClient Tests
// ============================================================================

describe('createSpotifyClient', () => {
  it('should create a client with valid credentials', () => {
    const env = createMockEnv();

    const client = createSpotifyClient('test-access-token', env);

    expect(SpotifyApi.withAccessToken).toHaveBeenCalledWith(
      'spotify-client-id',
      expect.objectContaining({
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: '',
      })
    );
    expect(client).toBeDefined();
  });

  it('should throw error when SPOTIFY_CLIENT_ID is not configured', () => {
    const env = createMockEnv();
    env.SPOTIFY_CLIENT_ID = '';

    expect(() => createSpotifyClient('test-token', env)).toThrow(
      'SPOTIFY_CLIENT_ID is not configured'
    );
  });

  it('should throw error when SPOTIFY_CLIENT_ID is undefined', () => {
    const env = createMockEnv();
    // @ts-expect-error Testing undefined case
    env.SPOTIFY_CLIENT_ID = undefined;

    expect(() => createSpotifyClient('test-token', env)).toThrow(
      'SPOTIFY_CLIENT_ID is not configured'
    );
  });
});

// ============================================================================
// getSpotifyClientForConnection Tests
// ============================================================================

describe('getSpotifyClientForConnection', () => {
  it('should get valid access token and create client', async () => {
    const { getValidAccessToken } = await import('../lib/token-refresh');
    const connection = createMockConnection();
    const env = createMockEnv();

    const client = await getSpotifyClientForConnection(connection, env);

    expect(getValidAccessToken).toHaveBeenCalledWith(connection, env);
    expect(client).toBeDefined();
  });
});

// ============================================================================
// getUserSavedShows Tests
// ============================================================================

describe('getUserSavedShows', () => {
  it('should fetch saved shows with default parameters', async () => {
    const mockResponse = {
      items: [{ show: createMockSDKShow() }, { show: createMockSDKShow({ id: 'show2' }) }],
    };
    mockSavedShows.mockResolvedValue(mockResponse);

    const client = createSpotifyClient('test-token', createMockEnv());
    const shows = await getUserSavedShows(client);

    expect(mockSavedShows).toHaveBeenCalledWith(50, 0);
    expect(shows).toHaveLength(2);
    expect(shows[0].id).toBe('4rOoJ6Egrf8K2IrywzwOMk');
  });

  it('should respect limit and offset parameters', async () => {
    mockSavedShows.mockResolvedValue({ items: [] });

    const client = createSpotifyClient('test-token', createMockEnv());
    await getUserSavedShows(client, 20, 10);

    expect(mockSavedShows).toHaveBeenCalledWith(20, 10);
  });

  it('should cap limit at 50', async () => {
    mockSavedShows.mockResolvedValue({ items: [] });

    const client = createSpotifyClient('test-token', createMockEnv());
    await getUserSavedShows(client, 100, 0);

    expect(mockSavedShows).toHaveBeenCalledWith(50, 0);
  });

  it('should transform shows correctly', async () => {
    const mockResponse = {
      items: [
        {
          show: createMockSDKShow({
            id: 'test-id',
            name: 'Test Name',
            description: 'Test Description',
            publisher: 'Test Publisher',
            images: [{ url: 'https://image.jpg', height: 300, width: 300 }],
            external_urls: { spotify: 'https://spotify.com/show/test-id' },
            total_episodes: 50,
          }),
        },
      ],
    };
    mockSavedShows.mockResolvedValue(mockResponse);

    const client = createSpotifyClient('test-token', createMockEnv());
    const shows = await getUserSavedShows(client);

    expect(shows[0]).toEqual({
      id: 'test-id',
      name: 'Test Name',
      description: 'Test Description',
      publisher: 'Test Publisher',
      images: [{ url: 'https://image.jpg', height: 300, width: 300 }],
      externalUrl: 'https://spotify.com/show/test-id',
      totalEpisodes: 50,
    });
  });
});

// ============================================================================
// getAllUserSavedShows Tests
// ============================================================================

describe('getAllUserSavedShows', () => {
  it('should fetch all shows with pagination', async () => {
    // First page: 50 shows
    const page1Shows = Array.from({ length: 50 }, (_, i) => createMockSDKShow({ id: `show-${i}` }));
    // Second page: 30 shows (less than page size = last page)
    const page2Shows = Array.from({ length: 30 }, (_, i) =>
      createMockSDKShow({ id: `show-${50 + i}` })
    );

    mockSavedShows
      .mockResolvedValueOnce({ items: page1Shows.map((show) => ({ show })) })
      .mockResolvedValueOnce({ items: page2Shows.map((show) => ({ show })) });

    const client = createSpotifyClient('test-token', createMockEnv());
    const shows = await getAllUserSavedShows(client);

    expect(mockSavedShows).toHaveBeenCalledTimes(2);
    expect(shows).toHaveLength(80);
  });

  it('should stop at maxShows limit', async () => {
    // Return full pages
    const fullPage = Array.from({ length: 50 }, (_, i) => createMockSDKShow({ id: `show-${i}` }));

    mockSavedShows.mockResolvedValue({ items: fullPage.map((show) => ({ show })) });

    const client = createSpotifyClient('test-token', createMockEnv());
    const shows = await getAllUserSavedShows(client, 75);

    expect(mockSavedShows).toHaveBeenCalledTimes(2);
    expect(shows).toHaveLength(75); // Limited to maxShows
  });

  it('should stop when page has fewer items than page size', async () => {
    const partialPage = Array.from({ length: 25 }, (_, i) =>
      createMockSDKShow({ id: `show-${i}` })
    );

    mockSavedShows.mockResolvedValue({ items: partialPage.map((show) => ({ show })) });

    const client = createSpotifyClient('test-token', createMockEnv());
    const shows = await getAllUserSavedShows(client);

    expect(mockSavedShows).toHaveBeenCalledTimes(1);
    expect(shows).toHaveLength(25);
  });

  it('should handle empty response', async () => {
    mockSavedShows.mockResolvedValue({ items: [] });

    const client = createSpotifyClient('test-token', createMockEnv());
    const shows = await getAllUserSavedShows(client);

    expect(shows).toHaveLength(0);
  });
});

// ============================================================================
// getShowEpisodes Tests
// ============================================================================

describe('getShowEpisodes', () => {
  it('should fetch episodes for a show with default parameters', async () => {
    const mockResponse = {
      items: [createMockSDKEpisode(), createMockSDKEpisode({ id: 'episode2' })],
    };
    mockShowsEpisodes.mockResolvedValue(mockResponse);

    const client = createSpotifyClient('test-token', createMockEnv());
    const episodes = await getShowEpisodes(client, 'show-id-123');

    expect(mockShowsEpisodes).toHaveBeenCalledWith('show-id-123', undefined, 10, 0);
    expect(episodes).toHaveLength(2);
  });

  it('should respect limit and offset parameters', async () => {
    mockShowsEpisodes.mockResolvedValue({ items: [] });

    const client = createSpotifyClient('test-token', createMockEnv());
    await getShowEpisodes(client, 'show-id', 25, 5);

    expect(mockShowsEpisodes).toHaveBeenCalledWith('show-id', undefined, 25, 5);
  });

  it('should cap limit at 50', async () => {
    mockShowsEpisodes.mockResolvedValue({ items: [] });

    const client = createSpotifyClient('test-token', createMockEnv());
    await getShowEpisodes(client, 'show-id', 100, 0);

    expect(mockShowsEpisodes).toHaveBeenCalledWith('show-id', undefined, 50, 0);
  });

  it('should transform episodes correctly', async () => {
    const mockResponse = {
      items: [
        createMockSDKEpisode({
          id: 'ep-123',
          name: 'Episode Title',
          description: 'Episode Description',
          release_date: '2024-01-10',
          duration_ms: 1800000,
          external_urls: { spotify: 'https://spotify.com/episode/ep-123' },
          images: [{ url: 'https://image.jpg', height: 300, width: 300 }],
          is_playable: true,
        }),
      ],
    };
    mockShowsEpisodes.mockResolvedValue(mockResponse);

    const client = createSpotifyClient('test-token', createMockEnv());
    const episodes = await getShowEpisodes(client, 'show-id');

    expect(episodes[0]).toEqual({
      id: 'ep-123',
      name: 'Episode Title',
      description: 'Episode Description',
      releaseDate: '2024-01-10',
      durationMs: 1800000,
      externalUrl: 'https://spotify.com/episode/ep-123',
      images: [{ url: 'https://image.jpg', height: 300, width: 300 }],
      isPlayable: true,
    });
  });

  it('should handle empty episodes response', async () => {
    mockShowsEpisodes.mockResolvedValue({ items: [] });

    const client = createSpotifyClient('test-token', createMockEnv());
    const episodes = await getShowEpisodes(client, 'show-id');

    expect(episodes).toHaveLength(0);
  });
});

// ============================================================================
// getLatestEpisode Tests
// ============================================================================

describe('getLatestEpisode', () => {
  it('should return the latest episode', async () => {
    const mockResponse = {
      items: [createMockSDKEpisode({ id: 'latest-episode' })],
    };
    mockShowsEpisodes.mockResolvedValue(mockResponse);

    const client = createSpotifyClient('test-token', createMockEnv());
    const episode = await getLatestEpisode(client, 'show-id');

    expect(mockShowsEpisodes).toHaveBeenCalledWith('show-id', undefined, 1, 0);
    expect(episode?.id).toBe('latest-episode');
  });

  it('should return null when show has no episodes', async () => {
    mockShowsEpisodes.mockResolvedValue({ items: [] });

    const client = createSpotifyClient('test-token', createMockEnv());
    const episode = await getLatestEpisode(client, 'show-id');

    expect(episode).toBeNull();
  });
});

// ============================================================================
// getShow Tests
// ============================================================================

describe('getShow', () => {
  it('should fetch show details by ID', async () => {
    const mockShow = createMockSDKShow({ id: 'show-123' });
    mockShowsGet.mockResolvedValue(mockShow);

    const client = createSpotifyClient('test-token', createMockEnv());
    const show = await getShow(client, 'show-123');

    expect(mockShowsGet).toHaveBeenCalledWith('show-123', 'US');
    expect(show.id).toBe('show-123');
  });

  it('should transform show correctly', async () => {
    const mockShow = createMockSDKShow({
      id: 'test-show',
      name: 'Show Name',
      description: 'Show Description',
      publisher: 'Publisher Name',
      images: [{ url: 'https://image.jpg', height: 640, width: 640 }],
      external_urls: { spotify: 'https://spotify.com/show/test-show' },
      total_episodes: 150,
    });
    mockShowsGet.mockResolvedValue(mockShow);

    const client = createSpotifyClient('test-token', createMockEnv());
    const show = await getShow(client, 'test-show');

    expect(show).toEqual({
      id: 'test-show',
      name: 'Show Name',
      description: 'Show Description',
      publisher: 'Publisher Name',
      images: [{ url: 'https://image.jpg', height: 640, width: 640 }],
      externalUrl: 'https://spotify.com/show/test-show',
      totalEpisodes: 150,
    });
  });
});

// ============================================================================
// searchShows Tests
// ============================================================================

describe('searchShows', () => {
  it('should search for shows with default limit', async () => {
    const mockResponse = {
      shows: {
        items: [createMockSDKShow({ id: 'result-1' }), createMockSDKShow({ id: 'result-2' })],
      },
    };
    mockSearch.mockResolvedValue(mockResponse);

    const client = createSpotifyClient('test-token', createMockEnv());
    const results = await searchShows(client, 'technology podcast');

    expect(mockSearch).toHaveBeenCalledWith('technology podcast', ['show'], undefined, 10);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('result-1');
  });

  it('should respect custom limit', async () => {
    mockSearch.mockResolvedValue({ shows: { items: [] } });

    const client = createSpotifyClient('test-token', createMockEnv());
    await searchShows(client, 'query', 25);

    expect(mockSearch).toHaveBeenCalledWith('query', ['show'], undefined, 25);
  });

  it('should cap limit at 50', async () => {
    mockSearch.mockResolvedValue({ shows: { items: [] } });

    const client = createSpotifyClient('test-token', createMockEnv());
    await searchShows(client, 'query', 100);

    expect(mockSearch).toHaveBeenCalledWith('query', ['show'], undefined, 50);
  });

  it('should handle empty search results', async () => {
    mockSearch.mockResolvedValue({ shows: { items: [] } });

    const client = createSpotifyClient('test-token', createMockEnv());
    const results = await searchShows(client, 'nonexistent podcast xyz');

    expect(results).toHaveLength(0);
  });

  it('should handle null shows in response', async () => {
    mockSearch.mockResolvedValue({ shows: null });

    const client = createSpotifyClient('test-token', createMockEnv());
    const results = await searchShows(client, 'query');

    expect(results).toHaveLength(0);
  });

  it('should handle undefined shows in response', async () => {
    mockSearch.mockResolvedValue({});

    const client = createSpotifyClient('test-token', createMockEnv());
    const results = await searchShows(client, 'query');

    expect(results).toHaveLength(0);
  });
});

// ============================================================================
// checkSavedShows Tests
// ============================================================================

describe('checkSavedShows', () => {
  it('should check if shows are saved', async () => {
    mockHasSavedShow.mockResolvedValue([true, false, true]);

    const client = createSpotifyClient('test-token', createMockEnv());
    const results = await checkSavedShows(client, ['show1', 'show2', 'show3']);

    expect(mockHasSavedShow).toHaveBeenCalledWith(['show1', 'show2', 'show3']);
    expect(results).toEqual([true, false, true]);
  });

  it('should handle empty array', async () => {
    mockHasSavedShow.mockResolvedValue([]);

    const client = createSpotifyClient('test-token', createMockEnv());
    const results = await checkSavedShows(client, []);

    expect(results).toEqual([]);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('error handling', () => {
  describe('401 Unauthorized', () => {
    it('should propagate 401 error from savedShows', async () => {
      const error = new Error('Unauthorized');
      (error as Error & { status: number }).status = 401;
      mockSavedShows.mockRejectedValue(error);

      const client = createSpotifyClient('test-token', createMockEnv());

      await expect(getUserSavedShows(client)).rejects.toThrow('Unauthorized');
    });

    it('should propagate 401 error from getShow', async () => {
      const error = new Error('Unauthorized');
      (error as Error & { status: number }).status = 401;
      mockShowsGet.mockRejectedValue(error);

      const client = createSpotifyClient('test-token', createMockEnv());

      await expect(getShow(client, 'show-id')).rejects.toThrow('Unauthorized');
    });

    it('should propagate 401 error from search', async () => {
      const error = new Error('Unauthorized');
      (error as Error & { status: number }).status = 401;
      mockSearch.mockRejectedValue(error);

      const client = createSpotifyClient('test-token', createMockEnv());

      await expect(searchShows(client, 'query')).rejects.toThrow('Unauthorized');
    });
  });

  describe('403 Forbidden', () => {
    it('should propagate 403 error from savedShows', async () => {
      const error = new Error('Forbidden');
      (error as Error & { status: number }).status = 403;
      mockSavedShows.mockRejectedValue(error);

      const client = createSpotifyClient('test-token', createMockEnv());

      await expect(getUserSavedShows(client)).rejects.toThrow('Forbidden');
    });

    it('should propagate 403 error from episodes', async () => {
      const error = new Error('Forbidden - Bad OAuth request');
      (error as Error & { status: number }).status = 403;
      mockShowsEpisodes.mockRejectedValue(error);

      const client = createSpotifyClient('test-token', createMockEnv());

      await expect(getShowEpisodes(client, 'show-id')).rejects.toThrow('Forbidden');
    });
  });

  describe('404 Not Found', () => {
    it('should propagate 404 error from getShow', async () => {
      const error = new Error('Show not found');
      (error as Error & { status: number }).status = 404;
      mockShowsGet.mockRejectedValue(error);

      const client = createSpotifyClient('test-token', createMockEnv());

      await expect(getShow(client, 'nonexistent-show')).rejects.toThrow('Show not found');
    });

    it('should propagate 404 error from getShowEpisodes', async () => {
      const error = new Error('Show not found');
      (error as Error & { status: number }).status = 404;
      mockShowsEpisodes.mockRejectedValue(error);

      const client = createSpotifyClient('test-token', createMockEnv());

      await expect(getShowEpisodes(client, 'nonexistent-show')).rejects.toThrow('Show not found');
    });
  });

  describe('429 Rate Limiting', () => {
    it('should propagate rate limit error from savedShows', async () => {
      const error = new Error('Rate limit exceeded');
      (error as Error & { status: number }).status = 429;
      mockSavedShows.mockRejectedValue(error);

      const client = createSpotifyClient('test-token', createMockEnv());

      await expect(getUserSavedShows(client)).rejects.toThrow('Rate limit exceeded');
    });

    it('should propagate rate limit error from search', async () => {
      const error = new Error('Rate limit exceeded');
      (error as Error & { status: number }).status = 429;
      mockSearch.mockRejectedValue(error);

      const client = createSpotifyClient('test-token', createMockEnv());

      await expect(searchShows(client, 'query')).rejects.toThrow('Rate limit exceeded');
    });

    it('should propagate rate limit error from getShow', async () => {
      const error = new Error('Rate limit exceeded');
      (error as Error & { status: number }).status = 429;
      mockShowsGet.mockRejectedValue(error);

      const client = createSpotifyClient('test-token', createMockEnv());

      await expect(getShow(client, 'show-id')).rejects.toThrow('Rate limit exceeded');
    });

    it('should propagate rate limit error from episodes', async () => {
      const error = new Error('Rate limit exceeded');
      (error as Error & { status: number }).status = 429;
      mockShowsEpisodes.mockRejectedValue(error);

      const client = createSpotifyClient('test-token', createMockEnv());

      await expect(getShowEpisodes(client, 'show-id')).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('Network Errors', () => {
    it('should propagate network errors', async () => {
      const error = new Error('Network error');
      mockSavedShows.mockRejectedValue(error);

      const client = createSpotifyClient('test-token', createMockEnv());

      await expect(getUserSavedShows(client)).rejects.toThrow('Network error');
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  it('should handle shows with no images', async () => {
    const mockShow = createMockSDKShow({ images: [] });
    mockShowsGet.mockResolvedValue(mockShow);

    const client = createSpotifyClient('test-token', createMockEnv());
    const show = await getShow(client, 'show-id');

    expect(show.images).toEqual([]);
  });

  it('should handle episodes with empty description', async () => {
    const mockResponse = {
      items: [createMockSDKEpisode({ description: '' })],
    };
    mockShowsEpisodes.mockResolvedValue(mockResponse);

    const client = createSpotifyClient('test-token', createMockEnv());
    const episodes = await getShowEpisodes(client, 'show-id');

    expect(episodes[0].description).toBe('');
  });

  it('should handle very long show names', async () => {
    const longName = 'A'.repeat(1000);
    const mockShow = createMockSDKShow({ name: longName });
    mockShowsGet.mockResolvedValue(mockShow);

    const client = createSpotifyClient('test-token', createMockEnv());
    const show = await getShow(client, 'show-id');

    expect(show.name).toBe(longName);
  });

  it('should handle unicode characters in show data', async () => {
    const mockShow = createMockSDKShow({
      name: 'Podcast: 日本語タイトル 🎙️',
      description: 'Description with émojis 🎉 and ñ',
      publisher: '播客 Publisher',
    });
    mockShowsGet.mockResolvedValue(mockShow);

    const client = createSpotifyClient('test-token', createMockEnv());
    const show = await getShow(client, 'show-id');

    expect(show.name).toBe('Podcast: 日本語タイトル 🎙️');
    expect(show.description).toBe('Description with émojis 🎉 and ñ');
    expect(show.publisher).toBe('播客 Publisher');
  });

  it('should handle show with zero episodes', async () => {
    const mockShow = createMockSDKShow({ total_episodes: 0 });
    mockShowsGet.mockResolvedValue(mockShow);

    const client = createSpotifyClient('test-token', createMockEnv());
    const show = await getShow(client, 'show-id');

    expect(show.totalEpisodes).toBe(0);
  });

  it('should handle episode with zero duration', async () => {
    const mockResponse = {
      items: [createMockSDKEpisode({ duration_ms: 0 })],
    };
    mockShowsEpisodes.mockResolvedValue(mockResponse);

    const client = createSpotifyClient('test-token', createMockEnv());
    const episodes = await getShowEpisodes(client, 'show-id');

    expect(episodes[0].durationMs).toBe(0);
  });

  it('should handle episode that is not playable', async () => {
    const mockResponse = {
      items: [createMockSDKEpisode({ is_playable: false })],
    };
    mockShowsEpisodes.mockResolvedValue(mockResponse);

    const client = createSpotifyClient('test-token', createMockEnv());
    const episodes = await getShowEpisodes(client, 'show-id');

    expect(episodes[0].isPlayable).toBe(false);
  });
});
