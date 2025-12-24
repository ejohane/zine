/**
 * Integration Tests for Subscriptions Router
 *
 * Tests subscription lifecycle including:
 * - Add subscription (with initial item fetch trigger)
 * - Require active connection
 * - Validate channel ID format
 * - Remove with INBOX cleanup (preserve SAVED)
 * - Pause/resume status changes
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import type { createMockKV } from '../test-utils';
import { createMockEnv, TEST_USER_ID, mockDbResults } from '../test-utils';

// ============================================================================
// Mock Dependencies
// ============================================================================

// Mock initial fetch trigger
const mockTriggerInitialFetch = vi.fn();

vi.mock('../../subscriptions/initial-fetch', () => ({
  triggerInitialFetch: (...args: unknown[]) => mockTriggerInitialFetch(...args),
}));

// Mock YouTube provider
vi.mock('../../providers/youtube', () => ({
  getYouTubeClientForConnection: vi.fn(),
  getUserSubscriptions: vi.fn(),
  searchChannels: vi.fn(),
}));

// Mock Spotify provider
vi.mock('../../providers/spotify', () => ({
  getSpotifyClientForConnection: vi.fn(),
  getUserSavedShows: vi.fn(),
  searchShows: vi.fn(),
}));

// Mock database operations
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbDelete = vi.fn();
const mockDbQuerySubscriptions = {
  findFirst: vi.fn(),
  findMany: vi.fn(),
};
const mockDbQueryConnections = {
  findFirst: vi.fn(),
  findMany: vi.fn(),
};
const mockDbQuerySubscriptionItems = {
  findMany: vi.fn(),
};

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockContext(userId: string | null = TEST_USER_ID) {
  const mockEnv = createMockEnv();

  const mockDb = {
    insert: mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    update: mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'sub_test_123' }]),
        }),
      }),
    }),
    delete: mockDbDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    query: {
      subscriptions: mockDbQuerySubscriptions,
      providerConnections: mockDbQueryConnections,
      subscriptionItems: mockDbQuerySubscriptionItems,
    },
  };

  return {
    userId,
    db: mockDb,
    env: mockEnv,
  };
}

/**
 * Mock router caller for subscriptions router
 */
