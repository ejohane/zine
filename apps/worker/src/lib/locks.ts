/**
 * Distributed Lock Helpers
 *
 * Provides simple distributed locking using Cloudflare KV.
 * Used to prevent race conditions in distributed operations like token refresh.
 *
 * Note: KV is eventually consistent, so these locks are best-effort.
 * For most use cases (like token refresh), this provides sufficient protection
 * against concurrent operations without requiring stronger consistency guarantees.
 */

/**
 * Attempt to acquire a distributed lock
 *
 * @param kv - KV namespace to use for lock storage
 * @param key - Lock key (should be unique per resource being locked)
 * @param ttlSeconds - Time-to-live for the lock (auto-releases after this time)
 * @returns true if lock was acquired, false if already held by another process
 *
 * @example
 * ```typescript
 * const lockAcquired = await tryAcquireLock(env.OAUTH_STATE_KV, 'token:refresh:conn123', 30);
 * if (!lockAcquired) {
 *   // Another worker is handling this
 *   return;
 * }
 * try {
 *   // Do the exclusive work
 * } finally {
 *   await releaseLock(env.OAUTH_STATE_KV, 'token:refresh:conn123');
 * }
 * ```
 */
export async function tryAcquireLock(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number
): Promise<boolean> {
  // Check if lock already exists
  const existing = await kv.get(key);
  if (existing !== null) {
    // Lock is already held
    return false;
  }

  // Try to acquire the lock
  // Note: There's a small race window here since KV is eventually consistent.
  // For token refresh, this is acceptable - worst case is two refreshes happen,
  // and the second one just updates the DB with the same (or newer) tokens.
  await kv.put(key, Date.now().toString(), { expirationTtl: ttlSeconds });
  return true;
}

/**
 * Release a distributed lock
 *
 * @param kv - KV namespace containing the lock
 * @param key - Lock key to release
 *
 * @example
 * ```typescript
 * try {
 *   // Critical section
 * } finally {
 *   await releaseLock(env.OAUTH_STATE_KV, lockKey);
 * }
 * ```
 */
export async function releaseLock(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}

/**
 * Execute a function while holding a distributed lock
 *
 * A convenience wrapper that handles lock acquisition, execution, and release.
 * If the lock cannot be acquired, throws an error.
 *
 * @param kv - KV namespace to use for lock storage
 * @param key - Lock key
 * @param ttlSeconds - Time-to-live for the lock
 * @param fn - Function to execute while holding the lock
 * @returns The result of the function
 * @throws Error if lock cannot be acquired
 *
 * @example
 * ```typescript
 * const result = await withLock(
 *   env.OAUTH_STATE_KV,
 *   'token:refresh:conn123',
 *   30,
 *   async () => {
 *     // Exclusive operation
 *     return await refreshToken(connection);
 *   }
 * );
 * ```
 */
export async function withLock<T>(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const acquired = await tryAcquireLock(kv, key, ttlSeconds);
  if (!acquired) {
    throw new Error(`Failed to acquire lock: ${key}`);
  }

  try {
    return await fn();
  } finally {
    await releaseLock(kv, key);
  }
}
