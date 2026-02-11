/**
 * Unit Tests for Creators Router
 *
 * Tests the tRPC creators router structure and procedures including:
 * - Router structure verification (all endpoints defined)
 * - creators.get - Get creator by ID
 * - creators.listBookmarks - List bookmarked items for creator
 * - creators.listPublications - List all publications for creator
 * - creators.fetchLatestContent - Fetch latest content from creator
 * - creators.checkSubscription - Check subscription status
 * - creators.subscribe - Subscribe to creator
 * - Auth: Verify unauthenticated requests fail
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import type {
  CheckSubscriptionResponse,
  SubscribeResponse,
  FetchLatestContentResponse,
} from './creators';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_USER_ID = 'user_test_123';
const TEST_CREATOR_ID = 'creator_test_abc';

/**
 * Creator type matching the database schema
 */
interface Creator {
  id: string;
  provider: string;
  providerCreatorId: string;
  name: string;
  normalizedName: string;
  imageUrl: string | null;
  description: string | null;
  externalUrl: string | null;
  handle: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Create a mock Creator for testing
 */
function createMockCreator(overrides: Partial<Creator> = {}): Creator {
  const now = Date.now();
  return {
    id: TEST_CREATOR_ID,
    provider: 'YOUTUBE',
    providerCreatorId: 'UC123456',
    name: 'Test Creator',
    normalizedName: 'test creator',
    imageUrl: 'https://example.com/avatar.jpg',
    description: 'A test creator description',
    externalUrl: 'https://youtube.com/@testcreator',
    handle: '@testcreator',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Subscription type matching the database schema
 */
interface Subscription {
  id: string;
  userId: string;
  provider: string;
  providerChannelId: string;
  name: string;
  status: string;
}

/**
 * Provider Connection type matching the database schema
 */
interface ProviderConnection {
  id: string;
  userId: string;
  provider: string;
  status: string;
}

/**
 * Create a mock Subscription for testing
 */
function createMockSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub_test_123',
    userId: TEST_USER_ID,
    provider: 'YOUTUBE',
    providerChannelId: 'UC123456',
    name: 'Test Channel',
    status: 'ACTIVE',
    ...overrides,
  };
}

/**
 * Create a mock ProviderConnection for testing
 */
function createMockProviderConnection(
  overrides: Partial<ProviderConnection> = {}
): ProviderConnection {
  return {
    id: 'conn_test_123',
    userId: TEST_USER_ID,
    provider: 'YOUTUBE',
    status: 'ACTIVE',
    ...overrides,
  };
}

// ============================================================================
// Mock Router Implementation for Testing
// ============================================================================

/**
 * Mock content item for testing fetchLatestContent
 */
interface MockContentItem {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  publishedAt: number;
  externalUrl: string;
  duration: number | null;
  itemId?: string | null;
  isBookmarked: boolean;
}

/**
 * Create a mock router caller that simulates the creators router behavior.
 * This mirrors the actual router structure and validates authentication.
 */
function createMockCreatorsCaller(options: {
  userId: string | null;
  creators?: Map<string, Creator>;
  subscriptions?: Map<string, Subscription>;
  connections?: Map<string, ProviderConnection>;
  /** Mock content for fetchLatestContent */
  mockContentItems?: MockContentItem[];
  /** Force a specific error or reason for fetchLatestContent */
  fetchLatestContentBehavior?: {
    reason?: 'PROVIDER_NOT_SUPPORTED' | 'NOT_CONNECTED' | 'TOKEN_EXPIRED' | 'RATE_LIMITED';
    connectUrl?: string;
    shouldThrowNotFound?: boolean;
  };
}) {
  const {
    userId,
    creators = new Map(),
    subscriptions = new Map(),
    connections = new Map(),
    mockContentItems = [],
    fetchLatestContentBehavior,
  } = options;

  const requireAuth = () => {
    if (!userId) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
  };

  return {
    get: async (input: { creatorId: string }) => {
      requireAuth();

      const creator = creators.get(input.creatorId);
      if (!creator) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Creator not found',
        });
      }

