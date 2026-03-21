/**
 * Rate Limiting Utilities
 *
 * Provider-aware rate limiting with exponential backoff for external API calls.
 * Handles rate limit responses from providers (YouTube, Spotify) and maintains
 * state in Cloudflare KV for cross-worker consistency.
 *
 * Provider-specific behaviors:
 * - YouTube: Quota-based (10K units/day), rare 429s
 * - Spotify: Rolling 30-second window (~100-180 requests), returns 429 with Retry-After
 */

import { logger } from './logger';

const rateLimitLogger = logger.child('rate-limiter');
const DEFAULT_RETRY_AFTER_MS = 30 * 1000;

function createDefaultRateLimitState(): RateLimitState {
  return {
    retryAfter: null,
    consecutiveFailures: 0,
    lastRequest: 0,
  };
}

function isValidRateLimitState(value: unknown): value is RateLimitState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const state = value as Record<string, unknown>;
  const retryAfterIsValid =
    state.retryAfter === null ||
    (typeof state.retryAfter === 'number' &&
      Number.isFinite(state.retryAfter) &&
      state.retryAfter >= 0);

  return (
    retryAfterIsValid &&
    typeof state.consecutiveFailures === 'number' &&
    Number.isFinite(state.consecutiveFailures) &&
    state.consecutiveFailures >= 0 &&
    typeof state.lastRequest === 'number' &&
    Number.isFinite(state.lastRequest) &&
    state.lastRequest >= 0
  );
}

async function readStoredRateLimitState(
  key: string,
  kv: Pick<KVNamespace, 'delete'>,
  stored: string | null
): Promise<RateLimitState> {
  if (!stored) {
    return createDefaultRateLimitState();
  }

  try {
    const parsed = JSON.parse(stored);
    if (isValidRateLimitState(parsed)) {
      return parsed;
    }
  } catch (error) {
    rateLimitLogger.warn('Failed to parse stored rate limit state', { key, error });
    await kv.delete(key);
    return createDefaultRateLimitState();
  }

  rateLimitLogger.warn('Ignoring invalid stored rate limit state shape', { key });
  await kv.delete(key);
  return createDefaultRateLimitState();
}

function readHeaderValue(headers: unknown, headerName: string): string | undefined {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  const headersWithGet = headers as { get?: (name: string) => string | null };
  if (typeof headersWithGet.get === 'function') {
    return headersWithGet.get(headerName) ?? undefined;
  }

  const lowerHeaderName = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() === lowerHeaderName && typeof value === 'string') {
      return value;
    }
  }

  return undefined;
}

function parseRetryAfterHeader(retryAfterHeader: string, now: number): number | null {
  const trimmed = retryAfterHeader.trim();
  if (!trimmed) {
    return null;
  }

  const retryAfterSeconds = Number(trimmed);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return now + retryAfterSeconds * 1000;
  }

  const retryAfterDate = Date.parse(trimmed);
  if (Number.isFinite(retryAfterDate) && retryAfterDate > now) {
    return retryAfterDate;
  }

  return null;
}

/**
 * State tracked per provider/user combination
 */
export interface RateLimitState {
  /** Unix timestamp (ms) when we can retry, or null if not rate limited */
  retryAfter: number | null;
  /** Number of consecutive failures (resets on success) */
  consecutiveFailures: number;
  /** Unix timestamp (ms) of last request attempt */
  lastRequest: number;
}

/**
 * Error thrown when a request is rate limited
 *
 * @example
 * ```typescript
 * try {
 *   await fetcher.fetch('SPOTIFY', userId, () => spotifyApi.getEpisodes());
 * } catch (error) {
 *   if (error instanceof RateLimitError) {
 *     console.log(`Rate limited, retry in ${Math.ceil(error.retryInMs / 1000)}s`);
 *   }
 * }
 * ```
 */
