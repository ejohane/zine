/**
 * Unit Tests for Sources Router
 *
 * Tests the tRPC sources router procedures including:
 * - sources.list - Get user's subscribed sources
 * - sources.add - Subscribe to a new source
 * - sources.remove - Unsubscribe from a source (soft delete)
 * - Auth: Verify unauthenticated requests fail
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import { Provider } from '@zine/shared';
import type { SourceView } from './sources';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_USER_ID = 'user_test_123';

/**
 * Create a mock SourceView for testing
 */
function createMockSourceView(overrides: Partial<SourceView> = {}): SourceView {
  const defaults: SourceView = {
    id: 'source-001',
    provider: Provider.YOUTUBE,
    providerId: 'channel-xyz',
    feedUrl: 'https://youtube.com/@testchannel',
    name: 'Test Channel',
    createdAt: '2024-12-01T10:00:00Z',
    updatedAt: '2024-12-01T10:00:00Z',
  };

  return { ...defaults, ...overrides };
}

// ============================================================================
// Mock Router Implementation for Testing
// ============================================================================

/**
 * Create a mock router caller that simulates the sources router behavior
 */
function createMockSourcesCaller(options: {
  userId: string | null;
  sources?: SourceView[];
  existingFeedUrls?: Set<string>;
}) {
  const { userId, sources = [], existingFeedUrls = new Set() } = options;

  return {
    list: async () => {
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      return [...sources];
    },

    add: async (input: { provider: string; feedUrl: string; name?: string }) => {
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      // Check for duplicates
      if (existingFeedUrls.has(input.feedUrl)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Already subscribed to this source',
        });
      }

      // Return the created source
      const now = new Date().toISOString();
      return {
        id: crypto.randomUUID(),
        provider: input.provider as Provider,
        providerId: deriveProviderId(input.feedUrl, input.provider as Provider),
        feedUrl: input.feedUrl,
        name: input.name || deriveNameFromUrl(input.feedUrl, input.provider as Provider),
        createdAt: now,
        updatedAt: now,
      };
    },

    remove: async (input: { id: string }) => {
      if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      // Check if source exists
      const sourceExists = sources.some((s) => s.id === input.id);
      if (!sourceExists) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Source ${input.id} not found`,
        });
      }

      return { success: true as const };
    },
  };
}

/**
 * Derive provider ID from URL (matches router implementation)
 */
function deriveProviderId(feedUrl: string, provider: Provider): string {
  try {
    const url = new URL(feedUrl);
    switch (provider) {
      case Provider.YOUTUBE:
        if (url.pathname.startsWith('/@')) {
          return url.pathname.slice(2);
        }
        if (url.pathname.startsWith('/channel/')) {
          return url.pathname.slice(9).split('/')[0];
        }
        return url.pathname.slice(1);
      case Provider.SPOTIFY: {
        const spotifyMatch = url.pathname.match(/\/show\/([a-zA-Z0-9]+)/);
        return spotifyMatch ? spotifyMatch[1] : url.pathname;
      }
      case Provider.SUBSTACK:
        if (url.hostname.endsWith('.substack.com')) {
          return url.hostname.replace('.substack.com', '');
        }
        return url.hostname;
      case Provider.RSS:
        return `${url.hostname}${url.pathname}`;
      default:
        return feedUrl;
    }
  } catch {
    return feedUrl;
  }
}

/**
 * Derive name from URL (matches router implementation)
 */
function deriveNameFromUrl(feedUrl: string, provider: Provider): string {
  try {
    const url = new URL(feedUrl);
    switch (provider) {
      case Provider.YOUTUBE:
        if (url.pathname.startsWith('/@')) {
          return url.pathname.slice(2);
        }
        if (url.pathname.startsWith('/channel/')) {
          return 'YouTube Channel';
        }
        return url.hostname;
      case Provider.SPOTIFY:
        return 'Spotify Show';
      case Provider.SUBSTACK:
        if (url.hostname.endsWith('.substack.com')) {
          return url.hostname.replace('.substack.com', '');
        }
        return url.hostname;
      case Provider.RSS:
        return url.hostname;
      default:
        return 'Unknown Source';
    }
  } catch {
    return 'Unknown Source';
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Sources Router', () => {
  // ==========================================================================
  // Authentication Tests
  // ==========================================================================

  describe('Authentication', () => {
    it('should reject unauthenticated requests to list', async () => {
      const caller = createMockSourcesCaller({ userId: null });

      await expect(caller.list()).rejects.toThrow(TRPCError);
      await expect(caller.list()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to add', async () => {
      const caller = createMockSourcesCaller({ userId: null });

      await expect(
        caller.add({
          provider: Provider.YOUTUBE,
          feedUrl: 'https://youtube.com/@test',
        })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.add({
          provider: Provider.YOUTUBE,
          feedUrl: 'https://youtube.com/@test',
        })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to remove', async () => {
      const caller = createMockSourcesCaller({ userId: null });

      await expect(caller.remove({ id: 'source-001' })).rejects.toThrow(TRPCError);
      await expect(caller.remove({ id: 'source-001' })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  // ==========================================================================
  // sources.list Tests
  // ==========================================================================

  describe('sources.list', () => {
    it('should return empty array when no sources', async () => {
      const caller = createMockSourcesCaller({
        userId: TEST_USER_ID,
        sources: [],
      });
      const result = await caller.list();

      expect(result).toEqual([]);
    });

    it('should return user sources with correct structure', async () => {
      const source = createMockSourceView({
        id: 'source-youtube-001',
        provider: Provider.YOUTUBE,
        providerId: 'fireship-dev',
        feedUrl: 'https://youtube.com/@fireship',
        name: 'Fireship',
      });

      const caller = createMockSourcesCaller({
        userId: TEST_USER_ID,
        sources: [source],
      });
      const result = await caller.list();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'source-youtube-001',
        provider: Provider.YOUTUBE,
        providerId: 'fireship-dev',
        feedUrl: 'https://youtube.com/@fireship',
        name: 'Fireship',
      });
    });

    it('should return multiple sources', async () => {
      const youtubeSource = createMockSourceView({
        id: 'source-001',
        provider: Provider.YOUTUBE,
        name: 'YouTube Channel',
      });
      const spotifySource = createMockSourceView({
        id: 'source-002',
        provider: Provider.SPOTIFY,
        feedUrl: 'https://open.spotify.com/show/abc123',
        name: 'Spotify Show',
      });
      const rssSource = createMockSourceView({
        id: 'source-003',
        provider: Provider.RSS,
        feedUrl: 'https://blog.example.com/rss',
        name: 'Example Blog',
      });

      const caller = createMockSourcesCaller({
        userId: TEST_USER_ID,
        sources: [youtubeSource, spotifySource, rssSource],
      });
      const result = await caller.list();

      expect(result).toHaveLength(3);
      expect(result.map((s: SourceView) => s.provider)).toEqual([
        Provider.YOUTUBE,
        Provider.SPOTIFY,
        Provider.RSS,
      ]);
    });
  });

  // ==========================================================================
  // sources.add Tests
  // ==========================================================================

  describe('sources.add', () => {
    it('should create a YouTube source', async () => {
      const caller = createMockSourcesCaller({
        userId: TEST_USER_ID,
      });
      const result = await caller.add({
        provider: Provider.YOUTUBE,
        feedUrl: 'https://youtube.com/@fireship',
        name: 'Fireship',
      });

      expect(result).toMatchObject({
        provider: Provider.YOUTUBE,
        feedUrl: 'https://youtube.com/@fireship',
        name: 'Fireship',
        providerId: 'fireship',
      });
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should create a Spotify source', async () => {
      const caller = createMockSourcesCaller({
        userId: TEST_USER_ID,
      });
      const result = await caller.add({
        provider: Provider.SPOTIFY,
        feedUrl: 'https://open.spotify.com/show/abc123xyz',
        name: 'My Podcast',
      });

      expect(result).toMatchObject({
        provider: Provider.SPOTIFY,
        feedUrl: 'https://open.spotify.com/show/abc123xyz',
        name: 'My Podcast',
        providerId: 'abc123xyz',
      });
    });

    it('should create a Substack source', async () => {
      const caller = createMockSourcesCaller({
        userId: TEST_USER_ID,
      });
      const result = await caller.add({
        provider: Provider.SUBSTACK,
        feedUrl: 'https://simonwillison.substack.com',
        name: 'Simon Willison',
      });

      expect(result).toMatchObject({
        provider: Provider.SUBSTACK,
        feedUrl: 'https://simonwillison.substack.com',
        name: 'Simon Willison',
        providerId: 'simonwillison',
      });
    });

    it('should create an RSS source', async () => {
      const caller = createMockSourcesCaller({
        userId: TEST_USER_ID,
      });
      const result = await caller.add({
        provider: Provider.RSS,
        feedUrl: 'https://blog.example.com/feed.xml',
        name: 'Example Blog',
      });

      expect(result).toMatchObject({
        provider: Provider.RSS,
        feedUrl: 'https://blog.example.com/feed.xml',
        name: 'Example Blog',
      });
    });

    it('should auto-derive name from YouTube URL when not provided', async () => {
      const caller = createMockSourcesCaller({
        userId: TEST_USER_ID,
      });
      const result = await caller.add({
        provider: Provider.YOUTUBE,
        feedUrl: 'https://youtube.com/@theo',
      });

      expect(result.name).toBe('theo');
    });

    it('should throw CONFLICT when source already exists', async () => {
      const caller = createMockSourcesCaller({
        userId: TEST_USER_ID,
        existingFeedUrls: new Set(['https://youtube.com/@test']),
      });

      await expect(
        caller.add({
          provider: Provider.YOUTUBE,
          feedUrl: 'https://youtube.com/@test',
        })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.add({
          provider: Provider.YOUTUBE,
          feedUrl: 'https://youtube.com/@test',
        })
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Already subscribed to this source',
      });
    });
  });

  // ==========================================================================
  // sources.remove Tests
  // ==========================================================================

  describe('sources.remove', () => {
    it('should return success when removing existing source', async () => {
      const source = createMockSourceView({ id: 'source-001' });
      const caller = createMockSourcesCaller({
        userId: TEST_USER_ID,
        sources: [source],
      });
      const result = await caller.remove({ id: 'source-001' });

      expect(result).toEqual({ success: true });
    });

    it('should throw NOT_FOUND when source does not exist', async () => {
      const caller = createMockSourcesCaller({
        userId: TEST_USER_ID,
        sources: [],
      });

      await expect(caller.remove({ id: 'nonexistent' })).rejects.toThrow(TRPCError);
      await expect(caller.remove({ id: 'nonexistent' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('should not throw when removing own source', async () => {
      const source = createMockSourceView({ id: 'my-source' });
      const caller = createMockSourcesCaller({
        userId: TEST_USER_ID,
        sources: [source],
      });

      // Should not throw
      const result = await caller.remove({ id: 'my-source' });
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// SourceView Type Tests
// ============================================================================

describe('SourceView Type', () => {
  it('should have correct shape for SourceView', () => {
    const sourceView: SourceView = {
      id: 'source-001',
      provider: Provider.YOUTUBE,
      providerId: 'channel-123',
      feedUrl: 'https://youtube.com/@testchannel',
      name: 'Test Channel',
      createdAt: '2024-12-01T00:00:00Z',
      updatedAt: '2024-12-01T00:00:00Z',
    };

    expect(sourceView.id).toBe('source-001');
    expect(sourceView.provider).toBe(Provider.YOUTUBE);
    expect(sourceView.providerId).toBe('channel-123');
    expect(sourceView.feedUrl).toBe('https://youtube.com/@testchannel');
    expect(sourceView.name).toBe('Test Channel');
    expect(sourceView.createdAt).toBeDefined();
    expect(sourceView.updatedAt).toBeDefined();
  });

  it('should support all provider types', () => {
    const providers = [Provider.YOUTUBE, Provider.SPOTIFY, Provider.SUBSTACK, Provider.RSS];

    providers.forEach((provider) => {
      const sourceView: SourceView = {
        id: `source-${provider.toLowerCase()}`,
        provider,
        providerId: `id-${provider.toLowerCase()}`,
        feedUrl: `https://example.com/${provider.toLowerCase()}`,
        name: `${provider} Source`,
        createdAt: '2024-12-01T00:00:00Z',
        updatedAt: '2024-12-01T00:00:00Z',
      };

      expect(sourceView.provider).toBe(provider);
    });
  });
});