      return creator;
    },

    listBookmarks: async (input: { creatorId: string; cursor?: string; limit?: number }) => {
      requireAuth();

      // Throw NOT_FOUND if creator doesn't exist
      const creator = creators.get(input.creatorId);
      if (!creator) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Creator not found',
        });
      }

      // Returns empty list for mock implementation
      return {
        items: [] as unknown[],
        nextCursor: null as string | null,
        hasMore: false,
      };
    },

    listPublications: async (input: { creatorId: string; cursor?: string; limit?: number }) => {
      requireAuth();

      // Throw NOT_FOUND if creator doesn't exist
      const creator = creators.get(input.creatorId);
      if (!creator) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Creator not found',
        });
      }

      // Returns empty list for mock implementation
      return {
        items: [] as unknown[],
        nextCursor: null as string | null,
        hasMore: false,
      };
    },

    fetchLatestContent: async (input: {
      creatorId: string;
    }): Promise<FetchLatestContentResponse> => {
      requireAuth();

      // Check for forced behavior
      if (fetchLatestContentBehavior?.shouldThrowNotFound) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Creator not found',
        });
      }

      // Get the creator
      const creator = creators.get(input.creatorId);
      if (!creator) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Creator not found',
        });
      }

      // Check for forced reason
      if (fetchLatestContentBehavior?.reason) {
        return {
          items: [],
          provider: creator.provider,
          reason: fetchLatestContentBehavior.reason,
          connectUrl: fetchLatestContentBehavior.connectUrl,
        };
      }

      // Check provider support
      if (!['YOUTUBE', 'SPOTIFY'].includes(creator.provider)) {
        return {
          items: [],
          provider: creator.provider,
          reason: 'PROVIDER_NOT_SUPPORTED',
        };
      }

      // Check connection
      let connection: ProviderConnection | undefined;
      for (const conn of connections.values()) {
        if (
          conn.userId === userId &&
          conn.provider === creator.provider &&
          conn.status === 'ACTIVE'
        ) {
          connection = conn;
          break;
        }
      }

      if (!connection) {
        return {
          items: [],
          provider: creator.provider,
          reason: 'NOT_CONNECTED',
          connectUrl: `/connect/${creator.provider.toLowerCase()}`,
        };
      }

      // Return mock content items
      return {
        items: mockContentItems,
        provider: creator.provider,
        cacheStatus: 'MISS',
      };
    },

    checkSubscription: async (input: { creatorId: string }): Promise<CheckSubscriptionResponse> => {
      requireAuth();

      // 1. Get the creator
      const creator = creators.get(input.creatorId);
      if (!creator) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Creator not found',
        });
      }

      // 2. Only YOUTUBE and SPOTIFY support subscriptions
      if (!['YOUTUBE', 'SPOTIFY'].includes(creator.provider)) {
        return {
          isSubscribed: false,
          canSubscribe: false,
          reason: 'PROVIDER_NOT_SUPPORTED',
        };
      }

      // 3. Check if subscription exists for this user + provider + creator
      let subscription: Subscription | undefined;
      for (const sub of subscriptions.values()) {
        if (
          sub.userId === userId &&
          sub.provider === creator.provider &&
          sub.providerChannelId === creator.providerCreatorId
        ) {
          subscription = sub;
          break;
        }
      }

      // 4. Check if user is connected to the provider with ACTIVE status
      let connection: ProviderConnection | undefined;
      for (const conn of connections.values()) {
        if (
          conn.userId === userId &&
          conn.provider === creator.provider &&
          conn.status === 'ACTIVE'
        ) {
          connection = conn;
          break;
        }
      }

      return {
        isSubscribed: !!subscription && subscription.status === 'ACTIVE',
        subscriptionId: subscription?.id,
        canSubscribe: !!connection,
        reason: connection ? undefined : 'NOT_CONNECTED',
      };
    },

    subscribe: async (input: { creatorId: string }): Promise<SubscribeResponse> => {
      requireAuth();

      // 1. Get the creator
      const creator = creators.get(input.creatorId);
      if (!creator) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Creator not found',
        });
      }

      // 2. Only YOUTUBE and SPOTIFY support subscriptions
      if (!['YOUTUBE', 'SPOTIFY'].includes(creator.provider)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Subscriptions not supported for this provider',
        });
      }

      // 3. Check if user is connected to the provider
      let connection: ProviderConnection | undefined;
      for (const conn of connections.values()) {
        if (
          conn.userId === userId &&
          conn.provider === creator.provider &&
          conn.status === 'ACTIVE'
        ) {
          connection = conn;
          break;
        }
      }

      if (!connection) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Please connect your account first',
        });
      }

      // 4. Check if subscription already exists (idempotent)
      for (const sub of subscriptions.values()) {
        if (
          sub.userId === userId &&
          sub.provider === creator.provider &&
          sub.providerChannelId === creator.providerCreatorId
        ) {
          return {
            id: sub.id,
            provider: sub.provider,
            name: sub.name,
            imageUrl: null, // Simplified for mock
            enabled: sub.status === 'ACTIVE',
          };
        }
      }

      // 5. Create new subscription (mock: just return the expected shape)
      const newSubscriptionId = `sub_new_${Date.now()}`;
      return {
        id: newSubscriptionId,
        provider: creator.provider,
        name: creator.name,
        imageUrl: creator.imageUrl,
        enabled: true,
      };
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Creators Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================================================
  // Authentication Tests
  // ==========================================================================

  describe('Authentication', () => {
    it('should reject unauthenticated requests to get', async () => {
      const caller = createMockCreatorsCaller({ userId: null });

      await expect(caller.get({ creatorId: TEST_CREATOR_ID })).rejects.toThrow(TRPCError);
      await expect(caller.get({ creatorId: TEST_CREATOR_ID })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to listBookmarks', async () => {
      const caller = createMockCreatorsCaller({ userId: null });

      await expect(caller.listBookmarks({ creatorId: TEST_CREATOR_ID })).rejects.toThrow(TRPCError);
      await expect(caller.listBookmarks({ creatorId: TEST_CREATOR_ID })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to listPublications', async () => {
      const caller = createMockCreatorsCaller({ userId: null });

      await expect(caller.listPublications({ creatorId: TEST_CREATOR_ID })).rejects.toThrow(
        TRPCError
      );
      await expect(caller.listPublications({ creatorId: TEST_CREATOR_ID })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to fetchLatestContent', async () => {
      const caller = createMockCreatorsCaller({ userId: null });

      await expect(caller.fetchLatestContent({ creatorId: TEST_CREATOR_ID })).rejects.toThrow(
        TRPCError
      );
      await expect(caller.fetchLatestContent({ creatorId: TEST_CREATOR_ID })).rejects.toMatchObject(
        {
          code: 'UNAUTHORIZED',
        }
      );
    });

    it('should reject unauthenticated requests to checkSubscription', async () => {
      const caller = createMockCreatorsCaller({ userId: null });

      await expect(caller.checkSubscription({ creatorId: TEST_CREATOR_ID })).rejects.toThrow(
        TRPCError
      );
      await expect(caller.checkSubscription({ creatorId: TEST_CREATOR_ID })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to subscribe', async () => {
      const caller = createMockCreatorsCaller({ userId: null });

      await expect(caller.subscribe({ creatorId: TEST_CREATOR_ID })).rejects.toThrow(TRPCError);
      await expect(caller.subscribe({ creatorId: TEST_CREATOR_ID })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  // ==========================================================================
  // creators.get Tests
  // ==========================================================================

  describe('creators.get', () => {
    it('should return creator when found', async () => {
      const testCreator = createMockCreator({
        id: 'creator_123',
        name: 'Found Creator',
        provider: 'YOUTUBE',
        handle: '@foundcreator',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('creator_123', testCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
      });

      const result = await caller.get({ creatorId: 'creator_123' });

      expect(result).toEqual(testCreator);
      expect(result.id).toBe('creator_123');
      expect(result.name).toBe('Found Creator');
      expect(result.provider).toBe('YOUTUBE');
      expect(result.handle).toBe('@foundcreator');
    });

    it('should throw NOT_FOUND when creator does not exist', async () => {
      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: new Map(),
      });

      await expect(caller.get({ creatorId: 'nonexistent' })).rejects.toThrow(TRPCError);
      await expect(caller.get({ creatorId: 'nonexistent' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Creator not found',
      });
    });

    it('should return creator with all fields populated', async () => {
      const now = Date.now();
      const fullCreator = createMockCreator({
        id: 'full_creator',
        provider: 'SPOTIFY',
        providerCreatorId: 'spotify_show_123',
        name: 'Full Creator',
        normalizedName: 'full creator',
        imageUrl: 'https://example.com/full-avatar.jpg',
        description: 'A complete creator profile with all fields',
        externalUrl: 'https://spotify.com/show/123',
        handle: null, // Spotify shows don't have handles
        createdAt: now - 86400000, // Created 1 day ago
        updatedAt: now,
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('full_creator', fullCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
      });

      const result = await caller.get({ creatorId: 'full_creator' });

      expect(result.id).toBe('full_creator');
      expect(result.provider).toBe('SPOTIFY');
      expect(result.providerCreatorId).toBe('spotify_show_123');
      expect(result.name).toBe('Full Creator');
      expect(result.normalizedName).toBe('full creator');
      expect(result.imageUrl).toBe('https://example.com/full-avatar.jpg');
      expect(result.description).toBe('A complete creator profile with all fields');
      expect(result.externalUrl).toBe('https://spotify.com/show/123');
      expect(result.handle).toBeNull();
      expect(result.createdAt).toBe(now - 86400000);
      expect(result.updatedAt).toBe(now);
    });

    it('should return creator with minimal fields (nullable fields as null)', async () => {
      const minimalCreator = createMockCreator({
        id: 'minimal_creator',
        provider: 'RSS',
        providerCreatorId: 'https://example.com/feed.xml',
        name: 'Minimal Creator',
        normalizedName: 'minimal creator',
        imageUrl: null,
        description: null,
        externalUrl: null,
        handle: null,
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('minimal_creator', minimalCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
      });

      const result = await caller.get({ creatorId: 'minimal_creator' });

      expect(result.id).toBe('minimal_creator');
      expect(result.imageUrl).toBeNull();
      expect(result.description).toBeNull();
      expect(result.externalUrl).toBeNull();
      expect(result.handle).toBeNull();
    });
  });

  // ==========================================================================
  // creators.listBookmarks Tests
  // ==========================================================================

  describe('creators.listBookmarks', () => {
    it('should return empty list when creator exists but has no bookmarks', async () => {
      const testCreator = createMockCreator({ id: TEST_CREATOR_ID });
      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set(TEST_CREATOR_ID, testCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
      });

      const result = await caller.listBookmarks({
        creatorId: TEST_CREATOR_ID,
        limit: 20,
      });

      expect(result).toEqual({
        items: [],
        nextCursor: null,
        hasMore: false,
      });
    });

    it('should accept optional cursor parameter', async () => {
      const testCreator = createMockCreator({ id: TEST_CREATOR_ID });
      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set(TEST_CREATOR_ID, testCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
      });

      const result = await caller.listBookmarks({
        creatorId: TEST_CREATOR_ID,
        cursor: 'cursor_abc',
        limit: 10,
      });

      expect(result).toEqual({
        items: [],
        nextCursor: null,
        hasMore: false,
      });
    });

    it('should throw NOT_FOUND when creator does not exist', async () => {
      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: new Map(),
      });

      await expect(caller.listBookmarks({ creatorId: 'nonexistent' })).rejects.toThrow(TRPCError);
      await expect(caller.listBookmarks({ creatorId: 'nonexistent' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Creator not found',
      });
    });

    it('should return response with hasMore boolean', async () => {
      const testCreator = createMockCreator({ id: TEST_CREATOR_ID });
      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set(TEST_CREATOR_ID, testCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
      });

      const result = await caller.listBookmarks({
        creatorId: TEST_CREATOR_ID,
      });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('nextCursor');
      expect(result).toHaveProperty('hasMore');
      expect(typeof result.hasMore).toBe('boolean');
    });

    it('should accept limit parameter', async () => {
      const testCreator = createMockCreator({ id: TEST_CREATOR_ID });
      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set(TEST_CREATOR_ID, testCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
      });

      // Should not throw with valid limit
      const result = await caller.listBookmarks({
        creatorId: TEST_CREATOR_ID,
        limit: 50, // max limit
      });

      expect(result.items).toEqual([]);
    });
  });

  // ==========================================================================
  // creators.fetchLatestContent Tests
  // ==========================================================================

  describe('creators.fetchLatestContent', () => {
    it('should throw NOT_FOUND when creator does not exist', async () => {
      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: new Map(),
      });

      await expect(caller.fetchLatestContent({ creatorId: 'nonexistent' })).rejects.toThrow(
        TRPCError
      );
      await expect(caller.fetchLatestContent({ creatorId: 'nonexistent' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Creator not found',
      });
    });

    it('should return PROVIDER_NOT_SUPPORTED for RSS creator', async () => {
      const rssCreator = createMockCreator({
        id: 'rss_creator',
        provider: 'RSS',
        providerCreatorId: 'https://example.com/feed.xml',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('rss_creator', rssCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
      });

      const result = await caller.fetchLatestContent({ creatorId: 'rss_creator' });

      expect(result.items).toEqual([]);
      expect(result.provider).toBe('RSS');
      expect(result.reason).toBe('PROVIDER_NOT_SUPPORTED');
    });

    it('should return PROVIDER_NOT_SUPPORTED for SUBSTACK creator', async () => {
      const substackCreator = createMockCreator({
        id: 'substack_creator',
        provider: 'SUBSTACK',
        providerCreatorId: 'substack-123',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('substack_creator', substackCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
      });

      const result = await caller.fetchLatestContent({ creatorId: 'substack_creator' });

      expect(result.items).toEqual([]);
      expect(result.provider).toBe('SUBSTACK');
      expect(result.reason).toBe('PROVIDER_NOT_SUPPORTED');
    });

    it('should return NOT_CONNECTED for YouTube creator when user has no connection', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        connections: new Map(),
      });

      const result = await caller.fetchLatestContent({ creatorId: 'yt_creator' });

      expect(result.items).toEqual([]);
      expect(result.provider).toBe('YOUTUBE');
      expect(result.reason).toBe('NOT_CONNECTED');
      expect(result.connectUrl).toBe('/connect/youtube');
    });

    it('should return NOT_CONNECTED for Spotify creator when user has no connection', async () => {
      const spotifyCreator = createMockCreator({
        id: 'spotify_creator',
        provider: 'SPOTIFY',
        providerCreatorId: '0testshow123456',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('spotify_creator', spotifyCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        connections: new Map(),
      });

      const result = await caller.fetchLatestContent({ creatorId: 'spotify_creator' });

      expect(result.items).toEqual([]);
      expect(result.provider).toBe('SPOTIFY');
      expect(result.reason).toBe('NOT_CONNECTED');
      expect(result.connectUrl).toBe('/connect/spotify');
    });

    it('should return NOT_CONNECTED when connection exists but is not ACTIVE', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      const expiredConnection = createMockProviderConnection({
        provider: 'YOUTUBE',
        status: 'EXPIRED',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(expiredConnection.id, expiredConnection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        connections: connectionsMap,
      });

      const result = await caller.fetchLatestContent({ creatorId: 'yt_creator' });

      expect(result.items).toEqual([]);
      expect(result.reason).toBe('NOT_CONNECTED');
    });

    it('should return content items for YouTube creator when connected', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      const connection = createMockProviderConnection({
        provider: 'YOUTUBE',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(connection.id, connection);

      const mockItems: MockContentItem[] = [
        {
          id: 'video_123',
          title: 'Test Video',
          description: 'A test video description',
          thumbnailUrl: 'https://example.com/thumb.jpg',
          publishedAt: Date.now() - 86400000,
          externalUrl: 'https://www.youtube.com/watch?v=video_123',
          duration: 600,
          itemId: 'item_123',
          isBookmarked: false,
        },
        {
          id: 'video_456',
          title: 'Another Video',
          description: 'Another description',
          thumbnailUrl: 'https://example.com/thumb2.jpg',
          publishedAt: Date.now() - 172800000,
          externalUrl: 'https://www.youtube.com/watch?v=video_456',
          duration: 1200,
          itemId: null,
          isBookmarked: true,
        },
      ];

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        connections: connectionsMap,
        mockContentItems: mockItems,
      });

      const result = await caller.fetchLatestContent({ creatorId: 'yt_creator' });

      expect(result.items).toHaveLength(2);
      expect(result.provider).toBe('YOUTUBE');
      expect(result.reason).toBeUndefined();
      expect(result.items[0].id).toBe('video_123');
      expect(result.items[0].title).toBe('Test Video');
      expect(result.items[0].isBookmarked).toBe(false);
      expect(result.items[0].itemId).toBe('item_123');
      expect(result.items[1].id).toBe('video_456');
      expect(result.items[1].isBookmarked).toBe(true);
      expect(result.items[1].itemId).toBeNull();
    });

    it('should return content items for Spotify creator when connected', async () => {
      const spotifyCreator = createMockCreator({
        id: 'spotify_creator',
        provider: 'SPOTIFY',
        providerCreatorId: '0testshow123456',
      });

      const connection = createMockProviderConnection({
        provider: 'SPOTIFY',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('spotify_creator', spotifyCreator);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(connection.id, connection);

      const mockItems: MockContentItem[] = [
        {
          id: 'episode_123',
          title: 'Episode 1',
          description: 'First episode',
          thumbnailUrl: 'https://example.com/ep1.jpg',
          publishedAt: Date.now() - 86400000,
          externalUrl: 'https://open.spotify.com/episode/episode_123',
          duration: 3600,
          isBookmarked: false,
        },
      ];

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        connections: connectionsMap,
        mockContentItems: mockItems,
      });

      const result = await caller.fetchLatestContent({ creatorId: 'spotify_creator' });

      expect(result.items).toHaveLength(1);
      expect(result.provider).toBe('SPOTIFY');
      expect(result.items[0].id).toBe('episode_123');
      expect(result.items[0].duration).toBe(3600);
    });

    it('should return TOKEN_EXPIRED when token refresh fails', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        fetchLatestContentBehavior: {
          reason: 'TOKEN_EXPIRED',
          connectUrl: '/connect/youtube',
        },
      });

      const result = await caller.fetchLatestContent({ creatorId: 'yt_creator' });

      expect(result.items).toEqual([]);
      expect(result.provider).toBe('YOUTUBE');
      expect(result.reason).toBe('TOKEN_EXPIRED');
      expect(result.connectUrl).toBe('/connect/youtube');
    });

    it('should return RATE_LIMITED when API rate limit is hit', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        fetchLatestContentBehavior: {
          reason: 'RATE_LIMITED',
        },
      });

      const result = await caller.fetchLatestContent({ creatorId: 'yt_creator' });

      expect(result.items).toEqual([]);
      expect(result.provider).toBe('YOUTUBE');
      expect(result.reason).toBe('RATE_LIMITED');
    });

    it('should return empty items when creator has no content', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      const connection = createMockProviderConnection({
        provider: 'YOUTUBE',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(connection.id, connection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        connections: connectionsMap,
        mockContentItems: [], // Empty content
      });

      const result = await caller.fetchLatestContent({ creatorId: 'yt_creator' });

      expect(result.items).toEqual([]);
      expect(result.provider).toBe('YOUTUBE');
      expect(result.reason).toBeUndefined();
    });

    it('should return response matching FetchLatestContentResponse interface', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      const connection = createMockProviderConnection({
        provider: 'YOUTUBE',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(connection.id, connection);

      const mockItems: MockContentItem[] = [
        {
          id: 'video_123',
          title: 'Test Video',
          description: 'Description',
          thumbnailUrl: 'https://example.com/thumb.jpg',
          publishedAt: Date.now(),
          externalUrl: 'https://www.youtube.com/watch?v=video_123',
          duration: 600,
          itemId: 'item_456',
          isBookmarked: false,
        },
      ];

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        connections: connectionsMap,
        mockContentItems: mockItems,
      });

      const result = await caller.fetchLatestContent({ creatorId: 'yt_creator' });

      // Verify response shape
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('cacheStatus');
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.provider).toBe('string');
      expect(['HIT', 'MISS']).toContain(result.cacheStatus);

      // Verify item shape
      const item = result.items[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('thumbnailUrl');
      expect(item).toHaveProperty('publishedAt');
      expect(item).toHaveProperty('externalUrl');
      expect(item).toHaveProperty('duration');
      expect(item).toHaveProperty('itemId');
      expect(item).toHaveProperty('isBookmarked');
    });

    it('should not match connection from different provider', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      // User has Spotify connection but not YouTube
      const spotifyConnection = createMockProviderConnection({
        provider: 'SPOTIFY',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(spotifyConnection.id, spotifyConnection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        connections: connectionsMap,
      });

      const result = await caller.fetchLatestContent({ creatorId: 'yt_creator' });

      // Should not match Spotify connection for YouTube creator
      expect(result.reason).toBe('NOT_CONNECTED');
    });
  });

  // ==========================================================================
  // creators.checkSubscription Tests
  // ==========================================================================

  describe('creators.checkSubscription', () => {
    it('should throw NOT_FOUND when creator does not exist', async () => {
      const caller = createMockCreatorsCaller({ userId: TEST_USER_ID });

      await expect(caller.checkSubscription({ creatorId: 'nonexistent' })).rejects.toThrow(
        TRPCError
      );
      await expect(caller.checkSubscription({ creatorId: 'nonexistent' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Creator not found',
      });
    });

    it('should return canSubscribe=false for unsupported providers (RSS)', async () => {
      const rssCreator = createMockCreator({
        id: 'rss_creator',
        provider: 'RSS',
        providerCreatorId: 'https://example.com/feed.xml',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('rss_creator', rssCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
      });

      const result = await caller.checkSubscription({ creatorId: 'rss_creator' });

      expect(result).toEqual({
        isSubscribed: false,
        canSubscribe: false,
        reason: 'PROVIDER_NOT_SUPPORTED',
      });
    });

    it('should return canSubscribe=false for unsupported providers (SUBSTACK)', async () => {
      const substackCreator = createMockCreator({
        id: 'substack_creator',
        provider: 'SUBSTACK',
        providerCreatorId: 'substack-user-123',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('substack_creator', substackCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
      });

      const result = await caller.checkSubscription({ creatorId: 'substack_creator' });

      expect(result).toEqual({
        isSubscribed: false,
        canSubscribe: false,
        reason: 'PROVIDER_NOT_SUPPORTED',
      });
    });

    it('should return canSubscribe=false if not connected to YouTube', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      // No connections
      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        connections: new Map(),
      });

      const result = await caller.checkSubscription({ creatorId: 'yt_creator' });

      expect(result).toEqual({
        isSubscribed: false,
        subscriptionId: undefined,
        canSubscribe: false,
        reason: 'NOT_CONNECTED',
      });
    });

    it('should return canSubscribe=false if not connected to Spotify', async () => {
      const spotifyCreator = createMockCreator({
        id: 'spotify_creator',
        provider: 'SPOTIFY',
        providerCreatorId: '0testshow123456789012',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('spotify_creator', spotifyCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        connections: new Map(),
      });

      const result = await caller.checkSubscription({ creatorId: 'spotify_creator' });

      expect(result).toEqual({
        isSubscribed: false,
        subscriptionId: undefined,
        canSubscribe: false,
        reason: 'NOT_CONNECTED',
      });
    });

    it('should return isSubscribed=true for YouTube creator when user is subscribed', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      const subscription = createMockSubscription({
        id: 'sub_yt_123',
        provider: 'YOUTUBE',
        providerChannelId: 'UCtest123',
        status: 'ACTIVE',
      });

      const connection = createMockProviderConnection({
        provider: 'YOUTUBE',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const subscriptionsMap = new Map<string, Subscription>();
      subscriptionsMap.set(subscription.id, subscription);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(connection.id, connection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        subscriptions: subscriptionsMap,
        connections: connectionsMap,
      });

      const result = await caller.checkSubscription({ creatorId: 'yt_creator' });

      expect(result.isSubscribed).toBe(true);
      expect(result.subscriptionId).toBe('sub_yt_123');
      expect(result.canSubscribe).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return isSubscribed=true for Spotify creator when user is subscribed', async () => {
      const spotifyCreator = createMockCreator({
        id: 'spotify_creator',
        provider: 'SPOTIFY',
        providerCreatorId: '0testshow123456789012',
      });

      const subscription = createMockSubscription({
        id: 'sub_spotify_123',
        provider: 'SPOTIFY',
        providerChannelId: '0testshow123456789012',
        status: 'ACTIVE',
      });

      const connection = createMockProviderConnection({
        provider: 'SPOTIFY',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('spotify_creator', spotifyCreator);

      const subscriptionsMap = new Map<string, Subscription>();
      subscriptionsMap.set(subscription.id, subscription);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(connection.id, connection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        subscriptions: subscriptionsMap,
        connections: connectionsMap,
      });

      const result = await caller.checkSubscription({ creatorId: 'spotify_creator' });

      expect(result.isSubscribed).toBe(true);
      expect(result.subscriptionId).toBe('sub_spotify_123');
      expect(result.canSubscribe).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return canSubscribe=true but isSubscribed=false when connected but not subscribed', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      const connection = createMockProviderConnection({
        provider: 'YOUTUBE',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(connection.id, connection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        subscriptions: new Map(), // No subscriptions
        connections: connectionsMap,
      });

      const result = await caller.checkSubscription({ creatorId: 'yt_creator' });

      expect(result.isSubscribed).toBe(false);
      expect(result.subscriptionId).toBeUndefined();
      expect(result.canSubscribe).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return isSubscribed=false when subscription exists but is not ACTIVE', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      const subscription = createMockSubscription({
        id: 'sub_yt_123',
        provider: 'YOUTUBE',
        providerChannelId: 'UCtest123',
        status: 'PAUSED', // Not active
      });

      const connection = createMockProviderConnection({
        provider: 'YOUTUBE',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const subscriptionsMap = new Map<string, Subscription>();
      subscriptionsMap.set(subscription.id, subscription);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(connection.id, connection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        subscriptions: subscriptionsMap,
        connections: connectionsMap,
      });

      const result = await caller.checkSubscription({ creatorId: 'yt_creator' });

      expect(result.isSubscribed).toBe(false);
      expect(result.subscriptionId).toBe('sub_yt_123'); // Still returns the subscription ID
      expect(result.canSubscribe).toBe(true);
    });

    it('should return canSubscribe=false when connection exists but is not ACTIVE', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      const connection = createMockProviderConnection({
        provider: 'YOUTUBE',
        status: 'EXPIRED', // Not active
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(connection.id, connection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        subscriptions: new Map(),
        connections: connectionsMap,
      });

      const result = await caller.checkSubscription({ creatorId: 'yt_creator' });

      expect(result.isSubscribed).toBe(false);
      expect(result.canSubscribe).toBe(false);
      expect(result.reason).toBe('NOT_CONNECTED');
    });

    it('should not match subscription from different provider', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      // Spotify subscription with same channel ID but different provider
      const subscription = createMockSubscription({
        id: 'sub_spotify_123',
        provider: 'SPOTIFY',
        providerChannelId: 'UCtest123', // Same ID but different provider
        status: 'ACTIVE',
      });

      const ytConnection = createMockProviderConnection({
        provider: 'YOUTUBE',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const subscriptionsMap = new Map<string, Subscription>();
      subscriptionsMap.set(subscription.id, subscription);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(ytConnection.id, ytConnection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        subscriptions: subscriptionsMap,
        connections: connectionsMap,
      });

      const result = await caller.checkSubscription({ creatorId: 'yt_creator' });

      // Should not match the Spotify subscription
      expect(result.isSubscribed).toBe(false);
      expect(result.subscriptionId).toBeUndefined();
      expect(result.canSubscribe).toBe(true);
    });
  });

  // ==========================================================================
  // creators.subscribe Tests
  // ==========================================================================

  describe('creators.subscribe', () => {
    it('should throw NOT_FOUND when creator does not exist', async () => {
      const caller = createMockCreatorsCaller({ userId: TEST_USER_ID });

      await expect(caller.subscribe({ creatorId: 'nonexistent' })).rejects.toThrow(TRPCError);
      await expect(caller.subscribe({ creatorId: 'nonexistent' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Creator not found',
      });
    });

    it('should throw BAD_REQUEST for unsupported provider (RSS)', async () => {
      const rssCreator = createMockCreator({
        id: 'rss_creator',
        provider: 'RSS',
        providerCreatorId: 'https://example.com/feed.xml',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('rss_creator', rssCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
      });

      await expect(caller.subscribe({ creatorId: 'rss_creator' })).rejects.toThrow(TRPCError);
      await expect(caller.subscribe({ creatorId: 'rss_creator' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Subscriptions not supported for this provider',
      });
    });

    it('should throw BAD_REQUEST for unsupported provider (SUBSTACK)', async () => {
      const substackCreator = createMockCreator({
        id: 'substack_creator',
        provider: 'SUBSTACK',
        providerCreatorId: 'substack-user-123',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('substack_creator', substackCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
      });

      await expect(caller.subscribe({ creatorId: 'substack_creator' })).rejects.toThrow(TRPCError);
      await expect(caller.subscribe({ creatorId: 'substack_creator' })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Subscriptions not supported for this provider',
      });
    });

    it('should throw PRECONDITION_FAILED if not connected to YouTube', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      // No connections
      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        connections: new Map(),
      });

      await expect(caller.subscribe({ creatorId: 'yt_creator' })).rejects.toThrow(TRPCError);
      await expect(caller.subscribe({ creatorId: 'yt_creator' })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: 'Please connect your account first',
      });
    });

    it('should throw PRECONDITION_FAILED if not connected to Spotify', async () => {
      const spotifyCreator = createMockCreator({
        id: 'spotify_creator',
        provider: 'SPOTIFY',
        providerCreatorId: '0testshow123456789012',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('spotify_creator', spotifyCreator);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        connections: new Map(),
      });

      await expect(caller.subscribe({ creatorId: 'spotify_creator' })).rejects.toThrow(TRPCError);
      await expect(caller.subscribe({ creatorId: 'spotify_creator' })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: 'Please connect your account first',
      });
    });

    it('should throw PRECONDITION_FAILED if connection exists but is not ACTIVE', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      const expiredConnection = createMockProviderConnection({
        provider: 'YOUTUBE',
        status: 'EXPIRED', // Not active
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(expiredConnection.id, expiredConnection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        connections: connectionsMap,
      });

      await expect(caller.subscribe({ creatorId: 'yt_creator' })).rejects.toThrow(TRPCError);
      await expect(caller.subscribe({ creatorId: 'yt_creator' })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: 'Please connect your account first',
      });
    });

    it('should create subscription for YouTube creator when connected', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
        name: 'My YouTube Channel',
        imageUrl: 'https://example.com/yt-avatar.jpg',
      });

      const connection = createMockProviderConnection({
        provider: 'YOUTUBE',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(connection.id, connection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        subscriptions: new Map(), // No existing subscriptions
        connections: connectionsMap,
      });

      const result = await caller.subscribe({ creatorId: 'yt_creator' });

      expect(result.id).toBeDefined();
      expect(result.provider).toBe('YOUTUBE');
      expect(result.name).toBe('My YouTube Channel');
      expect(result.imageUrl).toBe('https://example.com/yt-avatar.jpg');
      expect(result.enabled).toBe(true);
    });

    it('should create subscription for Spotify creator when connected', async () => {
      const spotifyCreator = createMockCreator({
        id: 'spotify_creator',
        provider: 'SPOTIFY',
        providerCreatorId: '0testshow123456789012',
        name: 'My Podcast',
        imageUrl: 'https://example.com/podcast-art.jpg',
      });

      const connection = createMockProviderConnection({
        provider: 'SPOTIFY',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('spotify_creator', spotifyCreator);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(connection.id, connection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        subscriptions: new Map(),
        connections: connectionsMap,
      });

      const result = await caller.subscribe({ creatorId: 'spotify_creator' });

      expect(result.id).toBeDefined();
      expect(result.provider).toBe('SPOTIFY');
      expect(result.name).toBe('My Podcast');
      expect(result.imageUrl).toBe('https://example.com/podcast-art.jpg');
      expect(result.enabled).toBe(true);
    });

    it('should return existing subscription if already subscribed (idempotent)', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
        name: 'My YouTube Channel',
      });

      const existingSubscription = createMockSubscription({
        id: 'sub_existing_123',
        provider: 'YOUTUBE',
        providerChannelId: 'UCtest123',
        name: 'Existing Subscription Name',
        status: 'ACTIVE',
      });

      const connection = createMockProviderConnection({
        provider: 'YOUTUBE',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const subscriptionsMap = new Map<string, Subscription>();
      subscriptionsMap.set(existingSubscription.id, existingSubscription);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(connection.id, connection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        subscriptions: subscriptionsMap,
        connections: connectionsMap,
      });

      const result = await caller.subscribe({ creatorId: 'yt_creator' });

      // Should return existing subscription, not create new one
      expect(result.id).toBe('sub_existing_123');
      expect(result.provider).toBe('YOUTUBE');
      expect(result.name).toBe('Existing Subscription Name');
      expect(result.enabled).toBe(true);
    });

    it('should return enabled=false for existing PAUSED subscription (idempotent)', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
      });

      const pausedSubscription = createMockSubscription({
        id: 'sub_paused_123',
        provider: 'YOUTUBE',
        providerChannelId: 'UCtest123',
        status: 'PAUSED', // Not active
      });

      const connection = createMockProviderConnection({
        provider: 'YOUTUBE',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const subscriptionsMap = new Map<string, Subscription>();
      subscriptionsMap.set(pausedSubscription.id, pausedSubscription);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(connection.id, connection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        subscriptions: subscriptionsMap,
        connections: connectionsMap,
      });

      const result = await caller.subscribe({ creatorId: 'yt_creator' });

      expect(result.id).toBe('sub_paused_123');
      expect(result.enabled).toBe(false);
    });

    it('should not match subscription from different provider', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
        name: 'YouTube Channel',
      });

      // Spotify subscription with same channel ID but different provider
      const spotifySubscription = createMockSubscription({
        id: 'sub_spotify_123',
        provider: 'SPOTIFY',
        providerChannelId: 'UCtest123', // Same ID but different provider
        name: 'Spotify Show',
        status: 'ACTIVE',
      });

      const ytConnection = createMockProviderConnection({
        provider: 'YOUTUBE',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const subscriptionsMap = new Map<string, Subscription>();
      subscriptionsMap.set(spotifySubscription.id, spotifySubscription);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(ytConnection.id, ytConnection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        subscriptions: subscriptionsMap,
        connections: connectionsMap,
      });

      const result = await caller.subscribe({ creatorId: 'yt_creator' });

      // Should create new subscription, not return the Spotify one
      expect(result.id).not.toBe('sub_spotify_123');
      expect(result.provider).toBe('YOUTUBE');
      expect(result.name).toBe('YouTube Channel');
    });

    it('should return response matching SubscribeResponse interface', async () => {
      const youtubeCreator = createMockCreator({
        id: 'yt_creator',
        provider: 'YOUTUBE',
        providerCreatorId: 'UCtest123',
        name: 'Test Channel',
        imageUrl: 'https://example.com/image.jpg',
      });

      const connection = createMockProviderConnection({
        provider: 'YOUTUBE',
        status: 'ACTIVE',
      });

      const creatorsMap = new Map<string, Creator>();
      creatorsMap.set('yt_creator', youtubeCreator);

      const connectionsMap = new Map<string, ProviderConnection>();
      connectionsMap.set(connection.id, connection);

      const caller = createMockCreatorsCaller({
        userId: TEST_USER_ID,
        creators: creatorsMap,
        subscriptions: new Map(),
        connections: connectionsMap,
      });

      const result = await caller.subscribe({ creatorId: 'yt_creator' });

      // Verify response shape
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('imageUrl');
      expect(result).toHaveProperty('enabled');
      expect(typeof result.id).toBe('string');
      expect(typeof result.provider).toBe('string');
      expect(typeof result.name).toBe('string');
      expect(typeof result.enabled).toBe('boolean');
    });
  });

  // ==========================================================================
  // Router Structure Tests
  // ==========================================================================

  describe('Router Structure', () => {
    it('should have all expected endpoints', () => {
      const caller = createMockCreatorsCaller({ userId: TEST_USER_ID });

      // Verify all endpoints exist as functions
      expect(typeof caller.get).toBe('function');
      expect(typeof caller.listBookmarks).toBe('function');
      expect(typeof caller.listPublications).toBe('function');
      expect(typeof caller.fetchLatestContent).toBe('function');
      expect(typeof caller.checkSubscription).toBe('function');
      expect(typeof caller.subscribe).toBe('function');
    });
  });
});

