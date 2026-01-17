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
  getEpisode,
  getShow,
  getMultipleShows,
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
// getEpisode Tests
// ============================================================================

describe('getEpisode', () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should fetch episode by ID', async () => {
    const mockEpisodeResponse = createMockSDKEpisode({ id: 'episode-123' });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockEpisodeResponse),
    });

    const episode = await getEpisode('test-access-token', 'episode-123');

    expect(mockFetch).toHaveBeenCalledWith('https://api.spotify.com/v1/episodes/episode-123', {
      headers: {
        Authorization: 'Bearer test-access-token',
      },
    });
    expect(episode).not.toBeNull();
    expect(episode?.id).toBe('episode-123');
  });

  it('should return null when episode not found (404)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const episode = await getEpisode('test-access-token', 'nonexistent-episode');

    expect(episode).toBeNull();
  });

  it('should throw error on other API errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Invalid access token'),
    });

    await expect(getEpisode('invalid-token', 'episode-123')).rejects.toThrow(
      'Spotify API error: 401 Unauthorized - Invalid access token'
    );
  });

  it('should throw error on rate limit', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: () => Promise.resolve('Rate limit exceeded'),
    });

    await expect(getEpisode('test-token', 'episode-123')).rejects.toThrow(
      'Spotify API error: 429 Too Many Requests - Rate limit exceeded'
    );
  });

  it('should transform episode correctly', async () => {
    const mockEpisodeResponse = createMockSDKEpisode({
      id: 'ep-transform-test',
      name: 'Episode Title',
      description: 'Episode Description',
      release_date: '2024-01-10',
      duration_ms: 1800000,
      external_urls: { spotify: 'https://spotify.com/episode/ep-transform-test' },
      images: [{ url: 'https://image.jpg', height: 300, width: 300 }],
      is_playable: true,
    });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockEpisodeResponse),
    });

    const episode = await getEpisode('test-token', 'ep-transform-test');

    expect(episode).toEqual({
      id: 'ep-transform-test',
      name: 'Episode Title',
      description: 'Episode Description',
      releaseDate: '2024-01-10',
      durationMs: 1800000,
      externalUrl: 'https://spotify.com/episode/ep-transform-test',
      images: [{ url: 'https://image.jpg', height: 300, width: 300 }],
      isPlayable: true,
    });
  });

  it('should handle episode with empty description', async () => {
    const mockEpisodeResponse = createMockSDKEpisode({ description: '' });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockEpisodeResponse),
    });

    const episode = await getEpisode('test-token', 'episode-123');

    expect(episode?.description).toBe('');
  });

  it('should handle episode that is not playable', async () => {
    const mockEpisodeResponse = createMockSDKEpisode({ is_playable: false });
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockEpisodeResponse),
    });

    const episode = await getEpisode('test-token', 'episode-123');

    expect(episode?.isPlayable).toBe(false);
  });

  it('should handle server error (500)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Something went wrong'),
    });

    await expect(getEpisode('test-token', 'episode-123')).rejects.toThrow(
      'Spotify API error: 500 Internal Server Error - Something went wrong'
    );
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
// getMultipleShows Tests
// ============================================================================

