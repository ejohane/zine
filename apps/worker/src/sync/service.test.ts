/**
 * Unit Tests for Sync Service Module
 *
 * Tests for async sync job management including:
 * - initiateSyncJob: job creation, rate limiting, deduplication, queue enqueuing
 * - getJobStatus / getSyncStatus: status retrieval and formatting
 * - getActiveSyncJob: active job detection
 * - updateJobProgress: atomic progress updates, completion detection
 *
 * @see zine-ur06: Task: Write unit tests for sync service module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initiateSyncJob,
  getJobStatus,
  getSyncStatus,
  getActiveSyncJob,
  updateJobProgress,
  RateLimitError,
} from './service';
import {
  getActiveJobKey,
  getJobStatusKey,
  JOB_STATUS_TTL_SECONDS,
  ACTIVE_JOB_TTL_SECONDS,
  type SyncJobStatus,
} from './types';

// ============================================================================
// Mock KV Namespace
// ============================================================================

function createMockKV() {
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
// Mock Queue
// ============================================================================

function createMockQueue() {
  const messages: Array<{ body: unknown }> = [];

  return {
    send: vi.fn(async (message: unknown) => {
      messages.push({ body: message });
    }),
    sendBatch: vi.fn(async (batch: Array<{ body: unknown }>) => {
      messages.push(...batch);
    }),
    // Helper to access messages for assertions
    _messages: messages,
    _clear: () => (messages.length = 0),
  };
}

// ============================================================================
// Mock Database
// ============================================================================

function createMockDb(overrides?: {
  subscriptions?: Array<{
    id: string;
    userId: string;
    provider: string;
    providerChannelId: string;
    status: string;
  }>;
  connections?: Array<{
    id: string;
    userId: string;
    provider: string;
    status: string;
  }>;
}) {
  const subscriptions = overrides?.subscriptions ?? [];
  const connections = overrides?.connections ?? [];

  return {
    query: {
      subscriptions: {
        // Filter by userId and status=ACTIVE (simulating the where clause)
        findMany: vi.fn(async () => subscriptions.filter((s) => s.status === 'ACTIVE')),
      },
      providerConnections: {
        // Filter by userId and status=ACTIVE (simulating the where clause)
        findMany: vi.fn(async () => connections.filter((c) => c.status === 'ACTIVE')),
      },
    },
  };
}

// ============================================================================
// Mock Environment
// ============================================================================

function createMockEnv(
  kv?: ReturnType<typeof createMockKV>,
  queue?: ReturnType<typeof createMockQueue>
) {
  return {
    OAUTH_STATE_KV: kv ?? createMockKV(),
    SYNC_QUEUE: queue,
  };
}

// ============================================================================
// Test Constants
// ============================================================================

const MOCK_NOW = 1705320000000; // 2024-01-15T12:00:00.000Z
const TEST_USER_ID = 'user_test_123';
const TEST_JOB_ID = '01HQXYZ123456789ABCDEFGHIJ';

// Store original Date.now for restoration
const originalDateNow = Date.now;

// ============================================================================
// RateLimitError Tests
// ============================================================================

describe('RateLimitError', () => {
  it('should have correct name property', () => {
    const error = new RateLimitError('Please wait 30 seconds');

    expect(error.name).toBe('RateLimitError');
  });

  it('should store message correctly', () => {
    const message = 'Please wait 30 seconds before syncing again';
    const error = new RateLimitError(message);

    expect(error.message).toBe(message);
  });

  it('should be catchable as Error', () => {
    const error = new RateLimitError('Rate limited');
    expect(error instanceof Error).toBe(true);
  });
});

// ============================================================================
// getJobStatus Tests
// ============================================================================

describe('getJobStatus', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  it('should return null when job does not exist', async () => {
    const result = await getJobStatus('nonexistent_job', mockKV);

    expect(result).toBeNull();
    expect(mockKV.get).toHaveBeenCalledWith(getJobStatusKey('nonexistent_job'));
  });

  it('should return parsed job status when job exists', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 5,
      completed: 2,
      succeeded: 2,
      failed: 0,
      itemsFound: 10,
      status: 'processing',
      createdAt: MOCK_NOW,
      updatedAt: MOCK_NOW + 1000,
      errors: [],
    };

    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));

    const result = await getJobStatus(TEST_JOB_ID, mockKV);

    expect(result).toEqual(jobStatus);
  });

  it('should return null for invalid JSON', async () => {
    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), 'invalid json');

    const result = await getJobStatus(TEST_JOB_ID, mockKV);

    expect(result).toBeNull();
  });

  it('should use correct key format', async () => {
    await getJobStatus(TEST_JOB_ID, mockKV);

    expect(mockKV.get).toHaveBeenCalledWith(`sync-job:status:${TEST_JOB_ID}`);
  });
});

// ============================================================================
// getSyncStatus Tests
// ============================================================================

describe('getSyncStatus', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  it('should return not_found status when job does not exist', async () => {
    const result = await getSyncStatus('nonexistent_job', mockKV);

    expect(result).toEqual({
      jobId: 'nonexistent_job',
      status: 'not_found',
      total: 0,
      completed: 0,
      succeeded: 0,
      failed: 0,
      itemsFound: 0,
      progress: 0,
      errors: [],
    });
  });

  it('should return formatted status with progress percentage', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 10,
      completed: 5,
      succeeded: 4,
      failed: 1,
      itemsFound: 20,
      status: 'processing',
      createdAt: MOCK_NOW,
      updatedAt: MOCK_NOW + 1000,
      errors: [{ subscriptionId: 'sub_1', error: 'Connection failed' }],
    };

    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));

    const result = await getSyncStatus(TEST_JOB_ID, mockKV);

    expect(result).toEqual({
      jobId: TEST_JOB_ID,
      status: 'processing',
      total: 10,
      completed: 5,
      succeeded: 4,
      failed: 1,
      itemsFound: 20,
      progress: 50, // 5/10 * 100
      errors: [{ subscriptionId: 'sub_1', error: 'Connection failed' }],
    });
  });

  it('should return 100% progress when total is 0', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 0,
      completed: 0,
      succeeded: 0,
      failed: 0,
      itemsFound: 0,
      status: 'completed',
      createdAt: MOCK_NOW,
      updatedAt: MOCK_NOW,
      errors: [],
    };

    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));

    const result = await getSyncStatus(TEST_JOB_ID, mockKV);

    expect(result.progress).toBe(100);
  });

  it('should round progress percentage', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 3,
      completed: 1,
      succeeded: 1,
      failed: 0,
      itemsFound: 5,
      status: 'processing',
      createdAt: MOCK_NOW,
      updatedAt: MOCK_NOW,
      errors: [],
    };

    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));

    const result = await getSyncStatus(TEST_JOB_ID, mockKV);

    expect(result.progress).toBe(33); // Math.round(1/3 * 100)
  });
});

// ============================================================================
// getActiveSyncJob Tests
// ============================================================================

describe('getActiveSyncJob', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  it('should return inProgress: false when no active job', async () => {
    const result = await getActiveSyncJob(TEST_USER_ID, mockKV);

    expect(result).toEqual({
      inProgress: false,
      jobId: null,
    });
  });

  it('should return inProgress: false when active job marker exists but job is completed', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 5,
      completed: 5,
      succeeded: 5,
      failed: 0,
      itemsFound: 25,
      status: 'completed',
      createdAt: MOCK_NOW,
      updatedAt: MOCK_NOW + 5000,
      errors: [],
    };

    mockKV._store.set(getActiveJobKey(TEST_USER_ID), TEST_JOB_ID);
    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));

    const result = await getActiveSyncJob(TEST_USER_ID, mockKV);

    expect(result).toEqual({
      inProgress: false,
      jobId: null,
    });
  });

  it('should return inProgress: false when active job marker exists but job status not found', async () => {
    mockKV._store.set(getActiveJobKey(TEST_USER_ID), TEST_JOB_ID);
    // No job status stored

    const result = await getActiveSyncJob(TEST_USER_ID, mockKV);

    expect(result).toEqual({
      inProgress: false,
      jobId: null,
    });
  });

  it('should return inProgress: true with progress when job is pending', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 10,
      completed: 0,
      succeeded: 0,
      failed: 0,
      itemsFound: 0,
      status: 'pending',
      createdAt: MOCK_NOW,
      updatedAt: MOCK_NOW,
      errors: [],
    };

    mockKV._store.set(getActiveJobKey(TEST_USER_ID), TEST_JOB_ID);
    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));

    const result = await getActiveSyncJob(TEST_USER_ID, mockKV);

    expect(result).toEqual({
      inProgress: true,
      jobId: TEST_JOB_ID,
      progress: {
        total: 10,
        completed: 0,
        status: 'pending',
      },
    });
  });

  it('should return inProgress: true with progress when job is processing', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 10,
      completed: 5,
      succeeded: 4,
      failed: 1,
      itemsFound: 20,
      status: 'processing',
      createdAt: MOCK_NOW,
      updatedAt: MOCK_NOW + 2000,
      errors: [],
    };

    mockKV._store.set(getActiveJobKey(TEST_USER_ID), TEST_JOB_ID);
    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));

    const result = await getActiveSyncJob(TEST_USER_ID, mockKV);

    expect(result).toEqual({
      inProgress: true,
      jobId: TEST_JOB_ID,
      progress: {
        total: 10,
        completed: 5,
        status: 'processing',
      },
    });
  });
});

// ============================================================================
// updateJobProgress Tests
// ============================================================================

describe('updateJobProgress', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    // Mock Date.now directly (vi.setSystemTime not available in Workers pool)
    Date.now = vi.fn(() => MOCK_NOW);
    mockKV = createMockKV();
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  it('should return early when job status not found', async () => {
    await updateJobProgress(TEST_JOB_ID, 'sub_1', true, 5, null, mockKV);

    // Should not have called put (only get)
    expect(mockKV.put).not.toHaveBeenCalled();
  });

  it('should increment completed and succeeded on success', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 5,
      completed: 0,
      succeeded: 0,
      failed: 0,
      itemsFound: 0,
      status: 'pending',
      createdAt: MOCK_NOW - 1000,
      updatedAt: MOCK_NOW - 1000,
      errors: [],
    };

    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));

    await updateJobProgress(TEST_JOB_ID, 'sub_1', true, 10, null, mockKV);

    const updatedStatus = JSON.parse(
      mockKV._store.get(getJobStatusKey(TEST_JOB_ID))!
    ) as SyncJobStatus;

    expect(updatedStatus.completed).toBe(1);
    expect(updatedStatus.succeeded).toBe(1);
    expect(updatedStatus.failed).toBe(0);
    expect(updatedStatus.itemsFound).toBe(10);
    expect(updatedStatus.status).toBe('processing');
    expect(updatedStatus.updatedAt).toBe(MOCK_NOW);
  });

  it('should increment completed and failed on failure', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 5,
      completed: 0,
      succeeded: 0,
      failed: 0,
      itemsFound: 0,
      status: 'pending',
      createdAt: MOCK_NOW - 1000,
      updatedAt: MOCK_NOW - 1000,
      errors: [],
    };

    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));

    await updateJobProgress(TEST_JOB_ID, 'sub_1', false, 0, 'Connection failed', mockKV);

    const updatedStatus = JSON.parse(
      mockKV._store.get(getJobStatusKey(TEST_JOB_ID))!
    ) as SyncJobStatus;

    expect(updatedStatus.completed).toBe(1);
    expect(updatedStatus.succeeded).toBe(0);
    expect(updatedStatus.failed).toBe(1);
    expect(updatedStatus.itemsFound).toBe(0);
    expect(updatedStatus.errors).toEqual([{ subscriptionId: 'sub_1', error: 'Connection failed' }]);
  });

  it('should not add error entry when error is null', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 5,
      completed: 0,
      succeeded: 0,
      failed: 0,
      itemsFound: 0,
      status: 'pending',
      createdAt: MOCK_NOW - 1000,
      updatedAt: MOCK_NOW - 1000,
      errors: [],
    };

    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));

    await updateJobProgress(TEST_JOB_ID, 'sub_1', false, 0, null, mockKV);

    const updatedStatus = JSON.parse(
      mockKV._store.get(getJobStatusKey(TEST_JOB_ID))!
    ) as SyncJobStatus;

    expect(updatedStatus.failed).toBe(1);
    expect(updatedStatus.errors).toEqual([]);
  });

  it('should transition from pending to processing on first update', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 5,
      completed: 0,
      succeeded: 0,
      failed: 0,
      itemsFound: 0,
      status: 'pending',
      createdAt: MOCK_NOW - 1000,
      updatedAt: MOCK_NOW - 1000,
      errors: [],
    };

    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));

    await updateJobProgress(TEST_JOB_ID, 'sub_1', true, 5, null, mockKV);

    const updatedStatus = JSON.parse(
      mockKV._store.get(getJobStatusKey(TEST_JOB_ID))!
    ) as SyncJobStatus;

    expect(updatedStatus.status).toBe('processing');
  });

  it('should not change status from processing to processing', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 5,
      completed: 2,
      succeeded: 2,
      failed: 0,
      itemsFound: 10,
      status: 'processing',
      createdAt: MOCK_NOW - 2000,
      updatedAt: MOCK_NOW - 1000,
      errors: [],
    };

    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));

    await updateJobProgress(TEST_JOB_ID, 'sub_3', true, 5, null, mockKV);

    const updatedStatus = JSON.parse(
      mockKV._store.get(getJobStatusKey(TEST_JOB_ID))!
    ) as SyncJobStatus;

    expect(updatedStatus.status).toBe('processing');
    expect(updatedStatus.completed).toBe(3);
  });

  it('should mark as completed when all subscriptions processed', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 3,
      completed: 2,
      succeeded: 2,
      failed: 0,
      itemsFound: 10,
      status: 'processing',
      createdAt: MOCK_NOW - 2000,
      updatedAt: MOCK_NOW - 1000,
      errors: [],
    };

    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));
    mockKV._store.set(getActiveJobKey(TEST_USER_ID), TEST_JOB_ID);

    await updateJobProgress(TEST_JOB_ID, 'sub_3', true, 5, null, mockKV);

    const updatedStatus = JSON.parse(
      mockKV._store.get(getJobStatusKey(TEST_JOB_ID))!
    ) as SyncJobStatus;

    expect(updatedStatus.status).toBe('completed');
    expect(updatedStatus.completed).toBe(3);
    expect(updatedStatus.succeeded).toBe(3);
    expect(updatedStatus.itemsFound).toBe(15);
  });

  it('should clear active job marker when job completes', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 1,
      completed: 0,
      succeeded: 0,
      failed: 0,
      itemsFound: 0,
      status: 'pending',
      createdAt: MOCK_NOW - 1000,
      updatedAt: MOCK_NOW - 1000,
      errors: [],
    };

    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));
    mockKV._store.set(getActiveJobKey(TEST_USER_ID), TEST_JOB_ID);

    await updateJobProgress(TEST_JOB_ID, 'sub_1', true, 5, null, mockKV);

    expect(mockKV.delete).toHaveBeenCalledWith(getActiveJobKey(TEST_USER_ID));
  });

  it('should save updated status with TTL', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 5,
      completed: 0,
      succeeded: 0,
      failed: 0,
      itemsFound: 0,
      status: 'pending',
      createdAt: MOCK_NOW - 1000,
      updatedAt: MOCK_NOW - 1000,
      errors: [],
    };

    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));

    await updateJobProgress(TEST_JOB_ID, 'sub_1', true, 5, null, mockKV);

    expect(mockKV.put).toHaveBeenCalledWith(getJobStatusKey(TEST_JOB_ID), expect.any(String), {
      expirationTtl: JOB_STATUS_TTL_SECONDS,
    });
  });

  it('should accumulate items found from multiple successful syncs', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 3,
      completed: 1,
      succeeded: 1,
      failed: 0,
      itemsFound: 5,
      status: 'processing',
      createdAt: MOCK_NOW - 2000,
      updatedAt: MOCK_NOW - 1000,
      errors: [],
    };

    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));

    await updateJobProgress(TEST_JOB_ID, 'sub_2', true, 8, null, mockKV);

    const updatedStatus = JSON.parse(
      mockKV._store.get(getJobStatusKey(TEST_JOB_ID))!
    ) as SyncJobStatus;

    expect(updatedStatus.itemsFound).toBe(13); // 5 + 8
  });

  it('should accumulate errors from multiple failed syncs', async () => {
    const jobStatus: SyncJobStatus = {
      jobId: TEST_JOB_ID,
      userId: TEST_USER_ID,
      total: 3,
      completed: 1,
      succeeded: 0,
      failed: 1,
      itemsFound: 0,
      status: 'processing',
      createdAt: MOCK_NOW - 2000,
      updatedAt: MOCK_NOW - 1000,
      errors: [{ subscriptionId: 'sub_1', error: 'Error 1' }],
    };

    mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(jobStatus));

    await updateJobProgress(TEST_JOB_ID, 'sub_2', false, 0, 'Error 2', mockKV);

    const updatedStatus = JSON.parse(
      mockKV._store.get(getJobStatusKey(TEST_JOB_ID))!
    ) as SyncJobStatus;

    expect(updatedStatus.errors).toEqual([
      { subscriptionId: 'sub_1', error: 'Error 1' },
      { subscriptionId: 'sub_2', error: 'Error 2' },
    ]);
  });
});

// ============================================================================
// initiateSyncJob Tests
// ============================================================================

describe('initiateSyncJob', () => {
  let mockKV: ReturnType<typeof createMockKV>;
  let mockQueue: ReturnType<typeof createMockQueue>;

  beforeEach(() => {
    // Mock Date.now directly (vi.setSystemTime not available in Workers pool)
    Date.now = vi.fn(() => MOCK_NOW);
    mockKV = createMockKV();
    mockQueue = createMockQueue();
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  describe('rate limiting', () => {
    it('should throw RateLimitError when rate limited', async () => {
      // Set rate limit 1 minute ago (within 2 minute window)
      mockKV._store.set(`sync-all:${TEST_USER_ID}`, String(MOCK_NOW - 60000));

      const mockDb = createMockDb();
      const mockEnv = createMockEnv(mockKV, mockQueue);

      await expect(
        initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never)
      ).rejects.toThrow(RateLimitError);
    });

    it('should include wait time in RateLimitError message', async () => {
      // Set rate limit 90 seconds ago (30 seconds remaining)
      mockKV._store.set(`sync-all:${TEST_USER_ID}`, String(MOCK_NOW - 90000));

      const mockDb = createMockDb();
      const mockEnv = createMockEnv(mockKV, mockQueue);

      try {
        await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);
        expect.fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).message).toContain('30 seconds');
      }
    });

    it('should allow sync after rate limit expires', async () => {
      // Set rate limit 3 minutes ago (expired)
      mockKV._store.set(`sync-all:${TEST_USER_ID}`, String(MOCK_NOW - 180000));

      const mockDb = createMockDb();
      const mockEnv = createMockEnv(mockKV, mockQueue);

      // Should not throw (no subscriptions, but rate limit passed)
      const result = await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);

      expect(result.jobId).toBeDefined();
    });

    it('should allow sync when no previous rate limit exists', async () => {
      const mockDb = createMockDb();
      const mockEnv = createMockEnv(mockKV, mockQueue);

      const result = await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);

      expect(result.jobId).toBeDefined();
    });
  });

  describe('job deduplication', () => {
    it('should return existing job when active job is pending', async () => {
      const existingJobStatus: SyncJobStatus = {
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        total: 5,
        completed: 0,
        succeeded: 0,
        failed: 0,
        itemsFound: 0,
        status: 'pending',
        createdAt: MOCK_NOW - 5000,
        updatedAt: MOCK_NOW - 5000,
        errors: [],
      };

      mockKV._store.set(getActiveJobKey(TEST_USER_ID), TEST_JOB_ID);
      mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(existingJobStatus));

      const mockDb = createMockDb();
      const mockEnv = createMockEnv(mockKV, mockQueue);

      const result = await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);

      expect(result.jobId).toBe(TEST_JOB_ID);
      expect(result.total).toBe(5);
      expect(result.existing).toBe(true);
    });

    it('should return existing job when active job is processing', async () => {
      const existingJobStatus: SyncJobStatus = {
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        total: 5,
        completed: 2,
        succeeded: 2,
        failed: 0,
        itemsFound: 10,
        status: 'processing',
        createdAt: MOCK_NOW - 10000,
        updatedAt: MOCK_NOW - 1000,
        errors: [],
      };

      mockKV._store.set(getActiveJobKey(TEST_USER_ID), TEST_JOB_ID);
      mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(existingJobStatus));

      const mockDb = createMockDb();
      const mockEnv = createMockEnv(mockKV, mockQueue);

      const result = await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);

      expect(result.jobId).toBe(TEST_JOB_ID);
      expect(result.existing).toBe(true);
    });

    it('should create new job when active job is completed', async () => {
      const existingJobStatus: SyncJobStatus = {
        jobId: TEST_JOB_ID,
        userId: TEST_USER_ID,
        total: 5,
        completed: 5,
        succeeded: 5,
        failed: 0,
        itemsFound: 25,
        status: 'completed',
        createdAt: MOCK_NOW - 60000,
        updatedAt: MOCK_NOW - 55000,
        errors: [],
      };

      mockKV._store.set(getActiveJobKey(TEST_USER_ID), TEST_JOB_ID);
      mockKV._store.set(getJobStatusKey(TEST_JOB_ID), JSON.stringify(existingJobStatus));

      const mockDb = createMockDb();
      const mockEnv = createMockEnv(mockKV, mockQueue);

      const result = await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);

      expect(result.jobId).not.toBe(TEST_JOB_ID);
      expect(result.existing).toBe(false);
    });
  });

  describe('no subscriptions', () => {
    it('should return completed job with total: 0 when no subscriptions', async () => {
      const mockDb = createMockDb({ subscriptions: [] });
      const mockEnv = createMockEnv(mockKV, mockQueue);

      const result = await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);

      expect(result.total).toBe(0);
      expect(result.existing).toBe(false);

      // Verify job status was stored as completed
      const storedStatus = JSON.parse(
        mockKV._store.get(getJobStatusKey(result.jobId))!
      ) as SyncJobStatus;
      expect(storedStatus.status).toBe('completed');
      expect(storedStatus.total).toBe(0);
    });

    it('should return completed job when subscriptions exist but no connections', async () => {
      const mockDb = createMockDb({
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC123',
            status: 'ACTIVE',
          },
        ],
        connections: [],
      });
      const mockEnv = createMockEnv(mockKV, mockQueue);

      const result = await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);

      expect(result.total).toBe(0);

      const storedStatus = JSON.parse(
        mockKV._store.get(getJobStatusKey(result.jobId))!
      ) as SyncJobStatus;
      expect(storedStatus.status).toBe('completed');
      expect(storedStatus.errors).toContainEqual(
        expect.objectContaining({ error: expect.stringContaining('not connected') })
      );
    });

    it('should filter out non-active subscriptions', async () => {
      const mockDb = createMockDb({
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC123',
            status: 'PAUSED',
          },
          {
            id: 'sub_2',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC456',
            status: 'UNSUBSCRIBED',
          },
        ],
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
        ],
      });
      const mockEnv = createMockEnv(mockKV, mockQueue);

      const result = await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);

      expect(result.total).toBe(0);
    });
  });

  describe('job creation with queue', () => {
    it('should create job and enqueue messages for active subscriptions', async () => {
      const mockDb = createMockDb({
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
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
          { id: 'conn_2', userId: TEST_USER_ID, provider: 'SPOTIFY', status: 'ACTIVE' },
        ],
      });
      const mockEnv = createMockEnv(mockKV, mockQueue);

      const result = await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);

      expect(result.total).toBe(2);
      expect(result.existing).toBe(false);
      expect(mockQueue.sendBatch).toHaveBeenCalledTimes(1);

      // Verify batch contains correct messages
      const batchCall = mockQueue.sendBatch.mock.calls[0][0];
      expect(batchCall).toHaveLength(2);
      expect(batchCall[0].body).toMatchObject({
        jobId: result.jobId,
        userId: TEST_USER_ID,
        subscriptionId: 'sub_1',
        provider: 'YOUTUBE',
        providerChannelId: 'UC123',
      });
    });

    it('should store job status with TTL', async () => {
      const mockDb = createMockDb({
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC123',
            status: 'ACTIVE',
          },
        ],
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
        ],
      });
      const mockEnv = createMockEnv(mockKV, mockQueue);

      const result = await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);

      expect(mockKV.put).toHaveBeenCalledWith(getJobStatusKey(result.jobId), expect.any(String), {
        expirationTtl: JOB_STATUS_TTL_SECONDS,
      });
    });

    it('should store active job marker with TTL', async () => {
      const mockDb = createMockDb({
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC123',
            status: 'ACTIVE',
          },
        ],
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
        ],
      });
      const mockEnv = createMockEnv(mockKV, mockQueue);

      await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);

      expect(mockKV.put).toHaveBeenCalledWith(getActiveJobKey(TEST_USER_ID), expect.any(String), {
        expirationTtl: ACTIVE_JOB_TTL_SECONDS,
      });
    });

    it('should update rate limit timestamp', async () => {
      const mockDb = createMockDb({
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC123',
            status: 'ACTIVE',
          },
        ],
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
        ],
      });
      const mockEnv = createMockEnv(mockKV, mockQueue);

      await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);

      expect(mockKV.put).toHaveBeenCalledWith(`sync-all:${TEST_USER_ID}`, String(MOCK_NOW), {
        expirationTtl: 120,
      });
    });
  });

  describe('queue fallback', () => {
    // Skip: The synchronous fallback uses dynamic imports for googleapis modules
    // which fail in the workerd test environment (vitest-pool-workers).
    // This fallback is designed for local development only and can be tested
    // manually with `wrangler dev` without --remote flag.
    it.skip('should process synchronously when queue not available', async () => {
      const mockDb = createMockDb({
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC123',
            status: 'ACTIVE',
          },
        ],
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
        ],
      });
      const mockEnv = createMockEnv(mockKV, undefined); // No queue

      const result = await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);

      expect(result.total).toBe(1);

      // Verify job status is completed (synchronous processing attempted)
      const storedStatus = JSON.parse(
        mockKV._store.get(getJobStatusKey(result.jobId))!
      ) as SyncJobStatus;
      expect(storedStatus.status).toBe('completed');
      // Errors may occur during sync (e.g., token refresh in test env)
      // but the job should complete rather than being skipped
      expect(storedStatus.completed).toBe(storedStatus.total);
    });
  });

  describe('subscription filtering', () => {
    it('should only sync subscriptions with active connections', async () => {
      const mockDb = createMockDb({
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
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'ACTIVE' },
          // No Spotify connection
        ],
      });
      const mockEnv = createMockEnv(mockKV, mockQueue);

      const result = await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);

      expect(result.total).toBe(1);

      // Verify only YouTube subscription was queued
      const batchCall = mockQueue.sendBatch.mock.calls[0][0];
      expect(batchCall).toHaveLength(1);
      expect(batchCall[0].body).toMatchObject({
        provider: 'YOUTUBE',
        subscriptionId: 'sub_1',
      });
    });

    it('should exclude subscriptions with expired connections', async () => {
      const mockDb = createMockDb({
        subscriptions: [
          {
            id: 'sub_1',
            userId: TEST_USER_ID,
            provider: 'YOUTUBE',
            providerChannelId: 'UC123',
            status: 'ACTIVE',
          },
        ],
        connections: [
          { id: 'conn_1', userId: TEST_USER_ID, provider: 'YOUTUBE', status: 'EXPIRED' },
        ],
      });
      const mockEnv = createMockEnv(mockKV, mockQueue);

      const result = await initiateSyncJob(TEST_USER_ID, mockDb as never, mockEnv as never);

      expect(result.total).toBe(0);
    });
  });
});

// ============================================================================
// KV Key Helper Tests
// ============================================================================

describe('KV Key Helpers', () => {
  describe('getActiveJobKey', () => {
    it('should return correct key format', () => {
      expect(getActiveJobKey('user_123')).toBe('sync-job:active:user_123');
    });
  });

  describe('getJobStatusKey', () => {
    it('should return correct key format', () => {
      expect(getJobStatusKey('job_abc')).toBe('sync-job:status:job_abc');
    });
  });
});

// ============================================================================
// TTL Constants Tests
// ============================================================================

describe('TTL Constants', () => {
  it('should have job status TTL of 10 minutes', () => {
    expect(JOB_STATUS_TTL_SECONDS).toBe(600);
  });

  it('should have active job TTL of 5 minutes', () => {
    expect(ACTIVE_JOB_TTL_SECONDS).toBe(300);
  });
});