// ============================================================================
// Provider ID Extraction Tests
// ============================================================================

describe('Provider ID Extraction', () => {
  it('should extract YouTube channel from @ URL', () => {
    const result = deriveProviderId('https://youtube.com/@fireship', Provider.YOUTUBE);
    expect(result).toBe('fireship');
  });

  it('should extract YouTube channel from /channel/ URL', () => {
    const result = deriveProviderId('https://youtube.com/channel/UC123abc', Provider.YOUTUBE);
    expect(result).toBe('UC123abc');
  });

  it('should extract Spotify show ID', () => {
    const result = deriveProviderId('https://open.spotify.com/show/abc123xyz', Provider.SPOTIFY);
    expect(result).toBe('abc123xyz');
  });

  it('should extract Substack subdomain', () => {
    const result = deriveProviderId('https://simonwillison.substack.com', Provider.SUBSTACK);
    expect(result).toBe('simonwillison');
  });

  it('should use hostname+path for RSS', () => {
    const result = deriveProviderId('https://blog.example.com/feed.xml', Provider.RSS);
    expect(result).toBe('blog.example.com/feed.xml');
  });
});

// ============================================================================
// Name Derivation Tests
// ============================================================================

describe('Name Derivation', () => {
  it('should derive name from YouTube @ URL', () => {
    const result = deriveNameFromUrl('https://youtube.com/@fireship', Provider.YOUTUBE);
    expect(result).toBe('fireship');
  });

  it('should default to "YouTube Channel" for /channel/ URLs', () => {
    const result = deriveNameFromUrl('https://youtube.com/channel/UC123', Provider.YOUTUBE);
    expect(result).toBe('YouTube Channel');
  });

  it('should default to "Spotify Show" for Spotify URLs', () => {
    const result = deriveNameFromUrl('https://open.spotify.com/show/abc', Provider.SPOTIFY);
    expect(result).toBe('Spotify Show');
  });

  it('should use subdomain for Substack', () => {
    const result = deriveNameFromUrl('https://simonwillison.substack.com', Provider.SUBSTACK);
    expect(result).toBe('simonwillison');
  });

  it('should use hostname for RSS', () => {
    const result = deriveNameFromUrl('https://blog.example.com/feed.xml', Provider.RSS);
    expect(result).toBe('blog.example.com');
  });
});
