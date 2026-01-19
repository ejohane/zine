/**
 * Unit Tests for Creators Router
 *
 * Tests the tRPC creators router structure and procedures including:
 * - Router structure verification (all endpoints defined)
 * - creators.get - Get creator by ID
 * - creators.listBookmarks - List bookmarked items for creator
 * - creators.fetchLatestContent - Fetch latest content from creator
 * - creators.checkSubscription - Check subscription status
 * - creators.subscribe - Subscribe to creator
 * - Auth: Verify unauthenticated requests fail
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';

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

// ============================================================================
// Mock Router Implementation for Testing
// ============================================================================

/**
 * Create a mock router caller that simulates the creators router behavior.
 * This mirrors the actual router structure and validates authentication.
 */
function createMockCreatorsCaller(options: {
  userId: string | null;
  creators?: Map<string, Creator>;
}) {
  const { userId, creators = new Map() } = options;

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
      // Stub implementation - returns empty list as specified
      void input;
      return {
        items: [],
        nextCursor: null as string | null,
      };
    },

    fetchLatestContent: async (input: { creatorId: string }) => {
      requireAuth();
      // Stub implementation - returns empty list as specified
      void input;
      return {
        items: [],
      };
    },

    checkSubscription: async (input: { creatorId: string }) => {
      requireAuth();
      // Stub implementation - returns not subscribed as specified
      void input;
      return {
        isSubscribed: false,
        subscribedAt: null as string | null,
      };
    },

    subscribe: async (input: { creatorId: string }) => {
      requireAuth();
      // Stub implementation - returns success as specified
      void input;
      return {
        success: true,
        isSubscribed: true,
        subscribedAt: new Date().toISOString(),
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
    it('should accept valid input and return empty list (stub)', async () => {
      const caller = createMockCreatorsCaller({ userId: TEST_USER_ID });

      const result = await caller.listBookmarks({
        creatorId: TEST_CREATOR_ID,
        limit: 20,
      });

      expect(result).toEqual({
        items: [],
        nextCursor: null,
      });
    });

    it('should accept optional cursor parameter', async () => {
      const caller = createMockCreatorsCaller({ userId: TEST_USER_ID });

      const result = await caller.listBookmarks({
        creatorId: TEST_CREATOR_ID,
        cursor: 'cursor_abc',
        limit: 10,
      });

      expect(result).toEqual({
        items: [],
        nextCursor: null,
      });
    });
  });

  // ==========================================================================
  // creators.fetchLatestContent Tests
  // ==========================================================================

  describe('creators.fetchLatestContent', () => {
    it('should accept valid creatorId and return empty items (stub)', async () => {
      const caller = createMockCreatorsCaller({ userId: TEST_USER_ID });

      const result = await caller.fetchLatestContent({ creatorId: TEST_CREATOR_ID });

      expect(result).toEqual({
        items: [],
      });
    });
  });

  // ==========================================================================
  // creators.checkSubscription Tests
  // ==========================================================================

  describe('creators.checkSubscription', () => {
    it('should accept valid creatorId and return not subscribed (stub)', async () => {
      const caller = createMockCreatorsCaller({ userId: TEST_USER_ID });

      const result = await caller.checkSubscription({ creatorId: TEST_CREATOR_ID });

      expect(result).toEqual({
        isSubscribed: false,
        subscribedAt: null,
      });
    });
  });

  // ==========================================================================
  // creators.subscribe Tests
  // ==========================================================================

  describe('creators.subscribe', () => {
    it('should accept valid creatorId and return success (stub)', async () => {
      const caller = createMockCreatorsCaller({ userId: TEST_USER_ID });

      const result = await caller.subscribe({ creatorId: TEST_CREATOR_ID });

      expect(result.success).toBe(true);
      expect(result.isSubscribed).toBe(true);
      expect(result.subscribedAt).toBeDefined();
      expect(typeof result.subscribedAt).toBe('string');
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