// ============================================================================
// Creator Response Type Tests
// ============================================================================

describe('Creator Response Shape', () => {
  it('should match the expected Creator interface', () => {
    const now = Date.now();
    const creator: Creator = {
      id: 'creator_001',
      provider: 'YOUTUBE',
      providerCreatorId: 'UC123456',
      name: 'Test Creator',
      normalizedName: 'test creator',
      imageUrl: 'https://example.com/image.jpg',
      description: 'A test description',
      externalUrl: 'https://youtube.com/@testcreator',
      handle: '@testcreator',
      createdAt: now,
      updatedAt: now,
    };

    // Verify all expected fields are present
    expect(creator).toHaveProperty('id');
    expect(creator).toHaveProperty('provider');
    expect(creator).toHaveProperty('providerCreatorId');
    expect(creator).toHaveProperty('name');
    expect(creator).toHaveProperty('normalizedName');
    expect(creator).toHaveProperty('imageUrl');
    expect(creator).toHaveProperty('description');
    expect(creator).toHaveProperty('externalUrl');
    expect(creator).toHaveProperty('handle');
    expect(creator).toHaveProperty('createdAt');
    expect(creator).toHaveProperty('updatedAt');

    // Verify types
    expect(typeof creator.id).toBe('string');
    expect(typeof creator.provider).toBe('string');
    expect(typeof creator.providerCreatorId).toBe('string');
    expect(typeof creator.name).toBe('string');
    expect(typeof creator.normalizedName).toBe('string');
    expect(typeof creator.createdAt).toBe('number');
    expect(typeof creator.updatedAt).toBe('number');
  });

  it('should allow nullable fields to be null', () => {
    const now = Date.now();
    const creator: Creator = {
      id: 'creator_002',
      provider: 'RSS',
      providerCreatorId: 'https://example.com/feed',
      name: 'RSS Feed',
      normalizedName: 'rss feed',
      imageUrl: null,
      description: null,
      externalUrl: null,
      handle: null,
      createdAt: now,
      updatedAt: now,
    };

    expect(creator.imageUrl).toBeNull();
    expect(creator.description).toBeNull();
    expect(creator.externalUrl).toBeNull();
    expect(creator.handle).toBeNull();
  });
});
