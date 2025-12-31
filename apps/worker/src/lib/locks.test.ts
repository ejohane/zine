/**
 * Tests for distributed lock utilities
 *
 * Tests lock acquisition, release, and the withLock wrapper including:
 * - Basic lock acquisition and release
 * - Lock contention (already held)
 * - TTL expiration behavior
 * - Error handling and cleanup in withLock
 * - Concurrent lock attempts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tryAcquireLock, releaseLock, withLock } from './locks';

// ============================================================================
// Mock KV Namespace
// ============================================================================

function createMockKV() {
  const store = new Map<string, string>();

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string, _options?: { expirationTtl?: number }) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    // Helper for tests
    _store: store,
    _clear: () => store.clear(),
  } as unknown as KVNamespace & { _store: Map<string, string>; _clear: () => void };
}

// ============================================================================
// Test Constants
// ============================================================================

const MOCK_NOW = 1705320000000; // 2024-01-15T12:00:00.000Z

// ============================================================================
// tryAcquireLock Tests
// ============================================================================

describe('tryAcquireLock', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
    mockKV = createMockKV();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when lock not held (can acquire)', async () => {
    const result = await tryAcquireLock(mockKV, 'test-lock', 60);

    expect(result).toBe(true);
    expect(mockKV.get).toHaveBeenCalledWith('test-lock');
    expect(mockKV.put).toHaveBeenCalled();
  });

  it('returns false when lock already held by another', async () => {
    // Pre-populate the lock
    mockKV._store.set('test-lock', Date.now().toString());

    const result = await tryAcquireLock(mockKV, 'test-lock', 60);

    expect(result).toBe(false);
    expect(mockKV.get).toHaveBeenCalledWith('test-lock');
    // put should NOT be called when lock is already held
    expect(mockKV.put).not.toHaveBeenCalled();
  });

  it('stores timestamp as lock value', async () => {
    await tryAcquireLock(mockKV, 'test-lock', 60);

    expect(mockKV.put).toHaveBeenCalledWith('test-lock', MOCK_NOW.toString(), expect.any(Object));
  });

  it('uses correct TTL expiration', async () => {
    const ttlSeconds = 120;

    await tryAcquireLock(mockKV, 'test-lock', ttlSeconds);

    expect(mockKV.put).toHaveBeenCalledWith('test-lock', expect.any(String), {
      expirationTtl: ttlSeconds,
    });
  });

  it('handles different lock keys independently', async () => {
    mockKV._store.set('lock-a', Date.now().toString());

    const resultA = await tryAcquireLock(mockKV, 'lock-a', 60);
    const resultB = await tryAcquireLock(mockKV, 'lock-b', 60);

    expect(resultA).toBe(false); // lock-a is held
    expect(resultB).toBe(true); // lock-b is available
  });

  it('handles empty lock key', async () => {
    const result = await tryAcquireLock(mockKV, '', 60);

    expect(result).toBe(true);
    expect(mockKV.put).toHaveBeenCalledWith('', expect.any(String), expect.any(Object));
  });

  it('handles very short TTL', async () => {
    const result = await tryAcquireLock(mockKV, 'short-ttl-lock', 1);

    expect(result).toBe(true);
    expect(mockKV.put).toHaveBeenCalledWith('short-ttl-lock', expect.any(String), {
      expirationTtl: 1,
    });
  });

  it('handles very long TTL', async () => {
    const longTtl = 86400; // 24 hours

    const result = await tryAcquireLock(mockKV, 'long-ttl-lock', longTtl);

    expect(result).toBe(true);
    expect(mockKV.put).toHaveBeenCalledWith('long-ttl-lock', expect.any(String), {
      expirationTtl: longTtl,
    });
  });
});

// ============================================================================
// releaseLock Tests
// ============================================================================

describe('releaseLock', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  it('deletes the lock key from KV', async () => {
    mockKV._store.set('test-lock', Date.now().toString());

    await releaseLock(mockKV, 'test-lock');

    expect(mockKV.delete).toHaveBeenCalledWith('test-lock');
    expect(mockKV._store.has('test-lock')).toBe(false);
  });

  it('no error when lock does not exist', async () => {
    // Lock doesn't exist
    expect(mockKV._store.has('nonexistent-lock')).toBe(false);

    await expect(releaseLock(mockKV, 'nonexistent-lock')).resolves.not.toThrow();

    expect(mockKV.delete).toHaveBeenCalledWith('nonexistent-lock');
  });

  it('handles empty lock key', async () => {
    await expect(releaseLock(mockKV, '')).resolves.not.toThrow();

    expect(mockKV.delete).toHaveBeenCalledWith('');
  });

  it('releases correct lock when multiple locks exist', async () => {
    mockKV._store.set('lock-a', '123');
    mockKV._store.set('lock-b', '456');
    mockKV._store.set('lock-c', '789');

    await releaseLock(mockKV, 'lock-b');

    expect(mockKV.delete).toHaveBeenCalledWith('lock-b');
    expect(mockKV._store.has('lock-a')).toBe(true);
    expect(mockKV._store.has('lock-b')).toBe(false);
    expect(mockKV._store.has('lock-c')).toBe(true);
  });
});

// ============================================================================
// withLock Tests
// ============================================================================

describe('withLock', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
    mockKV = createMockKV();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('acquires lock before executing function', async () => {
    const fn = vi.fn().mockImplementation(async () => {
      // Function should run after lock is acquired
      expect(mockKV.put).toHaveBeenCalledWith('my-lock', expect.any(String), expect.any(Object));
      return 'result';
    });

    await withLock(mockKV, 'my-lock', 60, fn);

    expect(fn).toHaveBeenCalled();
  });

  it('releases lock after function completes', async () => {
    const fn = vi.fn().mockResolvedValue('done');

    await withLock(mockKV, 'my-lock', 60, fn);

    expect(mockKV.delete).toHaveBeenCalledWith('my-lock');
  });

  it('releases lock even if function throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Function failed'));

    await expect(withLock(mockKV, 'my-lock', 60, fn)).rejects.toThrow('Function failed');

    expect(mockKV.delete).toHaveBeenCalledWith('my-lock');
  });

  it('returns function result on success', async () => {
    const expectedResult = { data: 'success', count: 42 };
    const fn = vi.fn().mockResolvedValue(expectedResult);

    const result = await withLock(mockKV, 'my-lock', 60, fn);

    expect(result).toEqual(expectedResult);
  });

  it('throws error if lock cannot be acquired', async () => {
    // Lock is already held
    mockKV._store.set('busy-lock', Date.now().toString());

    const fn = vi.fn().mockResolvedValue('never called');

    await expect(withLock(mockKV, 'busy-lock', 60, fn)).rejects.toThrow(
      'Failed to acquire lock: busy-lock'
    );

    // Function should never be called
    expect(fn).not.toHaveBeenCalled();
    // Lock should not be released (we never acquired it)
    expect(mockKV.delete).not.toHaveBeenCalled();
  });

  it('error message includes lock key', async () => {
    mockKV._store.set('token:refresh:conn123', Date.now().toString());

    const fn = vi.fn();

    await expect(withLock(mockKV, 'token:refresh:conn123', 60, fn)).rejects.toThrow(
      'token:refresh:conn123'
    );
  });

  it('handles async function that takes time', async () => {
    let functionExecuted = false;
    const fn = vi.fn().mockImplementation(async () => {
      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 100));
      functionExecuted = true;
      return 'completed';
    });

    const resultPromise = withLock(mockKV, 'slow-lock', 60, fn);

    // Advance timers
    await vi.advanceTimersByTimeAsync(100);

    const result = await resultPromise;

    expect(result).toBe('completed');
    expect(functionExecuted).toBe(true);
    expect(mockKV.delete).toHaveBeenCalledWith('slow-lock');
  });

  it('handles function returning different types', async () => {
    // String
    const stringResult = await withLock(mockKV, 'lock1', 60, async () => 'string');
    expect(stringResult).toBe('string');
    mockKV._clear();

    // Number
    const numberResult = await withLock(mockKV, 'lock2', 60, async () => 123);
    expect(numberResult).toBe(123);
    mockKV._clear();

    // Object
    const objResult = await withLock(mockKV, 'lock3', 60, async () => ({ key: 'value' }));
    expect(objResult).toEqual({ key: 'value' });
    mockKV._clear();

    // Array
    const arrayResult = await withLock(mockKV, 'lock4', 60, async () => [1, 2, 3]);
    expect(arrayResult).toEqual([1, 2, 3]);
    mockKV._clear();

    // Undefined
    const undefinedResult = await withLock(mockKV, 'lock5', 60, async () => undefined);
    expect(undefinedResult).toBeUndefined();
  });

  it('handles function that throws non-Error object', async () => {
    const fn = vi.fn().mockRejectedValue('string error');

    await expect(withLock(mockKV, 'my-lock', 60, fn)).rejects.toBe('string error');

    // Lock should still be released
    expect(mockKV.delete).toHaveBeenCalledWith('my-lock');
  });
});

// ============================================================================
// Concurrent Lock Attempts Tests
// ============================================================================

describe('concurrent lock attempts', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
    mockKV = createMockKV();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('one succeeds, one fails when acquiring same lock', async () => {
    // Simulate first acquire succeeding
    const result1 = await tryAcquireLock(mockKV, 'shared-lock', 60);
    expect(result1).toBe(true);

    // Second acquire should fail (lock is held)
    const result2 = await tryAcquireLock(mockKV, 'shared-lock', 60);
    expect(result2).toBe(false);
  });

  it('second attempt succeeds after first releases', async () => {
    // First worker acquires
    const result1 = await tryAcquireLock(mockKV, 'shared-lock', 60);
    expect(result1).toBe(true);

    // First worker releases
    await releaseLock(mockKV, 'shared-lock');

    // Second worker can now acquire
    const result2 = await tryAcquireLock(mockKV, 'shared-lock', 60);
    expect(result2).toBe(true);
  });

  it('withLock prevents concurrent execution when lock is already held', async () => {
    // Pre-acquire the lock to simulate worker1 holding it
    mockKV._store.set('critical-section', Date.now().toString());

    const executionOrder: string[] = [];

    // Worker2 tries to acquire the already-held lock
    const worker2Promise = withLock(mockKV, 'critical-section', 60, async () => {
      executionOrder.push('worker2-start');
      return 'worker2-result';
    });

    // Worker2 should fail because lock is held
    await expect(worker2Promise).rejects.toThrow('Failed to acquire lock');

    // Worker2's function should never have executed
    expect(executionOrder).toEqual([]);
  });

  it('sequential withLock calls work correctly', async () => {
    const results: string[] = [];

    // First call acquires and completes
    const result1 = await withLock(mockKV, 'seq-lock', 60, async () => {
      results.push('first');
      return 'result1';
    });

    // Lock should be released now, second call should work
    const result2 = await withLock(mockKV, 'seq-lock', 60, async () => {
      results.push('second');
      return 'result2';
    });

    expect(result1).toBe('result1');
    expect(result2).toBe('result2');
    expect(results).toEqual(['first', 'second']);
  });
});

// ============================================================================
// Lock Acquisition After Expiry Tests
// ============================================================================

describe('lock acquisition after expiry (simulated)', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  it('can acquire lock after simulating KV expiry', async () => {
    // First worker acquires
    const result1 = await tryAcquireLock(mockKV, 'expiring-lock', 5);
    expect(result1).toBe(true);

    // Simulate KV TTL expiry by clearing the store
    // (In real KV, this happens automatically after expirationTtl)
    mockKV._store.delete('expiring-lock');

    // Now second worker can acquire (simulates expiry happened)
    const result2 = await tryAcquireLock(mockKV, 'expiring-lock', 60);
    expect(result2).toBe(true);
  });

  it('expired locks do not block new acquisitions', async () => {
    // Simulate an expired lock scenario
    // In real KV, the key would be automatically deleted after TTL
    // We simulate this by not having the key present

    // First verify lock is not present
    expect(mockKV._store.has('possibly-expired-lock')).toBe(false);

    // Should be able to acquire
    const result = await tryAcquireLock(mockKV, 'possibly-expired-lock', 60);
    expect(result).toBe(true);
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('edge cases', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
    mockKV = createMockKV();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles lock keys with special characters', async () => {
    const specialKey = 'token:refresh:user@example.com:conn-123';

    const result = await tryAcquireLock(mockKV, specialKey, 60);

    expect(result).toBe(true);
    expect(mockKV.put).toHaveBeenCalledWith(specialKey, expect.any(String), expect.any(Object));
  });

  it('handles very long lock keys', async () => {
    const longKey = 'lock:' + 'a'.repeat(500);

    const result = await tryAcquireLock(mockKV, longKey, 60);

    expect(result).toBe(true);
    expect(mockKV.put).toHaveBeenCalledWith(longKey, expect.any(String), expect.any(Object));
  });

  it('handles lock value being non-timestamp string', async () => {
    // If someone manually set a non-timestamp value, should still detect as locked
    mockKV._store.set('manual-lock', 'not-a-timestamp');

    const result = await tryAcquireLock(mockKV, 'manual-lock', 60);

    expect(result).toBe(false);
  });

  it('handles multiple sequential lock/release cycles', async () => {
    for (let i = 0; i < 5; i++) {
      const acquired = await tryAcquireLock(mockKV, 'cycling-lock', 60);
      expect(acquired).toBe(true);

      await releaseLock(mockKV, 'cycling-lock');
      expect(mockKV._store.has('cycling-lock')).toBe(false);
    }

    expect(mockKV.put).toHaveBeenCalledTimes(5);
    expect(mockKV.delete).toHaveBeenCalledTimes(5);
  });

  it('withLock passes through error type correctly', async () => {
    class CustomError extends Error {
      code: string;
      constructor(message: string, code: string) {
        super(message);
        this.name = 'CustomError';
        this.code = code;
      }
    }

    const customError = new CustomError('Custom failure', 'CUSTOM_CODE');
    const fn = vi.fn().mockRejectedValue(customError);

    try {
      await withLock(mockKV, 'my-lock', 60, fn);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CustomError);
      expect((error as CustomError).code).toBe('CUSTOM_CODE');
    }

    // Lock should still be released
    expect(mockKV.delete).toHaveBeenCalledWith('my-lock');
  });

  it('handles zero TTL', async () => {
    // Zero TTL should still work (KV may treat as immediate expiry or error)
    const result = await tryAcquireLock(mockKV, 'zero-ttl-lock', 0);

    // Function should still be called
    expect(result).toBe(true);
    expect(mockKV.put).toHaveBeenCalledWith('zero-ttl-lock', expect.any(String), {
      expirationTtl: 0,
    });
  });
});

// ============================================================================
// Integration-style Tests
// ============================================================================

describe('integration scenarios', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
    mockKV = createMockKV();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('token refresh scenario - first worker wins', async () => {
    const connectionId = 'conn_abc123';
    const lockKey = `token:refresh:${connectionId}`;
    let refreshCount = 0;

    const refreshToken = async () => {
      refreshCount++;
      return { accessToken: 'new-token', expiresIn: 3600 };
    };

    // Worker 1 - gets the lock and refreshes
    const worker1 = await withLock(mockKV, lockKey, 30, refreshToken);
    expect(worker1).toEqual({ accessToken: 'new-token', expiresIn: 3600 });
    expect(refreshCount).toBe(1);
  });

  it('token refresh scenario - second worker skips when locked', async () => {
    const connectionId = 'conn_abc123';
    const lockKey = `token:refresh:${connectionId}`;
    let refreshCount = 0;

    // Simulate worker 1 holding the lock
    mockKV._store.set(lockKey, Date.now().toString());

    const refreshToken = async () => {
      refreshCount++;
      return { accessToken: 'new-token' };
    };

    // Worker 2 - should fail to acquire lock
    await expect(withLock(mockKV, lockKey, 30, refreshToken)).rejects.toThrow(
      `Failed to acquire lock: ${lockKey}`
    );

    // Refresh should not have been called
    expect(refreshCount).toBe(0);
  });

  it('cleanup pattern - release on both success and error', async () => {
    const lockKey = 'cleanup-test';

    // Successful case
    await withLock(mockKV, lockKey, 60, async () => 'success');
    expect(mockKV._store.has(lockKey)).toBe(false);

    // Error case
    await expect(
      withLock(mockKV, lockKey, 60, async () => {
        throw new Error('failure');
      })
    ).rejects.toThrow('failure');
    expect(mockKV._store.has(lockKey)).toBe(false);
  });
});