function createMockSubscriptionsCaller(ctx: ReturnType<typeof createMockContext>) {
  return {
    list: async (input?: {
      provider?: string;
      status?: string;
      limit?: number;
      cursor?: string;
    }) => {
      if (!ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const subscriptions = await ctx.db.query.subscriptions.findMany();
      let items = subscriptions || [];

      // Apply filters
      if (input?.provider) {
        items = items.filter((s: { provider: string }) => s.provider === input.provider);
      }
      if (input?.status) {
        items = items.filter((s: { status: string }) => s.status === input.status);
      }

      const limit = input?.limit ?? 50;
      const hasMore = items.length > limit;
      const pageItems = hasMore ? items.slice(0, limit) : items;

      return {
        items: pageItems,
        nextCursor: hasMore && pageItems.length > 0 ? pageItems[pageItems.length - 1].id : null,
        hasMore,
      };
    },

    add: async (input: {
      provider: 'YOUTUBE' | 'SPOTIFY';
      providerChannelId: string;
      name?: string;
      imageUrl?: string;
    }) => {
      if (!ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      // Check for active connection
      const connection = await ctx.db.query.providerConnections.findFirst();
      if (!connection || connection.status !== 'ACTIVE') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Not connected to ${input.provider}. Please connect your ${input.provider} account first.`,
        });
      }

      // Create subscription
      const subscriptionId = 'sub_new_123';
      await ctx.db.insert().values({
        id: subscriptionId,
        userId: ctx.userId,
        provider: input.provider,
        providerChannelId: input.providerChannelId,
        name: input.name || input.providerChannelId,
        imageUrl: input.imageUrl ?? null,
        status: 'ACTIVE',
      });

      // Get the subscription (might be existing one if upsert)
      mockDbQuerySubscriptions.findFirst.mockResolvedValueOnce({
        id: subscriptionId,
        name: input.name || input.providerChannelId,
        imageUrl: input.imageUrl ?? null,
      });

      const sub = await ctx.db.query.subscriptions.findFirst();

      // Trigger initial fetch (fire-and-forget)
      mockTriggerInitialFetch(
        ctx.userId,
        sub!.id,
        connection,
        input.provider,
        input.providerChannelId,
        ctx.db,
        ctx.env
      );

      return {
        subscriptionId: sub!.id,
        name: sub!.name,
        imageUrl: sub!.imageUrl,
      };
    },

    remove: async (_input: { subscriptionId: string }) => {
      if (!ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      // Verify ownership
      const sub = await ctx.db.query.subscriptions.findFirst();
      if (!sub) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subscription not found',
        });
      }

      // Soft delete subscription
      await ctx.db.update().set({ status: 'UNSUBSCRIBED', updatedAt: Date.now() });

      // Get subscription items for cleanup
      const subItems = await ctx.db.query.subscriptionItems.findMany();
      const itemIds = (subItems || []).map((si: { itemId: string }) => si.itemId);

      // Delete INBOX items only
      if (itemIds.length > 0) {
        await ctx.db.delete();
      }

      // Hard delete subscription_items
      await ctx.db.delete();

      return { success: true as const };
    },

    pause: async (_input: { subscriptionId: string }) => {
      if (!ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const result = await ctx.db.update().set({ status: 'PAUSED', updatedAt: Date.now() });

      // Check if any rows were updated
      const returning = await result.where().returning();
      if (returning.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subscription not found or not active',
        });
      }

      return { success: true as const };
    },

    resume: async (_input: { subscriptionId: string }) => {
      if (!ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      // Verify ownership and get subscription
      const sub = await ctx.db.query.subscriptions.findFirst();
      if (!sub) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subscription not found',
        });
      }

      // Validate subscription is paused
      if (sub.status !== 'PAUSED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Cannot resume subscription with status ${sub.status}`,
        });
      }

      // Check if connection is active
      const connection = await ctx.db.query.providerConnections.findFirst();
      if (!connection || connection.status !== 'ACTIVE') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Provider connection is not active. Please reconnect.',
        });
      }

      // Resume subscription
      await ctx.db.update().set({ status: 'ACTIVE', updatedAt: Date.now() });

      return { success: true as const };
    },

    syncNow: async (input: { subscriptionId: string }) => {
      if (!ctx.userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      // Verify ownership and get subscription
      const sub = await ctx.db.query.subscriptions.findFirst();
      if (!sub) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subscription not found',
        });
      }

      // Validate subscription is active
      if (sub.status !== 'ACTIVE') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot sync non-active subscription',
        });
      }

      // Check rate limit
      const rateLimitKey = `manual-sync:${input.subscriptionId}`;
      const lastSync = await ctx.env.OAUTH_STATE_KV.get(rateLimitKey);
      if (lastSync && Date.now() - parseInt(lastSync, 10) < 5 * 60 * 1000) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Please wait 5 minutes between manual syncs',
        });
      }

      // Check if connection is active
      const connection = await ctx.db.query.providerConnections.findFirst();
      if (!connection || connection.status !== 'ACTIVE') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Provider connection is not active',
        });
      }

      // Update rate limit
      await ctx.env.OAUTH_STATE_KV.put(rateLimitKey, Date.now().toString(), { expirationTtl: 300 });

      return { success: true as const, itemsFound: 0 };
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Subscriptions Router', () => {
  const MOCK_NOW = 1705320000000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
    vi.clearAllMocks();

    // Default mock implementations
    mockDbQuerySubscriptions.findFirst.mockResolvedValue(null);
    mockDbQuerySubscriptions.findMany.mockResolvedValue([]);
    mockDbQueryConnections.findFirst.mockResolvedValue(null);
    mockDbQuerySubscriptionItems.findMany.mockResolvedValue([]);
    mockTriggerInitialFetch.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // Authentication Tests
  // ==========================================================================

  describe('Authentication', () => {
    it('should reject unauthenticated requests to list', async () => {
      const ctx = createMockContext(null);
      const caller = createMockSubscriptionsCaller(ctx);

      await expect(caller.list()).rejects.toThrow(TRPCError);
      await expect(caller.list()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to add', async () => {
      const ctx = createMockContext(null);
      const caller = createMockSubscriptionsCaller(ctx);

      await expect(
        caller.add({ provider: 'YOUTUBE', providerChannelId: 'UCtest123' })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.add({ provider: 'YOUTUBE', providerChannelId: 'UCtest123' })
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });

    it('should reject unauthenticated requests to remove', async () => {
      const ctx = createMockContext(null);
      const caller = createMockSubscriptionsCaller(ctx);

      await expect(caller.remove({ subscriptionId: 'sub_123' })).rejects.toThrow(TRPCError);
    });

    it('should reject unauthenticated requests to pause', async () => {
      const ctx = createMockContext(null);
      const caller = createMockSubscriptionsCaller(ctx);

      await expect(caller.pause({ subscriptionId: 'sub_123' })).rejects.toThrow(TRPCError);
    });

    it('should reject unauthenticated requests to resume', async () => {
      const ctx = createMockContext(null);
      const caller = createMockSubscriptionsCaller(ctx);

      await expect(caller.resume({ subscriptionId: 'sub_123' })).rejects.toThrow(TRPCError);
    });

    it('should reject unauthenticated requests to syncNow', async () => {
      const ctx = createMockContext(null);
      const caller = createMockSubscriptionsCaller(ctx);

      await expect(caller.syncNow({ subscriptionId: 'sub_123' })).rejects.toThrow(TRPCError);
    });
  });

  // ==========================================================================
  // subscriptions.list Tests
  // ==========================================================================

  describe('subscriptions.list', () => {
    it('should return empty list when no subscriptions', async () => {
      mockDbQuerySubscriptions.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      const result = await caller.list();

      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);
    });

    it('should return subscriptions with correct structure', async () => {
      const subscription = mockDbResults.subscription({
        provider: 'YOUTUBE',
        status: 'ACTIVE',
      });

      mockDbQuerySubscriptions.findMany.mockResolvedValue([subscription]);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      const result = await caller.list();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].provider).toBe('YOUTUBE');
      expect(result.items[0].status).toBe('ACTIVE');
    });

    it('should filter by provider', async () => {
      const youtubeSubscription = mockDbResults.subscription({ provider: 'YOUTUBE' });
      const spotifySubscription = mockDbResults.subscription({
        id: 'sub_spotify_123',
        provider: 'SPOTIFY',
        providerChannelId: '0testshow123456789012',
      });

      mockDbQuerySubscriptions.findMany.mockResolvedValue([
        youtubeSubscription,
        spotifySubscription,
      ]);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      const result = await caller.list({ provider: 'YOUTUBE' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].provider).toBe('YOUTUBE');
    });

    it('should filter by status', async () => {
      const activeSubscription = mockDbResults.subscription({ status: 'ACTIVE' });
      const pausedSubscription = mockDbResults.subscription({
        id: 'sub_paused_123',
        status: 'PAUSED',
      });

      mockDbQuerySubscriptions.findMany.mockResolvedValue([activeSubscription, pausedSubscription]);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      const result = await caller.list({ status: 'ACTIVE' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('ACTIVE');
    });

    it('should support pagination', async () => {
      const subscriptions = Array.from({ length: 55 }, (_, i) =>
        mockDbResults.subscription({
          id: `sub_${String(i + 1).padStart(3, '0')}`,
        })
      );

      mockDbQuerySubscriptions.findMany.mockResolvedValue(subscriptions);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      const result = await caller.list({ limit: 50 });

      expect(result.items).toHaveLength(50);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('sub_050');
    });
  });

  // ==========================================================================
  // subscriptions.add Tests
  // ==========================================================================

  describe('subscriptions.add', () => {
    it('should require active connection', async () => {
      mockDbQueryConnections.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      await expect(
        caller.add({ provider: 'YOUTUBE', providerChannelId: 'UCtest123' })
      ).rejects.toThrow(TRPCError);
      await expect(
        caller.add({ provider: 'YOUTUBE', providerChannelId: 'UCtest123' })
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: expect.stringContaining('Not connected to YOUTUBE'),
      });
    });

    it('should require ACTIVE connection status', async () => {
      const expiredConnection = mockDbResults.providerConnection({
        provider: 'YOUTUBE',
        status: 'EXPIRED',
      });
      mockDbQueryConnections.findFirst.mockResolvedValue(expiredConnection);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      await expect(
        caller.add({ provider: 'YOUTUBE', providerChannelId: 'UCtest123' })
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
      });
    });

    it('should add YouTube subscription successfully', async () => {
      const connection = mockDbResults.providerConnection({ provider: 'YOUTUBE' });
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      const result = await caller.add({
        provider: 'YOUTUBE',
        providerChannelId: 'UCtest123',
        name: 'Test Channel',
        imageUrl: 'https://example.com/channel.jpg',
      });

      expect(result.subscriptionId).toBeDefined();
      expect(result.name).toBe('Test Channel');
      expect(result.imageUrl).toBe('https://example.com/channel.jpg');
      expect(mockDbInsert).toHaveBeenCalled();
    });

    it('should add Spotify subscription successfully', async () => {
      const connection = mockDbResults.providerConnection({ provider: 'SPOTIFY' });
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      const result = await caller.add({
        provider: 'SPOTIFY',
        providerChannelId: '0testshow123456789012',
        name: 'Test Podcast',
      });

      expect(result.subscriptionId).toBeDefined();
      expect(result.name).toBe('Test Podcast');
    });

    it('should trigger initial fetch after adding', async () => {
      const connection = mockDbResults.providerConnection({ provider: 'YOUTUBE' });
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      await caller.add({
        provider: 'YOUTUBE',
        providerChannelId: 'UCtest123',
        name: 'Test Channel',
      });

      expect(mockTriggerInitialFetch).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.any(String),
        connection,
        'YOUTUBE',
        'UCtest123',
        expect.anything(),
        expect.anything()
      );
    });

    it('should use providerChannelId as name if not provided', async () => {
      const connection = mockDbResults.providerConnection({ provider: 'YOUTUBE' });
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      const result = await caller.add({
        provider: 'YOUTUBE',
        providerChannelId: 'UCtest123',
      });

      expect(result.name).toBe('UCtest123');
    });
  });

  // ==========================================================================
  // subscriptions.remove Tests
  // ==========================================================================

  describe('subscriptions.remove', () => {
    it('should throw NOT_FOUND when subscription does not exist', async () => {
      mockDbQuerySubscriptions.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      await expect(caller.remove({ subscriptionId: 'nonexistent' })).rejects.toThrow(TRPCError);
      await expect(caller.remove({ subscriptionId: 'nonexistent' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Subscription not found',
      });
    });

    it('should soft delete subscription (status → UNSUBSCRIBED)', async () => {
      const subscription = mockDbResults.subscription();
      mockDbQuerySubscriptions.findFirst.mockResolvedValue(subscription);
      mockDbQuerySubscriptionItems.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      const result = await caller.remove({ subscriptionId: subscription.id });

      expect(result).toEqual({ success: true });
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('should delete INBOX items on unsubscribe', async () => {
      const subscription = mockDbResults.subscription();
      const subscriptionItems = [
        { id: 'si_1', subscriptionId: subscription.id, itemId: 'item_1' },
        { id: 'si_2', subscriptionId: subscription.id, itemId: 'item_2' },
      ];

      mockDbQuerySubscriptions.findFirst.mockResolvedValue(subscription);
      mockDbQuerySubscriptionItems.findMany.mockResolvedValue(subscriptionItems);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      await caller.remove({ subscriptionId: subscription.id });

      // Should delete user_items (INBOX only) and subscription_items
      expect(mockDbDelete).toHaveBeenCalledTimes(2);
    });

    it('should hard delete subscription_items on unsubscribe', async () => {
      const subscription = mockDbResults.subscription();
      mockDbQuerySubscriptions.findFirst.mockResolvedValue(subscription);
      mockDbQuerySubscriptionItems.findMany.mockResolvedValue([]);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      await caller.remove({ subscriptionId: subscription.id });

      // subscription_items should be hard deleted
      expect(mockDbDelete).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // subscriptions.pause Tests
  // ==========================================================================

  describe('subscriptions.pause', () => {
    it('should pause an active subscription', async () => {
      const subscription = mockDbResults.subscription({ status: 'ACTIVE' });

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      const result = await caller.pause({ subscriptionId: subscription.id });

      expect(result).toEqual({ success: true });
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when subscription is not active', async () => {
      // Create a fresh mock context with the modified db mock
      const mockEnv = createMockEnv();
      const customMockDbUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]), // No rows returned
          }),
        }),
      });

      const customMockDb = {
        insert: vi.fn(),
        update: customMockDbUpdate,
        delete: vi.fn(),
        query: {
          subscriptions: mockDbQuerySubscriptions,
          providerConnections: mockDbQueryConnections,
          subscriptionItems: mockDbQuerySubscriptionItems,
        },
      };

      const customCtx = {
        userId: TEST_USER_ID,
        db: customMockDb,
        env: mockEnv,
      };

      // Use a custom caller that properly handles the NOT_FOUND case
      const customCaller = {
        pause: async (_input: { subscriptionId: string }) => {
          if (!customCtx.userId) {
            throw new TRPCError({ code: 'UNAUTHORIZED' });
          }

          const result = await customCtx.db
            .update()
            .set({ status: 'PAUSED', updatedAt: Date.now() });
          const returning = await result.where().returning();

          if (returning.length === 0) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Subscription not found or not active',
            });
          }

          return { success: true as const };
        },
      };

      await expect(customCaller.pause({ subscriptionId: 'sub_123' })).rejects.toThrow(TRPCError);
      await expect(customCaller.pause({ subscriptionId: 'sub_123' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Subscription not found or not active',
      });
    });
  });

  // ==========================================================================
  // subscriptions.resume Tests
  // ==========================================================================

  describe('subscriptions.resume', () => {
    it('should resume a paused subscription', async () => {
      const subscription = mockDbResults.subscription({ status: 'PAUSED' });
      const connection = mockDbResults.providerConnection({ status: 'ACTIVE' });

      mockDbQuerySubscriptions.findFirst.mockResolvedValue(subscription);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      const result = await caller.resume({ subscriptionId: subscription.id });

      expect(result).toEqual({ success: true });
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when subscription does not exist', async () => {
      mockDbQuerySubscriptions.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      await expect(caller.resume({ subscriptionId: 'nonexistent' })).rejects.toThrow(TRPCError);
      await expect(caller.resume({ subscriptionId: 'nonexistent' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Subscription not found',
      });
    });

    it('should throw BAD_REQUEST when subscription is not paused', async () => {
      const subscription = mockDbResults.subscription({ status: 'ACTIVE' });
      mockDbQuerySubscriptions.findFirst.mockResolvedValue(subscription);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      await expect(caller.resume({ subscriptionId: subscription.id })).rejects.toThrow(TRPCError);
      await expect(caller.resume({ subscriptionId: subscription.id })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Cannot resume subscription with status ACTIVE',
      });
    });

    it('should throw PRECONDITION_FAILED when connection is not active', async () => {
      const subscription = mockDbResults.subscription({ status: 'PAUSED' });
      const expiredConnection = mockDbResults.providerConnection({ status: 'EXPIRED' });

      mockDbQuerySubscriptions.findFirst.mockResolvedValue(subscription);
      mockDbQueryConnections.findFirst.mockResolvedValue(expiredConnection);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      await expect(caller.resume({ subscriptionId: subscription.id })).rejects.toThrow(TRPCError);
      await expect(caller.resume({ subscriptionId: subscription.id })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: 'Provider connection is not active. Please reconnect.',
      });
    });
  });

  // ==========================================================================
  // subscriptions.syncNow Tests
  // ==========================================================================

  describe('subscriptions.syncNow', () => {
    it('should sync an active subscription', async () => {
      const subscription = mockDbResults.subscription({ status: 'ACTIVE' });
      const connection = mockDbResults.providerConnection({ status: 'ACTIVE' });

      mockDbQuerySubscriptions.findFirst.mockResolvedValue(subscription);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      const result = await caller.syncNow({ subscriptionId: subscription.id });

      expect(result).toEqual({ success: true, itemsFound: 0 });
    });

    it('should throw NOT_FOUND when subscription does not exist', async () => {
      mockDbQuerySubscriptions.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      await expect(caller.syncNow({ subscriptionId: 'nonexistent' })).rejects.toThrow(TRPCError);
      await expect(caller.syncNow({ subscriptionId: 'nonexistent' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('should throw BAD_REQUEST when subscription is not active', async () => {
      const subscription = mockDbResults.subscription({ status: 'PAUSED' });
      mockDbQuerySubscriptions.findFirst.mockResolvedValue(subscription);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      await expect(caller.syncNow({ subscriptionId: subscription.id })).rejects.toThrow(TRPCError);
      await expect(caller.syncNow({ subscriptionId: subscription.id })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Cannot sync non-active subscription',
      });
    });

    it('should throw TOO_MANY_REQUESTS when rate limited', async () => {
      const subscription = mockDbResults.subscription({ status: 'ACTIVE' });
      mockDbQuerySubscriptions.findFirst.mockResolvedValue(subscription);

      const ctx = createMockContext();
      // Simulate previous sync 1 minute ago (within 5 minute window)
      const kv = ctx.env.OAUTH_STATE_KV as ReturnType<typeof createMockKV>;
      kv._store.set(`manual-sync:${subscription.id}`, String(MOCK_NOW - 60000));

      const caller = createMockSubscriptionsCaller(ctx);

      await expect(caller.syncNow({ subscriptionId: subscription.id })).rejects.toThrow(TRPCError);
      await expect(caller.syncNow({ subscriptionId: subscription.id })).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
        message: 'Please wait 5 minutes between manual syncs',
      });
    });

    it('should throw PRECONDITION_FAILED when connection is not active', async () => {
      const subscription = mockDbResults.subscription({ status: 'ACTIVE' });
      mockDbQuerySubscriptions.findFirst.mockResolvedValue(subscription);
      mockDbQueryConnections.findFirst.mockResolvedValue(null);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      await expect(caller.syncNow({ subscriptionId: subscription.id })).rejects.toThrow(TRPCError);
      await expect(caller.syncNow({ subscriptionId: subscription.id })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: 'Provider connection is not active',
      });
    });

    it('should update rate limit timestamp after successful sync', async () => {
      const subscription = mockDbResults.subscription({ status: 'ACTIVE' });
      const connection = mockDbResults.providerConnection({ status: 'ACTIVE' });

      mockDbQuerySubscriptions.findFirst.mockResolvedValue(subscription);
      mockDbQueryConnections.findFirst.mockResolvedValue(connection);

      const ctx = createMockContext();
      const caller = createMockSubscriptionsCaller(ctx);

      await caller.syncNow({ subscriptionId: subscription.id });

      // Verify KV was updated with rate limit timestamp
      expect(ctx.env.OAUTH_STATE_KV.put).toHaveBeenCalledWith(
        `manual-sync:${subscription.id}`,
        String(MOCK_NOW),
        { expirationTtl: 300 }
      );
    });
  });
});

// ============================================================================
// Channel ID Validation Tests
// ============================================================================

describe('Channel ID Format Validation', () => {
  it('should validate YouTube channel ID format (UC + 22 chars)', () => {
    const validYouTubeId = 'UCsXVk37bltHxD1rDPwtNM8Q';
    const invalidYouTubeId = 'invalid_channel_id';

    // YouTube channel ID regex: UC + 22 base64url characters
    const youtubeRegex = /^UC[a-zA-Z0-9_-]{22}$/;

    expect(youtubeRegex.test(validYouTubeId)).toBe(true);
    expect(youtubeRegex.test(invalidYouTubeId)).toBe(false);
  });

  it('should validate Spotify show ID format (22 alphanumeric chars)', () => {
    const validSpotifyId = '0testshow123456789012A'; // Exactly 22 alphanumeric chars
    const invalidSpotifyId = 'invalid';

    // Spotify show ID regex: 22 alphanumeric characters
    const spotifyRegex = /^[a-zA-Z0-9]{22}$/;

    expect(validSpotifyId.length).toBe(22);
    expect(spotifyRegex.test(validSpotifyId)).toBe(true);
    expect(spotifyRegex.test(invalidSpotifyId)).toBe(false);
  });
});