export class RateLimitError extends Error {
  constructor(
    public provider: string,
    public retryInMs: number
  ) {
    super(`Rate limited by ${provider}, retry in ${Math.ceil(retryInMs / 1000)}s`);
    this.name = 'RateLimitError';
  }
}

/**
 * Rate-limited fetcher that wraps provider API calls
 *
 * Features:
 * - Pre-emptive blocking when rate limited
 * - Parses Retry-After headers from provider responses
 * - Exponential backoff with jitter on failures
 * - Persists state to KV for cross-worker consistency
 * - In-memory cache to reduce KV reads
 *
 * @example
 * ```typescript
 * const fetcher = new RateLimitedFetcher(env.OAUTH_STATE_KV);
 *
 * try {
 *   const episodes = await fetcher.fetch('SPOTIFY', userId, async () => {
 *     return await spotifyApi.shows.getShowEpisodes(showId);
 *   });
 * } catch (error) {
 *   if (error instanceof RateLimitError) {
 *     // Skip this user for now, retry later
 *     return;
 *   }
 *   throw error;
 * }
 * ```
 */
export class RateLimitedFetcher {
  private memoryState: Map<string, RateLimitState> = new Map();

  constructor(private kv: KVNamespace) {}

  /**
   * Execute a provider API call with rate limit handling
   *
   * @param provider - Provider identifier (e.g., 'YOUTUBE', 'SPOTIFY')
   * @param userId - User ID for per-user rate limiting
   * @param fn - Async function that makes the actual API call
   * @returns The result of the API call
   * @throws {RateLimitError} If currently rate limited or provider returns 429
   */
  async fetch<T>(provider: string, userId: string, fn: () => Promise<T>): Promise<T> {
    const key = `rate:${provider}:${userId}`;

    // 1. Check if we're rate limited
    const state = await this.getState(key);
    if (state.retryAfter && Date.now() < state.retryAfter) {
      const waitMs = state.retryAfter - Date.now();
      throw new RateLimitError(provider, waitMs);
    }

    // 2. Execute request
    try {
      const result = await fn();

      // 3. Clear failure count on success
      await this.clearState(key);
      return result;
    } catch (error: unknown) {
      // 4. Handle rate limit response
      if (this.isRateLimitError(error)) {
        const retryAfter = this.parseRetryAfter(error);
        await this.setRateLimited(key, retryAfter);
        throw new RateLimitError(provider, retryAfter - Date.now());
      }

      // 5. Exponential backoff on other errors
      const newState = await this.incrementFailures(key);
      const backoffMs = this.calculateBackoff(newState.consecutiveFailures);
      rateLimitLogger.warn('Request failed, backing off', { backoffMs, error });

      throw error;
    }
  }

  /**
   * Check if an error indicates rate limiting
   */
  private isRateLimitError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const err = error as Record<string, unknown>;

    // Check HTTP status
    if (err.status === 429) {
      return true;
    }

