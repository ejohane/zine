/**
 * Unit Tests for Sync Queue Consumer
 *
 * Tests for the queue consumer that processes sync messages including:
 * - handleSyncQueue: batch processing, message grouping, validation
 * - Provider message processing (YouTube, Spotify)
 * - Error handling and progress updates
 * - Connection validation
 *
 * @see zine-oy9z: Task: Write E2E test for async pull-to-refresh flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSyncQueue } from './consumer';
import type { SyncQueueMessage } from './types';

// ============================================================================
// Mocks
// ============================================================================

// Mock drizzle
vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => mockDb),
}));

// Mock updateJobProgress
const mockUpdateJobProgress = vi.fn();
vi.mock('./service', () => ({
  updateJobProgress: (
    jobId: string,
    subscriptionId: string,
    success: boolean,
    itemsFound: number,
    error: string | null,
    kv: unknown
  ) => mockUpdateJobProgress(jobId, subscriptionId, success, itemsFound, error, kv),
}));

// Mock YouTube client and poller
const mockGetYouTubeClient = vi.fn();
const mockPollSingleYouTube = vi.fn();
const mockPollYouTubeBatched = vi.fn();

vi.mock('../providers/youtube', () => ({
  getYouTubeClientForConnection: (connection: unknown, env: unknown) =>
    mockGetYouTubeClient(connection, env),
}));

vi.mock('../polling/youtube-poller', () => ({
  pollSingleYouTubeSubscription: (
    sub: unknown,
    client: unknown,
    userId: string,
    env: unknown,
    db: unknown
  ) => mockPollSingleYouTube(sub, client, userId, env, db),
  pollYouTubeSubscriptionsBatched: (
    subs: unknown[],
    client: unknown,
    userId: string,
    env: unknown,
    db: unknown
  ) => mockPollYouTubeBatched(subs, client, userId, env, db),
}));

// Mock Spotify client and poller
const mockGetSpotifyClient = vi.fn();
const mockPollSingleSpotify = vi.fn();
const mockPollSpotifyBatched = vi.fn();

vi.mock('../providers/spotify', () => ({
  getSpotifyClientForConnection: (connection: unknown, env: unknown) =>
    mockGetSpotifyClient(connection, env),
}));

vi.mock('../polling/spotify-poller', () => ({
  pollSingleSpotifySubscription: (
    sub: unknown,
    client: unknown,
    userId: string,
    env: unknown,
    db: unknown
  ) => mockPollSingleSpotify(sub, client, userId, env, db),
  pollSpotifySubscriptionsBatched: (
    subs: unknown[],
    client: unknown,
    userId: string,
    env: unknown,
    db: unknown
  ) => mockPollSpotifyBatched(subs, client, userId, env, db),
}));

// Mock logger
vi.mock('../lib/logger', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// ============================================================================
// Mock Database
// ============================================================================

let mockDb: {
  query: {
    providerConnections: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    subscriptions: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };
};

function createMockDb(overrides?: {
  connections?: Array<{
    id: string;
    userId: string;
    provider: string;
    status: string;
  }>;
  subscriptions?: Array<{
    id: string;
    userId: string;
    provider: string;
    providerChannelId: string;
    status: string;
  }>;
}) {
  const connections = overrides?.connections ?? [];
  const subscriptions = overrides?.subscriptions ?? [];

  return {
    query: {
      providerConnections: {
        findFirst: vi.fn(async () => connections.find((c) => c.status === 'ACTIVE') ?? null),
      },
      subscriptions: {
        findMany: vi.fn(async () => subscriptions.filter((s) => s.status === 'ACTIVE')),
      },
    },
  };
}

// ============================================================================
// Mock Environment
// ============================================================================

function createMockEnv() {
  return {
    DB: {},
    OAUTH_STATE_KV: {},
    ENCRYPTION_KEY: 'test-key',
    SPOTIFY_CLIENT_ID: 'test-client-id',
    SPOTIFY_CLIENT_SECRET: 'test-client-secret',
  };
}

// ============================================================================
// Mock Message Batch
// ============================================================================

function createMockMessage(body: SyncQueueMessage): Message<SyncQueueMessage> {
  return {
    id: `msg_${body.subscriptionId}`,
    timestamp: new Date(),
    body,
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function createMockBatch(messages: Message<SyncQueueMessage>[]): MessageBatch<SyncQueueMessage> {
  return {
    queue: 'zine-sync-queue-dev',
    messages,
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  };
}

// ============================================================================
// Test Constants
// ============================================================================

const TEST_USER_ID = 'user_test_123';
const TEST_JOB_ID = '01HQXYZ123456789ABCDEFGHIJ';
const MOCK_NOW = 1705320000000;

// ============================================================================
// Tests
// ============================================================================

describe('handleSyncQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
    mockGetYouTubeClient.mockResolvedValue({ accessToken: 'yt-token' });
    mockGetSpotifyClient.mockResolvedValue({ accessToken: 'sp-token' });
    mockPollSingleYouTube.mockResolvedValue({ newItems: 5 });
    mockPollSingleSpotify.mockResolvedValue({ newItems: 3 });
    mockPollYouTubeBatched.mockResolvedValue({ processed: 2, newItems: 10, errors: [] });
    mockPollSpotifyBatched.mockResolvedValue({ processed: 2, newItems: 6, errors: [] });
  });

  describe('message validation', () => {
    it('should ack invalid messages without retry', async () => {
      const invalidMessage = {
        id: 'msg_invalid',
        timestamp: new Date(),
        body: { invalid: 'message' } as unknown as SyncQueueMessage,
        attempts: 1,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = createMockBatch([invalidMessage]);
      const env = createMockEnv();

      await handleSyncQueue(batch, env as never);

      expect(invalidMessage.ack).toHaveBeenCalled();
      expect(invalidMessage.retry).not.toHaveBeenCalled();
    });

    it('should process valid messages', async () => {
      mockDb = createMockDb({
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
        ],
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC123',
            status: 'ACTIVE',
          },
        ],
      });

      const message = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'YOUTUBE',
        providerChannelId: 'UC123',
        enqueuedAt: MOCK_NOW,
      });

      const batch = createMockBatch([message]);
      const env = createMockEnv();

      await handleSyncQueue(batch, env as never);

      expect(message.ack).toHaveBeenCalled();
      expect(mockUpdateJobProgress).toHaveBeenCalled();
    });
  });

  describe('message grouping', () => {
    it('should group messages by job and user', async () => {
      mockDb = createMockDb({
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
        ],
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC123',
            status: 'ACTIVE',
          },
          {
            id: 'sub_2',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC456',
            status: 'ACTIVE',
          },
        ],
      });

      const message1 = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'YOUTUBE',
        providerChannelId: 'UC123',
        enqueuedAt: MOCK_NOW,
      });

      const message2 = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_2',
        provider: 'YOUTUBE',
        providerChannelId: 'UC456',
        enqueuedAt: MOCK_NOW,
      });

      const batch = createMockBatch([message1, message2]);
      const env = createMockEnv();

      await handleSyncQueue(batch, env as never);

      // Both messages should be processed (batched for same user/provider)
      expect(message1.ack).toHaveBeenCalled();
      expect(message2.ack).toHaveBeenCalled();

      // Should use batched polling for multiple subscriptions
      expect(mockPollYouTubeBatched).toHaveBeenCalled();
    });
  });

  describe('no connection handling', () => {
    it('should mark messages as failed when no active connection', async () => {
      mockDb = createMockDb({
        connections: [], // No connections
        subscriptions: [],
      });

      const message = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'YOUTUBE',
        providerChannelId: 'UC123',
        enqueuedAt: MOCK_NOW,
      });

      const batch = createMockBatch([message]);
      const env = createMockEnv();

      await handleSyncQueue(batch, env as never);

      // Should update progress as failed
      expect(mockUpdateJobProgress).toHaveBeenCalledWith(
        TEST_JOB_ID,
        'sub_1',
        false,
        0,
        'YOUTUBE not connected',
        expect.anything()
      );

      // Should ack (don't retry - connection won't appear)
      expect(message.ack).toHaveBeenCalled();
    });
  });

  describe('no subscriptions found', () => {
    it('should mark messages as succeeded when subscription not found', async () => {
      mockDb = createMockDb({
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
        ],
        subscriptions: [], // Subscription was removed
      });

      const message = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'YOUTUBE',
        providerChannelId: 'UC123',
        enqueuedAt: MOCK_NOW,
      });

      const batch = createMockBatch([message]);
      const env = createMockEnv();

      await handleSyncQueue(batch, env as never);

      // Should update progress as success (subscription removed, nothing to do)
      expect(mockUpdateJobProgress).toHaveBeenCalledWith(
        TEST_JOB_ID,
        'sub_1',
        true,
        0,
        null,
        expect.anything()
      );

      expect(message.ack).toHaveBeenCalled();
    });
  });

  describe('YouTube processing', () => {
    it('should process single YouTube subscription', async () => {
      mockDb = createMockDb({
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
        ],
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC123',
            status: 'ACTIVE',
          },
        ],
      });

      mockPollSingleYouTube.mockResolvedValue({ newItems: 7 });

      const message = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'YOUTUBE',
        providerChannelId: 'UC123',
        enqueuedAt: MOCK_NOW,
      });

      const batch = createMockBatch([message]);
      const env = createMockEnv();

      await handleSyncQueue(batch, env as never);

      expect(mockPollSingleYouTube).toHaveBeenCalled();
      expect(mockUpdateJobProgress).toHaveBeenCalledWith(
        TEST_JOB_ID,
        'sub_1',
        true,
        7,
        null,
        expect.anything()
      );
      expect(message.ack).toHaveBeenCalled();
    });

    it('should batch process multiple YouTube subscriptions', async () => {
      mockDb = createMockDb({
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
        ],
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC123',
            status: 'ACTIVE',
          },
          {
            id: 'sub_2',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC456',
            status: 'ACTIVE',
          },
        ],
      });

      mockPollYouTubeBatched.mockResolvedValue({
        processed: 2,
        newItems: 12,
        errors: [],
      });

      const message1 = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'YOUTUBE',
        providerChannelId: 'UC123',
        enqueuedAt: MOCK_NOW,
      });

      const message2 = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_2',
        provider: 'YOUTUBE',
        providerChannelId: 'UC456',
        enqueuedAt: MOCK_NOW,
      });

      const batch = createMockBatch([message1, message2]);
      const env = createMockEnv();

      await handleSyncQueue(batch, env as never);

      expect(mockPollYouTubeBatched).toHaveBeenCalled();
      expect(mockPollSingleYouTube).not.toHaveBeenCalled();

      // Both messages should be acked
      expect(message1.ack).toHaveBeenCalled();
      expect(message2.ack).toHaveBeenCalled();
    });

    it('should handle YouTube polling error', async () => {
      mockDb = createMockDb({
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
        ],
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC123',
            status: 'ACTIVE',
          },
        ],
      });

      mockPollSingleYouTube.mockRejectedValue(new Error('API quota exceeded'));

      const message = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'YOUTUBE',
        providerChannelId: 'UC123',
        enqueuedAt: MOCK_NOW,
      });

      const batch = createMockBatch([message]);
      const env = createMockEnv();

      await handleSyncQueue(batch, env as never);

      expect(mockUpdateJobProgress).toHaveBeenCalledWith(
        TEST_JOB_ID,
        'sub_1',
        false,
        0,
        'API quota exceeded',
        expect.anything()
      );

      // Should ack to prevent infinite retries
      expect(message.ack).toHaveBeenCalled();
    });
  });

  describe('Spotify processing', () => {
    it('should process single Spotify subscription', async () => {
      mockDb = createMockDb({
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'SPOTIFY', status: 'ACTIVE' },
        ],
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'SPOTIFY',
            providerChannelId: 'show123',
            status: 'ACTIVE',
          },
        ],
      });

      mockPollSingleSpotify.mockResolvedValue({ newItems: 4 });

      const message = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'SPOTIFY',
        providerChannelId: 'show123',
        enqueuedAt: MOCK_NOW,
      });

      const batch = createMockBatch([message]);
      const env = createMockEnv();

      await handleSyncQueue(batch, env as never);

      expect(mockPollSingleSpotify).toHaveBeenCalled();
      expect(mockUpdateJobProgress).toHaveBeenCalledWith(
        TEST_JOB_ID,
        'sub_1',
        true,
        4,
        null,
        expect.anything()
      );
      expect(message.ack).toHaveBeenCalled();
    });

    it('should batch process multiple Spotify subscriptions', async () => {
      mockDb = createMockDb({
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'SPOTIFY', status: 'ACTIVE' },
        ],
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'SPOTIFY',
            providerChannelId: 'show123',
            status: 'ACTIVE',
          },
          {
            id: 'sub_2',
            userId: TEST_USER_ID,
            provider: 'SPOTIFY',
            providerChannelId: 'show456',
            status: 'ACTIVE',
          },
        ],
      });

      mockPollSpotifyBatched.mockResolvedValue({
        processed: 2,
        newItems: 8,
        errors: [],
      });

      const message1 = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'SPOTIFY',
        providerChannelId: 'show123',
        enqueuedAt: MOCK_NOW,
      });

      const message2 = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_2',
        provider: 'SPOTIFY',
        providerChannelId: 'show456',
        enqueuedAt: MOCK_NOW,
      });

      const batch = createMockBatch([message1, message2]);
      const env = createMockEnv();

      await handleSyncQueue(batch, env as never);

      expect(mockPollSpotifyBatched).toHaveBeenCalled();
      expect(mockPollSingleSpotify).not.toHaveBeenCalled();
    });

    it('should handle Spotify polling error', async () => {
      mockDb = createMockDb({
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'SPOTIFY', status: 'ACTIVE' },
        ],
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'SPOTIFY',
            providerChannelId: 'show123',
            status: 'ACTIVE',
          },
        ],
      });

      mockPollSingleSpotify.mockRejectedValue(new Error('Token expired'));

      const message = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'SPOTIFY',
        providerChannelId: 'show123',
        enqueuedAt: MOCK_NOW,
      });

      const batch = createMockBatch([message]);
      const env = createMockEnv();

      await handleSyncQueue(batch, env as never);

      expect(mockUpdateJobProgress).toHaveBeenCalledWith(
        TEST_JOB_ID,
        'sub_1',
        false,
        0,
        'Token expired',
        expect.anything()
      );

      expect(message.ack).toHaveBeenCalled();
    });
  });

  describe('mixed provider processing', () => {
    it('should process YouTube and Spotify subscriptions separately', async () => {
      mockDb = createMockDb({
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
          { id: 'conn_2', userId: TEST_USER_ID, provider: 'SPOTIFY', status: 'ACTIVE' },
        ],
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC123',
            status: 'ACTIVE',
          },
          {
            id: 'sub_2',
            userId: TEST_USER_ID,
            provider: 'SPOTIFY',
            providerChannelId: 'show123',
            status: 'ACTIVE',
          },
        ],
      });

      const ytMessage = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'YOUTUBE',
        providerChannelId: 'UC123',
        enqueuedAt: MOCK_NOW,
      });

      const spMessage = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_2',
        provider: 'SPOTIFY',
        providerChannelId: 'show123',
        enqueuedAt: MOCK_NOW,
      });

      const batch = createMockBatch([ytMessage, spMessage]);
      const env = createMockEnv();

      await handleSyncQueue(batch, env as never);

      // Both single pollers should be called (one sub each)
      expect(mockPollSingleYouTube).toHaveBeenCalled();
      expect(mockPollSingleSpotify).toHaveBeenCalled();

      expect(ytMessage.ack).toHaveBeenCalled();
      expect(spMessage.ack).toHaveBeenCalled();
    });
  });

  describe('batched error handling', () => {
    it('should handle partial failures in batched polling', async () => {
      mockDb = createMockDb({
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
        ],
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC123',
            status: 'ACTIVE',
          },
          {
            id: 'sub_2',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC456',
            status: 'ACTIVE',
          },
        ],
      });

      mockPollYouTubeBatched.mockResolvedValue({
        processed: 2,
        newItems: 5,
        errors: [{ subscriptionId: 'sub_2', error: 'Channel not found' }],
      });

      const message1 = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'YOUTUBE',
        providerChannelId: 'UC123',
        enqueuedAt: MOCK_NOW,
      });

      const message2 = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_2',
        provider: 'YOUTUBE',
        providerChannelId: 'UC456',
        enqueuedAt: MOCK_NOW,
      });

      const batch = createMockBatch([message1, message2]);
      const env = createMockEnv();

      await handleSyncQueue(batch, env as never);

      // sub_1 should be marked as success
      expect(mockUpdateJobProgress).toHaveBeenCalledWith(
        TEST_JOB_ID,
        'sub_1',
        true,
        expect.any(Number),
        null,
        expect.anything()
      );

      // sub_2 should be marked as failure
      expect(mockUpdateJobProgress).toHaveBeenCalledWith(
        TEST_JOB_ID,
        'sub_2',
        false,
        0,
        'Channel not found',
        expect.anything()
      );

      // Both should be acked
      expect(message1.ack).toHaveBeenCalled();
      expect(message2.ack).toHaveBeenCalled();
    });
  });

  describe('client creation failure', () => {
    it('should handle provider client creation failure', async () => {
      mockDb = createMockDb({
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
        ],
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC123',
            status: 'ACTIVE',
          },
        ],
      });

      mockGetYouTubeClient.mockRejectedValue(new Error('Token refresh failed'));

      const message = createMockMessage({
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'YOUTUBE',
        providerChannelId: 'UC123',
        enqueuedAt: MOCK_NOW,
      });

      const batch = createMockBatch([message]);
      const env = createMockEnv();

      await handleSyncQueue(batch, env as never);

      // Should mark as failed
      expect(mockUpdateJobProgress).toHaveBeenCalledWith(
        TEST_JOB_ID,
        'sub_1',
        false,
        0,
        'Token refresh failed',
        expect.anything()
      );

      // Should ack to prevent infinite retries
      expect(message.ack).toHaveBeenCalled();
    });
  });
});