describe('getMultipleShows', () => {
  it('should return empty array for empty input', async () => {
    const client = createSpotifyClient('test-token', createMockEnv());
    const result = await getMultipleShows(client, []);
    expect(result).toEqual([]);
    expect(mockShowsGet).not.toHaveBeenCalled();
  });

  it('should fetch multiple shows in one API call', async () => {
    const mockShowsResponse = [
      createMockSDKShow({ id: 'show1', name: 'Show 1', total_episodes: 100 }),
      createMockSDKShow({ id: 'show2', name: 'Show 2', total_episodes: 50 }),
    ];
    mockShowsGet.mockResolvedValue(mockShowsResponse);

    const client = createSpotifyClient('test-token', createMockEnv());
    const result = await getMultipleShows(client, ['show1', 'show2']);

    expect(mockShowsGet).toHaveBeenCalledTimes(1);
    expect(mockShowsGet).toHaveBeenCalledWith(['show1', 'show2'], 'US');
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('show1');
    expect(result[0].totalEpisodes).toBe(100);
    expect(result[1].id).toBe('show2');
    expect(result[1].totalEpisodes).toBe(50);
  });

  it('should chunk requests for >50 shows', async () => {
    // Return shows matching the chunk sizes
    mockShowsGet
      .mockResolvedValueOnce(
        Array.from({ length: 50 }, (_, i) =>
          createMockSDKShow({ id: `show${i}`, total_episodes: i })
        )
      )
      .mockResolvedValueOnce(
        Array.from({ length: 25 }, (_, i) =>
          createMockSDKShow({ id: `show${50 + i}`, total_episodes: 50 + i })
        )
      );

    const showIds = Array.from({ length: 75 }, (_, i) => `show${i}`);

    const client = createSpotifyClient('test-token', createMockEnv());
    const result = await getMultipleShows(client, showIds);

    expect(mockShowsGet).toHaveBeenCalledTimes(2);
    // First call with 50 IDs
    expect(mockShowsGet).toHaveBeenNthCalledWith(1, showIds.slice(0, 50), 'US');
    // Second call with remaining 25 IDs
    expect(mockShowsGet).toHaveBeenNthCalledWith(2, showIds.slice(50), 'US');
    expect(result).toHaveLength(75);
  });

  it('should handle exactly 50 shows in one call', async () => {
    const mockShowsResponse = Array.from({ length: 50 }, (_, i) =>
      createMockSDKShow({ id: `show${i}` })
    );
    mockShowsGet.mockResolvedValue(mockShowsResponse);

    const showIds = Array.from({ length: 50 }, (_, i) => `show${i}`);

    const client = createSpotifyClient('test-token', createMockEnv());
    const result = await getMultipleShows(client, showIds);

    expect(mockShowsGet).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(50);
  });

  it('should handle 100 shows with exactly 2 API calls', async () => {
    mockShowsGet
      .mockResolvedValueOnce(
        Array.from({ length: 50 }, (_, i) => createMockSDKShow({ id: `show${i}` }))
      )
      .mockResolvedValueOnce(
        Array.from({ length: 50 }, (_, i) => createMockSDKShow({ id: `show${50 + i}` }))
      );

    const showIds = Array.from({ length: 100 }, (_, i) => `show${i}`);

    const client = createSpotifyClient('test-token', createMockEnv());
    const result = await getMultipleShows(client, showIds);

    expect(mockShowsGet).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(100);
  });

  it('should transform shows correctly', async () => {
    const mockShowsResponse = [
      createMockSDKShow({
        id: 'test-show-id',
        name: 'Test Show Name',
        description: 'Test Description',
        publisher: 'Test Publisher',
        images: [{ url: 'https://image.jpg', height: 640, width: 640 }],
        external_urls: { spotify: 'https://spotify.com/show/test-show-id' },
        total_episodes: 42,
      }),
    ];
    mockShowsGet.mockResolvedValue(mockShowsResponse);

    const client = createSpotifyClient('test-token', createMockEnv());
    const result = await getMultipleShows(client, ['test-show-id']);

    expect(result[0]).toEqual({
      id: 'test-show-id',
      name: 'Test Show Name',
      description: 'Test Description',
      publisher: 'Test Publisher',
      images: [{ url: 'https://image.jpg', height: 640, width: 640 }],
      externalUrl: 'https://spotify.com/show/test-show-id',
      totalEpisodes: 42,
    });
  });

  it('should use custom market when provided', async () => {
    mockShowsGet.mockResolvedValue([createMockSDKShow()]);

    const client = createSpotifyClient('test-token', createMockEnv());
    await getMultipleShows(client, ['show1'], 'GB');

    expect(mockShowsGet).toHaveBeenCalledWith(['show1'], 'GB');
  });

  it('should handle single show', async () => {
    mockShowsGet.mockResolvedValue([createMockSDKShow({ id: 'single-show' })]);

    const client = createSpotifyClient('test-token', createMockEnv());
    const result = await getMultipleShows(client, ['single-show']);

    expect(mockShowsGet).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('single-show');
  });

  it('should propagate API errors', async () => {
    const error = new Error('Rate limit exceeded');
    (error as Error & { status: number }).status = 429;
    mockShowsGet.mockRejectedValue(error);

    const client = createSpotifyClient('test-token', createMockEnv());

    await expect(getMultipleShows(client, ['show1', 'show2'])).rejects.toThrow(
      'Rate limit exceeded'
    );
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

// ============================================================================
// Show Metadata Cache Tests
// ============================================================================

import {
  getMultipleShowsWithCache,
  updateShowCache,
  invalidateShowCache,
  SHOW_CACHE_CONFIG,
  type CachedShowMetadata,
} from './spotify';

describe('getMultipleShowsWithCache', () => {
  const mockKVGet = vi.fn();
  const mockKVPut = vi.fn();

  function createMockCacheEnv() {
    return {
      SPOTIFY_CACHE: {
        get: mockKVGet,
        put: mockKVPut,
        delete: vi.fn(),
      } as unknown as KVNamespace,
    };
  }

  beforeEach(() => {
    mockKVGet.mockReset();
    mockKVPut.mockReset();
  });

  it('should return empty map for empty input', async () => {
    const client = createSpotifyClient('test-token', createMockEnv());
    const env = createMockCacheEnv();

    const result = await getMultipleShowsWithCache(client, [], env);

    expect(result.data.size).toBe(0);
    expect(result.cacheHits).toBe(0);
    expect(result.cacheMisses).toBe(0);
    expect(mockKVGet).not.toHaveBeenCalled();
    expect(mockShowsGet).not.toHaveBeenCalled();
  });

  it('should return cached data when all shows are in cache', async () => {
    const cachedShow: CachedShowMetadata = {
      id: 'show1',
      name: 'Cached Show',
      description: 'Cached description',
      publisher: 'Cached Publisher',
      images: [{ url: 'https://image.jpg', height: 640, width: 640 }],
      externalUrl: 'https://spotify.com/show/show1',
      totalEpisodes: 50,
      cachedAt: MOCK_NOW - 1000,
    };

    mockKVGet.mockResolvedValue(cachedShow);

    const client = createSpotifyClient('test-token', createMockEnv());
    const env = createMockCacheEnv();

    const result = await getMultipleShowsWithCache(client, ['show1'], env);

    expect(result.data.size).toBe(1);
    expect(result.data.get('show1')?.name).toBe('Cached Show');
    expect(result.cacheHits).toBe(1);
    expect(result.cacheMisses).toBe(0);
    expect(mockShowsGet).not.toHaveBeenCalled();
    expect(mockKVPut).not.toHaveBeenCalled();
  });

  it('should fetch from API and cache when show is not cached', async () => {
    mockKVGet.mockResolvedValue(null);
    mockKVPut.mockResolvedValue(undefined);

    const apiShow = createMockSDKShow({ id: 'show2', name: 'API Show' });
    mockShowsGet.mockResolvedValue([apiShow]);

    const client = createSpotifyClient('test-token', createMockEnv());
    const env = createMockCacheEnv();

    const result = await getMultipleShowsWithCache(client, ['show2'], env);

    expect(result.data.size).toBe(1);
    expect(result.data.get('show2')?.name).toBe('API Show');
    expect(result.cacheHits).toBe(0);
    expect(result.cacheMisses).toBe(1);
    expect(mockShowsGet).toHaveBeenCalledWith(['show2'], 'US');
    expect(mockKVPut).toHaveBeenCalledWith(
      `${SHOW_CACHE_CONFIG.KEY_PREFIX}show2`,
      expect.stringContaining('"id":"show2"'),
      { expirationTtl: SHOW_CACHE_CONFIG.TTL_SECONDS }
    );
  });

  it('should mix cached and API data', async () => {
    const cachedShow: CachedShowMetadata = {
      id: 'show1',
      name: 'Cached Show',
      description: 'Cached',
      publisher: 'Cached',
      images: [],
      externalUrl: 'https://spotify.com/show/show1',
      totalEpisodes: 10,
      cachedAt: MOCK_NOW - 1000,
    };

    // First call (show1) returns cached, second call (show2) returns null
    mockKVGet.mockImplementation((key: string) => {
      if (key === `${SHOW_CACHE_CONFIG.KEY_PREFIX}show1`) {
        return Promise.resolve(cachedShow);
      }
      return Promise.resolve(null);
    });
    mockKVPut.mockResolvedValue(undefined);

    const apiShow = createMockSDKShow({ id: 'show2', name: 'API Show' });
    mockShowsGet.mockResolvedValue([apiShow]);

    const client = createSpotifyClient('test-token', createMockEnv());
    const env = createMockCacheEnv();

    const result = await getMultipleShowsWithCache(client, ['show1', 'show2'], env);

    expect(result.data.size).toBe(2);
    expect(result.data.get('show1')?.name).toBe('Cached Show');
    expect(result.data.get('show2')?.name).toBe('API Show');
    expect(result.cacheHits).toBe(1);
    expect(result.cacheMisses).toBe(1);
    // Only uncached show should be fetched from API
    expect(mockShowsGet).toHaveBeenCalledWith(['show2'], 'US');
  });

  it('should fall back to API when cache read fails', async () => {
    mockKVGet.mockRejectedValue(new Error('KV read error'));
    mockKVPut.mockResolvedValue(undefined);

    const apiShow = createMockSDKShow({ id: 'show1', name: 'API Show' });
    mockShowsGet.mockResolvedValue([apiShow]);

    const client = createSpotifyClient('test-token', createMockEnv());
    const env = createMockCacheEnv();

    const result = await getMultipleShowsWithCache(client, ['show1'], env);

    expect(result.data.size).toBe(1);
    expect(result.data.get('show1')?.name).toBe('API Show');
    expect(result.cacheHits).toBe(0);
    expect(result.cacheMisses).toBe(1);
  });

  it('should continue if cache write fails', async () => {
    mockKVGet.mockResolvedValue(null);
    mockKVPut.mockRejectedValue(new Error('KV write error'));

    const apiShow = createMockSDKShow({ id: 'show1', name: 'API Show' });
    mockShowsGet.mockResolvedValue([apiShow]);

    const client = createSpotifyClient('test-token', createMockEnv());
    const env = createMockCacheEnv();

    const result = await getMultipleShowsWithCache(client, ['show1'], env);

    expect(result.data.size).toBe(1);
    expect(result.data.get('show1')?.name).toBe('API Show');
    expect(result.cacheMisses).toBe(1);
    // Should not throw
  });

  it('should use custom market when provided', async () => {
    mockKVGet.mockResolvedValue(null);
    mockKVPut.mockResolvedValue(undefined);

    const apiShow = createMockSDKShow({ id: 'show1' });
    mockShowsGet.mockResolvedValue([apiShow]);

    const client = createSpotifyClient('test-token', createMockEnv());
    const env = createMockCacheEnv();

    await getMultipleShowsWithCache(client, ['show1'], env, 'GB');

    expect(mockShowsGet).toHaveBeenCalledWith(['show1'], 'GB');
  });

  it('should handle multiple shows with all cache hits', async () => {
    const cachedShows: CachedShowMetadata[] = [
      {
        id: 'show1',
        name: 'Show 1',
        description: '',
        publisher: '',
        images: [],
        externalUrl: '',
        totalEpisodes: 10,
        cachedAt: MOCK_NOW,
      },
      {
        id: 'show2',
        name: 'Show 2',
        description: '',
        publisher: '',
        images: [],
        externalUrl: '',
        totalEpisodes: 20,
        cachedAt: MOCK_NOW,
      },
      {
        id: 'show3',
        name: 'Show 3',
        description: '',
        publisher: '',
        images: [],
        externalUrl: '',
        totalEpisodes: 30,
        cachedAt: MOCK_NOW,
      },
    ];

    mockKVGet.mockImplementation((key: string) => {
      const id = key.replace(SHOW_CACHE_CONFIG.KEY_PREFIX, '');
      const show = cachedShows.find((s) => s.id === id);
      return Promise.resolve(show ?? null);
    });

    const client = createSpotifyClient('test-token', createMockEnv());
    const env = createMockCacheEnv();

    const result = await getMultipleShowsWithCache(client, ['show1', 'show2', 'show3'], env);

    expect(result.data.size).toBe(3);
    expect(result.cacheHits).toBe(3);
    expect(result.cacheMisses).toBe(0);
    expect(mockShowsGet).not.toHaveBeenCalled();
  });
});

describe('updateShowCache', () => {
  const mockKVPut = vi.fn();

  function createMockCacheEnv() {
    return {
      SPOTIFY_CACHE: {
        put: mockKVPut,
      } as unknown as KVNamespace,
    };
  }

  beforeEach(() => {
    mockKVPut.mockReset();
  });

  it('should store show in cache with TTL', async () => {
    mockKVPut.mockResolvedValue(undefined);

    const show: SpotifyShow = {
      id: 'show1',
      name: 'Test Show',
      description: 'Test',
      publisher: 'Test',
      images: [],
      externalUrl: 'https://spotify.com/show/show1',
      totalEpisodes: 50,
    };

    const env = createMockCacheEnv();
    await updateShowCache('show1', show, env);

    expect(mockKVPut).toHaveBeenCalledWith(
      `${SHOW_CACHE_CONFIG.KEY_PREFIX}show1`,
      expect.stringContaining('"id":"show1"'),
      { expirationTtl: SHOW_CACHE_CONFIG.TTL_SECONDS }
    );
  });

  it('should not throw on cache write failure', async () => {
    mockKVPut.mockRejectedValue(new Error('KV error'));

    const show: SpotifyShow = {
      id: 'show1',
      name: 'Test',
      description: '',
      publisher: '',
      images: [],
      externalUrl: '',
      totalEpisodes: 0,
    };

    const env = createMockCacheEnv();
    // Should not throw
    await expect(updateShowCache('show1', show, env)).resolves.not.toThrow();
  });
});

describe('invalidateShowCache', () => {
  const mockKVDelete = vi.fn();

  function createMockCacheEnv() {
    return {
      SPOTIFY_CACHE: {
        delete: mockKVDelete,
      } as unknown as KVNamespace,
    };
  }

  beforeEach(() => {
    mockKVDelete.mockReset();
  });

  it('should delete show from cache', async () => {
    mockKVDelete.mockResolvedValue(undefined);

    const env = createMockCacheEnv();
    await invalidateShowCache('show1', env);

    expect(mockKVDelete).toHaveBeenCalledWith(`${SHOW_CACHE_CONFIG.KEY_PREFIX}show1`);
  });

  it('should not throw on cache delete failure', async () => {
    mockKVDelete.mockRejectedValue(new Error('KV error'));

    const env = createMockCacheEnv();
    // Should not throw
    await expect(invalidateShowCache('show1', env)).resolves.not.toThrow();
  });
});