    // Check error message
    const message = typeof err.message === 'string' ? err.message : '';
    return (
      message.includes('429') ||
      message.toLowerCase().includes('rate limit') ||
      message.toLowerCase().includes('too many requests')
    );
  }

  /**
   * Parse Retry-After value from error response
   *
   * Handles:
   * - Retry-After header as seconds
   * - Error response with retry-after field
   * - Default fallback of 30 seconds
   */
  private parseRetryAfter(error: unknown): number {
    const now = Date.now();

    if (!error || typeof error !== 'object') {
      return now + DEFAULT_RETRY_AFTER_MS;
    }

    const err = error as Record<string, unknown>;

    const retryAfterHeader =
      readHeaderValue(err.headers, 'Retry-After') ??
      (err.response && typeof err.response === 'object'
        ? readHeaderValue((err.response as Record<string, unknown>).headers, 'Retry-After')
        : undefined);

    if (retryAfterHeader) {
      const retryAfter = parseRetryAfterHeader(retryAfterHeader, now);
      if (retryAfter !== null) {
        return retryAfter;
      }
    }

    // Default: 30 seconds
    return now + DEFAULT_RETRY_AFTER_MS;
  }

  /**
   * Calculate backoff time using exponential backoff with jitter
   *
   * Formula: min(2^failures * 1000ms + random(0-1000ms), 300000ms)
   * - Starts at ~1-2 seconds
   * - Caps at 5 minutes
   * - Jitter prevents thundering herd
   */
  private calculateBackoff(failures: number): number {
    // Exponential backoff: 2^n * 1000ms + jitter (0-1000ms)
    // Max: 5 minutes (300000ms)
    const base = Math.min(Math.pow(2, failures) * 1000, 300000);
    const jitter = Math.random() * 1000;
    return base + jitter;
  }

  /**
   * Get rate limit state from memory cache or KV
   */
  private async getState(key: string): Promise<RateLimitState> {
    const cached = this.memoryState.get(key);
    if (cached) return cached;

    const stored = await this.kv.get(key);
    const state = await readStoredRateLimitState(key, this.kv, stored);

    this.memoryState.set(key, state);
    return state;
  }

  /**
   * Mark as rate limited with retry timestamp
   */
  private async setRateLimited(key: string, retryAfter: number): Promise<void> {
    const state = await this.getState(key);
    state.retryAfter = retryAfter;
    state.consecutiveFailures++;
    this.memoryState.set(key, state);

    // TTL = time until retry + 60s buffer
    const ttl = Math.ceil((retryAfter - Date.now()) / 1000) + 60;
    await this.kv.put(key, JSON.stringify(state), { expirationTtl: Math.max(ttl, 60) });
  }

  /**
   * Increment failure count and update last request time
   */
  private async incrementFailures(key: string): Promise<RateLimitState> {
    const state = await this.getState(key);
    state.consecutiveFailures++;
    state.lastRequest = Date.now();
    this.memoryState.set(key, state);

    // Keep state for 1 hour
    await this.kv.put(key, JSON.stringify(state), { expirationTtl: 3600 });
    return state;
  }

  /**
   * Clear rate limit state (called on successful request)
   */
  private async clearState(key: string): Promise<void> {
    this.memoryState.delete(key);
    await this.kv.delete(key);
  }
}

/**
 * Pre-emptive check if a provider/user combination is rate limited
 *
 * Use this before attempting to process a user's subscriptions
 * to skip rate-limited users without making API calls.
 *
 * @example
 * ```typescript
 * for (const [userId, userSubs] of Object.entries(byUser)) {
 *   const rateCheck = await isRateLimited('YOUTUBE', userId, env.OAUTH_STATE_KV);
 *   if (rateCheck.limited) {
 *     console.log(`Skipping user ${userId}: rate limited for ${rateCheck.retryInMs}ms`);
 *     continue;
 *   }
 *   // ... process user's subscriptions
 * }
 * ```
 *
 * @param provider - Provider identifier (e.g., 'YOUTUBE', 'SPOTIFY')
 * @param userId - User ID to check
 * @param kv - KV namespace containing rate limit state
 * @returns Object indicating if limited and time until retry
 */
export async function isRateLimited(
  provider: string,
  userId: string,
  kv: KVNamespace
): Promise<{ limited: boolean; retryInMs?: number }> {
  const key = `rate:${provider}:${userId}`;
  const stored = await kv.get(key);

  if (!stored) return { limited: false };

  const state = await readStoredRateLimitState(key, kv, stored);
  if (!state.retryAfter || Date.now() >= state.retryAfter) {
    return { limited: false };
  }

  return {
    limited: true,
    retryInMs: state.retryAfter - Date.now(),
  };
}

/**
 * Clear rate limit state for a provider/user
 *
 * Useful for manual recovery or testing.
 *
 * @param provider - Provider identifier
 * @param userId - User ID
 * @param kv - KV namespace
 */
export async function clearRateLimitState(
  provider: string,
  userId: string,
  kv: KVNamespace
): Promise<void> {
  const key = `rate:${provider}:${userId}`;
  await kv.delete(key);
}
