/**
 * Unit Tests for DLQ Consumer
 *
 * Tests for the Dead Letter Queue consumer that handles failed sync messages:
 * - handleSyncDLQ: batch processing, KV storage
 * - getDLQEntries: fetching stored DLQ entries
 * - getDLQSummary: summary for monitoring dashboard
 * - deleteDLQEntry: cleanup after resolution
 *
 * @see zine-m2oq: Task: Add monitoring/alerting for sync queue DLQ
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSyncDLQ, getDLQEntries, getDLQSummary, deleteDLQEntry } from './dlq-consumer';
import type { SyncQueueMessage, SyncJobStatus } from './types';
import { getActiveJobKey, getDLQEntryKey, getDLQIndexKey, getJobStatusKey } from './types';
import { expectLoggerErrorCalls, mockLogger } from '../test/mock-logger';

// ============================================================================
// Mocks
// ============================================================================

// Mock ulid
let mockUlidCounter = 0;
vi.mock('ulid', () => ({
  ulid: () => `01HQXYZ${String(++mockUlidCounter).padStart(17, '0')}`,
}));

// ============================================================================
// Mock KV Namespace
// ============================================================================

type KVStore = Map<string, { value: string; expiration?: number }>;

function createMockKV(initialData?: Record<string, string>): KVNamespace & { store: KVStore } {
  const store: KVStore = new Map();

  if (initialData) {
    for (const [key, value] of Object.entries(initialData)) {
      store.set(key, { value });
    }
  }

  return {
    store,
    get: vi.fn(async (key: string) => {
      const entry = store.get(key);
      return entry?.value ?? null;
    }),
    put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number }) => {
      store.set(key, { value, expiration: options?.expirationTtl });
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace & { store: KVStore };
}

// ============================================================================
// Mock Message Batch
// ============================================================================

function createMockMessage(
  body: SyncQueueMessage,
  attempts: number = 3
): Message<SyncQueueMessage> {
  return {
    id: `msg_${body.subscriptionId}`,
    timestamp: new Date(),
    body,
    attempts,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function createMockDLQBatch(messages: Message<SyncQueueMessage>[]): MessageBatch<SyncQueueMessage> {
  return {
    queue: 'zine-sync-dlq-dev',
    messages,
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  };
}

function expectHandleSyncDLQErrorLogs(
  batch: MessageBatch<SyncQueueMessage>,
  malformedMessageIds: string[] = []
): void {
  const expectedCalls: Parameters<typeof expectLoggerErrorCalls>[0] = [
    [
      'DLQ messages received - sync failures requiring investigation',
      expect.objectContaining({
        messageCount: batch.messages.length,
        environment: 'development',
      }),
    ],
    ...batch.messages.map<Parameters<typeof expectLoggerErrorCalls>[0][number]>((message) => [
      malformedMessageIds.includes(message.id)
        ? 'DLQ: Malformed message body'
        : 'DLQ: Subscription sync permanently failed',
      expect.objectContaining({
        messageId: message.id,
        attempts: message.attempts,
      }),
    ]),
  ];

  expectLoggerErrorCalls(expectedCalls);
}

// ============================================================================
// Mock Environment
// ============================================================================

function createMockEnv(kv: KVNamespace) {
  return {
    DB: {},
    OAUTH_STATE_KV: kv,
    ENVIRONMENT: 'development',
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

describe('handleSyncDLQ', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUlidCounter = 0;
  });

  it('should store DLQ entries in KV for investigation', async () => {
    const kv = createMockKV();
    const message = createMockMessage({
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      subscriptionId: 'sub_1',
      provider: 'YOUTUBE',
      providerChannelId: 'UC123',
      enqueuedAt: MOCK_NOW - 60000,
    });

    const batch = createMockDLQBatch([message]);
    const env = createMockEnv(kv);

    await handleSyncDLQ(batch, env as never);

    // Should store entry in KV
    expect(kv.put).toHaveBeenCalledWith(
      expect.stringContaining('sync-dlq:entry:'),
      expect.any(String),
      expect.objectContaining({ expirationTtl: 7 * 24 * 60 * 60 })
    );

    // Should update index
    expect(kv.put).toHaveBeenCalledWith(
      'sync-dlq:index',
      expect.any(String),
      expect.objectContaining({ expirationTtl: 7 * 24 * 60 * 60 })
    );
    expectHandleSyncDLQErrorLogs(batch);
  });

  it('should acknowledge all messages after processing', async () => {
    const kv = createMockKV();
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
      provider: 'SPOTIFY',
      providerChannelId: 'show123',
      enqueuedAt: MOCK_NOW,
    });

    const batch = createMockDLQBatch([message1, message2]);
    const env = createMockEnv(kv);

    await handleSyncDLQ(batch, env as never);

    expect(message1.ack).toHaveBeenCalled();
    expect(message2.ack).toHaveBeenCalled();
    expectHandleSyncDLQErrorLogs(batch);
  });

  it('should handle malformed message bodies', async () => {
    const kv = createMockKV();
    const malformedMessage = {
      id: 'msg_malformed',
      timestamp: new Date(),
      body: { invalid: 'data' } as unknown as SyncQueueMessage,
      attempts: 3,
      ack: vi.fn(),
      retry: vi.fn(),
    };

    const batch = createMockDLQBatch([malformedMessage]);
    const env = createMockEnv(kv);

    await handleSyncDLQ(batch, env as never);

    // Should still ack and store entry with partial data
    expect(malformedMessage.ack).toHaveBeenCalled();
    expect(kv.put).toHaveBeenCalled();
    expectHandleSyncDLQErrorLogs(batch, ['msg_malformed']);
  });

  it('should include message attempts in DLQ entry', async () => {
    const kv = createMockKV();
    const message = createMockMessage(
      {
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'YOUTUBE',
        providerChannelId: 'UC123',
        enqueuedAt: MOCK_NOW,
      },
      3 // 3 attempts before DLQ
    );

    const batch = createMockDLQBatch([message]);
    const env = createMockEnv(kv);

    await handleSyncDLQ(batch, env as never);

    // Get the stored entry
    const putMock = kv.put as ReturnType<typeof vi.fn>;
    const putCalls = putMock.mock.calls as Array<[string, string, unknown]>;
    const entryCall = putCalls.find((call) => call[0].includes('sync-dlq:entry:'));
    expect(entryCall).toBeDefined();

    const storedEntry = JSON.parse(entryCall![1]);
    expect(storedEntry.attempts).toBe(3);
    expectHandleSyncDLQErrorLogs(batch);
  });

  it('should maintain DLQ index with most recent first', async () => {
    // Start with existing index
    const kv = createMockKV({
      [getDLQIndexKey()]: JSON.stringify(['existing_id_1', 'existing_id_2']),
    });

    const message = createMockMessage({
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      subscriptionId: 'sub_1',
      provider: 'YOUTUBE',
      providerChannelId: 'UC123',
      enqueuedAt: MOCK_NOW,
    });

    const batch = createMockDLQBatch([message]);
    const env = createMockEnv(kv);

    await handleSyncDLQ(batch, env as never);

    // Get the updated index
    const putMock = kv.put as ReturnType<typeof vi.fn>;
    const putCalls = putMock.mock.calls as Array<[string, string, unknown]>;
    const indexCall = putCalls.find((call) => call[0] === 'sync-dlq:index');
    expect(indexCall).toBeDefined();

    const updatedIndex = JSON.parse(indexCall![1]);
    // New entry should be first
    expect(updatedIndex[0]).toMatch(/^01HQXYZ/);
    expect(updatedIndex[1]).toBe('existing_id_1');
    expect(updatedIndex[2]).toBe('existing_id_2');
    expectHandleSyncDLQErrorLogs(batch);
  });

  it('should recover from corrupted DLQ index JSON when storing new entries', async () => {
    const kv = createMockKV({
      [getDLQIndexKey()]: '{bad-json',
    });

    const message = createMockMessage({
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      subscriptionId: 'sub_1',
      provider: 'YOUTUBE',
      providerChannelId: 'UC123',
      enqueuedAt: MOCK_NOW,
    });

    const batch = createMockDLQBatch([message]);
    const env = createMockEnv(kv);

    await expect(handleSyncDLQ(batch, env as never)).resolves.toBeUndefined();

    const putMock = kv.put as ReturnType<typeof vi.fn>;
    const putCalls = putMock.mock.calls as Array<[string, string, unknown]>;
    const indexCall = putCalls.find((call) => call[0] === getDLQIndexKey());
    expect(indexCall).toBeDefined();

    const updatedIndex = JSON.parse(indexCall![1]);
    expect(updatedIndex).toHaveLength(1);
    expect(updatedIndex[0]).toMatch(/^01HQXYZ/);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Failed to parse DLQ index JSON; resetting',
      expect.objectContaining({
        operation: 'store',
        error: expect.any(String),
      })
    );
    expectHandleSyncDLQErrorLogs(batch);
  });

  it('should store correct DLQ entry structure', async () => {
    const kv = createMockKV();
    const message = createMockMessage({
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      subscriptionId: 'sub_1',
      provider: 'YOUTUBE',
      providerChannelId: 'UC123',
      enqueuedAt: MOCK_NOW,
    });

    const batch = createMockDLQBatch([message]);
    const env = createMockEnv(kv);

    await handleSyncDLQ(batch, env as never);

    const putMock = kv.put as ReturnType<typeof vi.fn>;
    const putCalls = putMock.mock.calls as Array<[string, string, unknown]>;
    const entryCall = putCalls.find((call) => call[0].includes('sync-dlq:entry:'));
    expect(entryCall).toBeDefined();

    const storedEntry = JSON.parse(entryCall![1]);
    expect(storedEntry).toMatchObject({
      id: expect.stringMatching(/^01HQXYZ/),
      message: {
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'YOUTUBE',
        providerChannelId: 'UC123',
      },
      attempts: 3,
      environment: 'development',
      deadLetteredAt: expect.any(Number),
    });
    expectHandleSyncDLQErrorLogs(batch);
  });

  it('should mark the sync job as failed when a message reaches DLQ', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 1,
      completed: 0,
      succeeded: 0,
      failed: 0,
      itemsFound: 0,
      status: 'pending',
      createdAt: MOCK_NOW,
      updatedAt: MOCK_NOW,
      errors: [],
    };
    const kv = createMockKV({
      [getJobStatusKey(TEST_JOB_ID)]: JSON.stringify(jobStatus),
      [getActiveJobKey(TEST_USER_ID)]: TEST_JOB_ID,
    });
    const message = createMockMessage({
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      subscriptionId: 'sub_1',
      provider: 'YOUTUBE',
      providerChannelId: 'UC123',
      enqueuedAt: MOCK_NOW,
      meta: {
        traceId: 'trc_dlq_test',
        requestId: 'req_dlq_test',
        source: 'subscriptions.syncAllAsync',
        enqueuedAt: MOCK_NOW,
      },
    });

    const batch = createMockDLQBatch([message]);
    const env = createMockEnv(kv);

    await handleSyncDLQ(batch, env as never);

    const updatedStatus = JSON.parse(
      kv.store.get(getJobStatusKey(TEST_JOB_ID))?.value ?? 'null'
    ) as SyncJobStatus | null;

    expect(updatedStatus).toMatchObject({
      completed: 1,
      failed: 1,
      status: 'completed',
      errors: [{ subscriptionId: 'sub_1', error: 'Moved to DLQ after 3 attempts' }],
    });
    expect(kv.delete).toHaveBeenCalledWith(getActiveJobKey(TEST_USER_ID));
  });
});

describe('getDLQEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when no DLQ entries', async () => {
    const kv = createMockKV();
    const entries = await getDLQEntries(kv);
    expect(entries).toEqual([]);
  });

  it('should return stored DLQ entries', async () => {
    const entry1 = {
      id: 'entry_1',
      message: {
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'YOUTUBE',
        providerChannelId: 'UC123',
        enqueuedAt: MOCK_NOW,
      },
      deadLetteredAt: MOCK_NOW,
      attempts: 3,
      environment: 'development',
    };

    const kv = createMockKV({
      [getDLQIndexKey()]: JSON.stringify(['entry_1']),
      [getDLQEntryKey('entry_1')]: JSON.stringify(entry1),
    });

    const entries = await getDLQEntries(kv);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(entry1);
  });

  it('should respect limit parameter', async () => {
    const kv = createMockKV({
      [getDLQIndexKey()]: JSON.stringify(['entry_1', 'entry_2', 'entry_3']),
      [getDLQEntryKey('entry_1')]: JSON.stringify({ id: 'entry_1' }),
      [getDLQEntryKey('entry_2')]: JSON.stringify({ id: 'entry_2' }),
      [getDLQEntryKey('entry_3')]: JSON.stringify({ id: 'entry_3' }),
    });

    const entries = await getDLQEntries(kv, 2);

    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe('entry_1');
    expect(entries[1].id).toBe('entry_2');
  });

  it('should handle missing entries gracefully', async () => {
    const kv = createMockKV({
      [getDLQIndexKey()]: JSON.stringify(['entry_1', 'missing_entry', 'entry_2']),
      [getDLQEntryKey('entry_1')]: JSON.stringify({ id: 'entry_1' }),
      [getDLQEntryKey('entry_2')]: JSON.stringify({ id: 'entry_2' }),
      // 'missing_entry' doesn't exist in KV
    });

    const entries = await getDLQEntries(kv, 10);

    // Should filter out null entries
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.id)).toEqual(['entry_1', 'entry_2']);
  });

  it('should return empty array when index JSON is corrupted', async () => {
    const kv = createMockKV({
      [getDLQIndexKey()]: '{bad-json',
    });

    await expect(getDLQEntries(kv)).resolves.toEqual([]);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Failed to parse DLQ index JSON; resetting',
      expect.objectContaining({
        operation: 'list',
        error: expect.any(String),
      })
    );
  });

  it('should return empty array and warn when index data has invalid shape', async () => {
    const kv = createMockKV({
      [getDLQIndexKey()]: JSON.stringify(['entry_1', 42]),
      [getDLQEntryKey('entry_1')]: JSON.stringify({ id: 'entry_1' }),
    });

    await expect(getDLQEntries(kv)).resolves.toEqual([]);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'DLQ index data has invalid shape; resetting',
      expect.objectContaining({
        operation: 'list',
      })
    );
  });
});

describe('getDLQSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty summary when no DLQ entries', async () => {
    const kv = createMockKV();
    const summary = await getDLQSummary(kv);

    expect(summary).toEqual({
      count: 0,
      recent: [],
      oldestAt: null,
      newestAt: null,
    });
  });

  it('should return summary with count and recent entries', async () => {
    const entry1 = {
      id: 'entry_1',
      message: { jobId: 'job1' },
      deadLetteredAt: MOCK_NOW - 60000,
      attempts: 3,
      environment: 'development',
    };

    const entry2 = {
      id: 'entry_2',
      message: { jobId: 'job2' },
      deadLetteredAt: MOCK_NOW,
      attempts: 3,
      environment: 'development',
    };

    const kv = createMockKV({
      [getDLQIndexKey()]: JSON.stringify(['entry_2', 'entry_1']),
      [getDLQEntryKey('entry_1')]: JSON.stringify(entry1),
      [getDLQEntryKey('entry_2')]: JSON.stringify(entry2),
    });

    const summary = await getDLQSummary(kv);

    expect(summary.count).toBe(2);
    expect(summary.recent).toHaveLength(2);
    expect(summary.newestAt).toBe(MOCK_NOW);
    expect(summary.oldestAt).toBe(MOCK_NOW - 60000);
  });

  it('should limit recent entries to 10', async () => {
    // Create 15 entries
    const entryIds = Array.from({ length: 15 }, (_, i) => `entry_${i}`);
    const kvData: Record<string, string> = {
      [getDLQIndexKey()]: JSON.stringify(entryIds),
    };

    for (let i = 0; i < 15; i++) {
      kvData[getDLQEntryKey(`entry_${i}`)] = JSON.stringify({
        id: `entry_${i}`,
        deadLetteredAt: MOCK_NOW - i * 1000,
      });
    }

    const kv = createMockKV(kvData);
    const summary = await getDLQSummary(kv);

    expect(summary.count).toBe(15);
    expect(summary.recent).toHaveLength(10);
  });

  it('should return empty summary when index JSON is corrupted', async () => {
    const kv = createMockKV({
      [getDLQIndexKey()]: '{bad-json',
    });

    const summary = await getDLQSummary(kv);

    expect(summary).toEqual({
      count: 0,
      recent: [],
      oldestAt: null,
      newestAt: null,
    });
  });
});

describe('deleteDLQEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete DLQ entry and update index', async () => {
    const entry = {
      id: 'entry_1',
      message: { jobId: TEST_JOB_ID },
      deadLetteredAt: MOCK_NOW,
      attempts: 3,
    };

    const kv = createMockKV({
      [getDLQIndexKey()]: JSON.stringify(['entry_1', 'entry_2']),
      [getDLQEntryKey('entry_1')]: JSON.stringify(entry),
      [getDLQEntryKey('entry_2')]: JSON.stringify({ id: 'entry_2' }),
    });

    const deleted = await deleteDLQEntry('entry_1', kv);

    expect(deleted).toBe(true);
    expect(kv.delete).toHaveBeenCalledWith(getDLQEntryKey('entry_1'));

    // Index should be updated
    const putMock = kv.put as ReturnType<typeof vi.fn>;
    const putCalls = putMock.mock.calls as Array<[string, string, unknown]>;
    const indexCall = putCalls.find((call) => call[0] === getDLQIndexKey());
    expect(indexCall).toBeDefined();

    const updatedIndex = JSON.parse(indexCall![1]);
    expect(updatedIndex).toEqual(['entry_2']);
  });

  it('should return false for non-existent entry', async () => {
    const kv = createMockKV();
    const deleted = await deleteDLQEntry('non_existent', kv);

    expect(deleted).toBe(false);
    expect(kv.delete).not.toHaveBeenCalled();
  });

  it('should delete entry and reset corrupted index JSON', async () => {
    const entry = {
      id: 'entry_1',
      message: { jobId: TEST_JOB_ID },
      deadLetteredAt: MOCK_NOW,
      attempts: 3,
    };

    const kv = createMockKV({
      [getDLQIndexKey()]: '{bad-json',
      [getDLQEntryKey('entry_1')]: JSON.stringify(entry),
    });

    const deleted = await deleteDLQEntry('entry_1', kv);

    expect(deleted).toBe(true);
    expect(kv.delete).toHaveBeenCalledWith(getDLQEntryKey('entry_1'));

    const putMock = kv.put as ReturnType<typeof vi.fn>;
    const putCalls = putMock.mock.calls as Array<[string, string, unknown]>;
    const indexCall = putCalls.find((call) => call[0] === getDLQIndexKey());
    expect(indexCall).toBeDefined();
    expect(JSON.parse(indexCall![1])).toEqual([]);
  });
});

describe('DLQ entry TTL', () => {
  it('should store entries with 7-day TTL', async () => {
    const kv = createMockKV();
    const message = createMockMessage({
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      subscriptionId: 'sub_1',
      provider: 'YOUTUBE',
      providerChannelId: 'UC123',
      enqueuedAt: MOCK_NOW,
    });

    const batch = createMockDLQBatch([message]);
    const env = createMockEnv(kv);

    await handleSyncDLQ(batch, env as never);

    // Verify 7-day TTL (7 * 24 * 60 * 60 = 604800 seconds)
    expect(kv.put).toHaveBeenCalledWith(
      expect.stringContaining('sync-dlq:entry:'),
      expect.any(String),
      { expirationTtl: 604800 }
    );
    expectHandleSyncDLQErrorLogs(batch);
  });
});

describe('queue routing', () => {
  it('should handle messages from DLQ queue (name contains -dlq-)', async () => {
    const kv = createMockKV();
    const message = createMockMessage({
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      subscriptionId: 'sub_1',
      provider: 'YOUTUBE',
      providerChannelId: 'UC123',
      enqueuedAt: MOCK_NOW,
    });

    // Create batch with DLQ queue name
    const batch: MessageBatch<SyncQueueMessage> = {
      queue: 'zine-sync-dlq-prod', // Production DLQ
      messages: [message],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
    };

    const env = createMockEnv(kv);

    await handleSyncDLQ(batch, env as never);

    // Should process - ack the message
    expect(message.ack).toHaveBeenCalled();
    // Should store in KV
    expect(kv.put).toHaveBeenCalled();
    expectHandleSyncDLQErrorLogs(batch);
  });
});
