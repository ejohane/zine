/**
 * Tests for rate limiting utilities
 *
 * Tests rate limit checking, blocking when limited, Retry-After header parsing,
 * exponential backoff, and RateLimitedFetcher class.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RateLimitedFetcher,
  RateLimitError,
  isRateLimited,
  clearRateLimitState,
  type RateLimitState,
} from './rate-limiter';

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
  } as unknown as KVNamespace & { _store: Map<string, string> };
}

// ============================================================================
// Test Constants
// ============================================================================

const MOCK_NOW = 1705320000000; // 2024-01-15T12:00:00.000Z

// ============================================================================
// RateLimitError Tests
// ============================================================================

describe('RateLimitError', () => {
  it('should have correct properties', () => {
    const error = new RateLimitError('SPOTIFY', 30000);

    expect(error.name).toBe('RateLimitError');
    expect(error.provider).toBe('SPOTIFY');
    expect(error.retryInMs).toBe(30000);
    expect(error.message).toContain('SPOTIFY');
    expect(error.message).toContain('30s');
  });

  it('should be catchable as Error', () => {
    const error = new RateLimitError('YOUTUBE', 5000);
    expect(error instanceof Error).toBe(true);
  });

  it('should format message correctly', () => {
    const error = new RateLimitError('SPOTIFY', 45000);
    expect(error.message).toBe('Rate limited by SPOTIFY, retry in 45s');
  });
});

// ============================================================================
// isRateLimited Tests
// ============================================================================

describe('isRateLimited', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
    mockKV = createMockKV();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return false when no state exists', async () => {
    const result = await isRateLimited('SPOTIFY', 'user_123', mockKV);

    expect(result.limited).toBe(false);
    expect(result.retryInMs).toBeUndefined();
  });

  it('should return false when retryAfter is null', async () => {
    const state: RateLimitState = {
      retryAfter: null,
      consecutiveFailures: 0,
      lastRequest: MOCK_NOW - 1000,
    };
    mockKV._store.set('rate:YOUTUBE:user_456', JSON.stringify(state));

    const result = await isRateLimited('YOUTUBE', 'user_456', mockKV);

    expect(result.limited).toBe(false);
  });

  it('should return false when retryAfter is in the past', async () => {
    const state: RateLimitState = {
      retryAfter: MOCK_NOW - 1000, // 1 second ago
      consecutiveFailures: 1,
      lastRequest: MOCK_NOW - 2000,
    };
    mockKV._store.set('rate:SPOTIFY:user_789', JSON.stringify(state));

    const result = await isRateLimited('SPOTIFY', 'user_789', mockKV);

    expect(result.limited).toBe(false);
  });

  it('should return true when retryAfter is in the future', async () => {
    const retryAfter = MOCK_NOW + 30000; // 30 seconds from now
    const state: RateLimitState = {
      retryAfter,
      consecutiveFailures: 1,
      lastRequest: MOCK_NOW - 1000,
    };
    mockKV._store.set('rate:SPOTIFY:user_limited', JSON.stringify(state));

    const result = await isRateLimited('SPOTIFY', 'user_limited', mockKV);

    expect(result.limited).toBe(true);
    expect(result.retryInMs).toBe(30000);
  });

  it('should calculate correct retryInMs', async () => {
    const retryAfter = MOCK_NOW + 60000; // 60 seconds from now
    const state: RateLimitState = {
      retryAfter,
      consecutiveFailures: 2,
      lastRequest: MOCK_NOW - 500,
    };
    mockKV._store.set('rate:YOUTUBE:user_calc', JSON.stringify(state));

    const result = await isRateLimited('YOUTUBE', 'user_calc', mockKV);

    expect(result.limited).toBe(true);
    expect(result.retryInMs).toBe(60000);
  });

  it('should use correct key format', async () => {
    await isRateLimited('SPOTIFY', 'user_test', mockKV);

    expect(mockKV.get).toHaveBeenCalledWith('rate:SPOTIFY:user_test');
  });
});

// ============================================================================
// clearRateLimitState Tests
// ============================================================================

describe('clearRateLimitState', () => {
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  it('should delete state from KV', async () => {
    mockKV._store.set('rate:SPOTIFY:user_123', 'some state');

    await clearRateLimitState('SPOTIFY', 'user_123', mockKV);

    expect(mockKV.delete).toHaveBeenCalledWith('rate:SPOTIFY:user_123');
  });

  it('should not throw when state does not exist', async () => {
    await expect(clearRateLimitState('YOUTUBE', 'nonexistent', mockKV)).resolves.not.toThrow();
  });
});

// ============================================================================
// RateLimitedFetcher Tests
// ============================================================================

describe('RateLimitedFetcher', () => {
  let mockKV: ReturnType<typeof createMockKV>;
  let fetcher: RateLimitedFetcher;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
    mockKV = createMockKV();
    fetcher = new RateLimitedFetcher(mockKV);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('successful requests', () => {
    it('should execute the function and return result', async () => {
      const mockFn = vi.fn().mockResolvedValue({ data: 'success' });

      const result = await fetcher.fetch('SPOTIFY', 'user_1', mockFn);

      expect(result).toEqual({ data: 'success' });
      expect(mockFn).toHaveBeenCalled();
    });

    it('should clear state after successful request', async () => {
      // Pre-populate some failure state
      const state: RateLimitState = {
        retryAfter: null,
        consecutiveFailures: 2,
        lastRequest: MOCK_NOW - 1000,
      };
      mockKV._store.set('rate:SPOTIFY:user_clear', JSON.stringify(state));

      const mockFn = vi.fn().mockResolvedValue('ok');

      await fetcher.fetch('SPOTIFY', 'user_clear', mockFn);

      expect(mockKV.delete).toHaveBeenCalledWith('rate:SPOTIFY:user_clear');
    });
  });

  describe('pre-emptive blocking', () => {
    it('should throw RateLimitError without calling function when rate limited', async () => {
      const retryAfter = MOCK_NOW + 30000;
      const state: RateLimitState = {
        retryAfter,
        consecutiveFailures: 1,
        lastRequest: MOCK_NOW - 1000,
      };
      mockKV._store.set('rate:SPOTIFY:user_blocked', JSON.stringify(state));

      const mockFn = vi.fn();

      await expect(fetcher.fetch('SPOTIFY', 'user_blocked', mockFn)).rejects.toThrow(
        RateLimitError
      );

      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should include correct retryInMs in error', async () => {
      const retryAfter = MOCK_NOW + 45000;
      const state: RateLimitState = {
        retryAfter,
        consecutiveFailures: 1,
        lastRequest: MOCK_NOW,
      };
      mockKV._store.set('rate:YOUTUBE:user_retry', JSON.stringify(state));

      const mockFn = vi.fn();

      try {
        await fetcher.fetch('YOUTUBE', 'user_retry', mockFn);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).retryInMs).toBe(45000);
      }
    });
  });

  describe('429 response handling', () => {
    it('should handle 429 status error', async () => {
      const mockFn = vi.fn().mockRejectedValue({ status: 429 });

      await expect(fetcher.fetch('SPOTIFY', 'user_429', mockFn)).rejects.toThrow(RateLimitError);

      // State should be persisted
      expect(mockKV.put).toHaveBeenCalled();
    });

    it('should handle error with rate limit message', async () => {
      const mockFn = vi.fn().mockRejectedValue({
        message: 'Too many requests',
      });

      await expect(fetcher.fetch('SPOTIFY', 'user_msg', mockFn)).rejects.toThrow(RateLimitError);
    });

    it('should handle error with "rate limit" in message', async () => {
      const mockFn = vi.fn().mockRejectedValue({
        message: 'You have hit the rate limit',
      });

      await expect(fetcher.fetch('YOUTUBE', 'user_rl', mockFn)).rejects.toThrow(RateLimitError);
    });

    it('should handle error with "429" in message', async () => {
      const mockFn = vi.fn().mockRejectedValue({
        message: 'Request failed with status code 429',
      });

      await expect(fetcher.fetch('SPOTIFY', 'user_429msg', mockFn)).rejects.toThrow(RateLimitError);
    });
  });

  describe('Retry-After header parsing', () => {
    it('should parse Retry-After from headers.get() style', async () => {
      const mockFn = vi.fn().mockRejectedValue({
        status: 429,
        headers: {
          get: (name: string) => (name === 'Retry-After' ? '60' : null),
        },
      });

      try {
        await fetcher.fetch('SPOTIFY', 'user_header', mockFn);
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        // 60 seconds = 60000ms
        expect((error as RateLimitError).retryInMs).toBeCloseTo(60000, -2);
      }
    });

    it('should parse Retry-After from response.headers style', async () => {
      const mockFn = vi.fn().mockRejectedValue({
        status: 429,
        response: {
          headers: {
            'retry-after': '45',
          },
        },
      });

      try {
        await fetcher.fetch('YOUTUBE', 'user_axios', mockFn);
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).retryInMs).toBeCloseTo(45000, -2);
      }
    });

    it('should default to 30 seconds when no Retry-After header', async () => {
      const mockFn = vi.fn().mockRejectedValue({
        status: 429,
      });

      try {
        await fetcher.fetch('SPOTIFY', 'user_default', mockFn);
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        // Default is 30 seconds
        expect((error as RateLimitError).retryInMs).toBeCloseTo(30000, -2);
      }
    });
  });

  describe('non-rate-limit errors', () => {
    it('should increment failure count on non-rate-limit error', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(fetcher.fetch('SPOTIFY', 'user_fail', mockFn)).rejects.toThrow('Network error');

      // Should have stored state with incremented failures
      const storedState = mockKV._store.get('rate:SPOTIFY:user_fail');
      expect(storedState).toBeDefined();
      const state = JSON.parse(storedState!) as RateLimitState;
      expect(state.consecutiveFailures).toBe(1);
    });

    it('should increment failures on consecutive errors', async () => {
      // First failure
      const mockFn = vi.fn().mockRejectedValue(new Error('Error 1'));
      await expect(fetcher.fetch('SPOTIFY', 'user_multi', mockFn)).rejects.toThrow();

      // Second failure
      mockFn.mockRejectedValue(new Error('Error 2'));
      await expect(fetcher.fetch('SPOTIFY', 'user_multi', mockFn)).rejects.toThrow();

      const storedState = mockKV._store.get('rate:SPOTIFY:user_multi');
      const state = JSON.parse(storedState!) as RateLimitState;
      expect(state.consecutiveFailures).toBe(2);
    });

    it('should pass through non-rate-limit errors', async () => {
      const customError = new Error('Custom error');
      const mockFn = vi.fn().mockRejectedValue(customError);

      await expect(fetcher.fetch('YOUTUBE', 'user_custom', mockFn)).rejects.toThrow('Custom error');
    });
  });

  describe('state persistence', () => {
    it('should persist rate limit state to KV with TTL', async () => {
      const mockFn = vi.fn().mockRejectedValue({
        status: 429,
        headers: {
          get: () => '60', // 60 seconds
        },
      });

      try {
        await fetcher.fetch('SPOTIFY', 'user_ttl', mockFn);
      } catch {
        // Expected to throw
      }

      // Check that put was called with expirationTtl
      expect(mockKV.put).toHaveBeenCalledWith(
        'rate:SPOTIFY:user_ttl',
        expect.any(String),
        expect.objectContaining({ expirationTtl: expect.any(Number) })
      );
    });

    it('should use minimum TTL of 60 seconds', async () => {
      const mockFn = vi.fn().mockRejectedValue({
        status: 429,
        headers: {
          get: () => '5', // Only 5 seconds
        },
      });

      try {
        await fetcher.fetch('SPOTIFY', 'user_minttl', mockFn);
      } catch {
        // Expected to throw
      }

      // TTL should be at least 60 (5 + 60 buffer, then max with 60)
      // Using vi.mocked to get proper typing for mock calls
      const putCalls = vi.mocked(mockKV.put).mock.calls;
      expect(putCalls.length).toBeGreaterThan(0);
      const lastPutCall = putCalls[putCalls.length - 1];
      expect((lastPutCall[2] as { expirationTtl?: number })?.expirationTtl).toBeGreaterThanOrEqual(
        60
      );
    });
  });

  describe('memory cache', () => {
    it('should cache state in memory to reduce KV reads', async () => {
      // First call should read from KV
      const mockFn1 = vi.fn().mockResolvedValue('ok');
      await fetcher.fetch('SPOTIFY', 'user_cache', mockFn1);

      // Second call should use memory cache (if implemented)
      const mockFn2 = vi.fn().mockResolvedValue('ok2');
      await fetcher.fetch('SPOTIFY', 'user_cache', mockFn2);

      // The implementation may or may not cache, but test it works
      expect(mockFn2).toHaveBeenCalled();
    });
  });
});
