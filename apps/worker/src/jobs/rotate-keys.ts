/**
 * Encryption Key Rotation Job
 *
 * Re-encrypts OAuth tokens in provider_connections table with the current key version.
 * Designed for zero-downtime key rotation.
 *
 * Usage:
 * 1. Add new ENCRYPTION_KEY and ENCRYPTION_KEY_VERSION to environment
 * 2. Move old key to ENCRYPTION_KEY_PREVIOUS and ENCRYPTION_KEY_VERSION_PREVIOUS
 * 3. Deploy worker with both keys available
 * 4. Run this migration job
 * 5. After grace period, remove ENCRYPTION_KEY_PREVIOUS
 *
 * The migration is:
 * - Idempotent: Safe to run multiple times
 * - Incremental: Processes in batches for large datasets
 * - Resumable: Tracks progress via already-migrated records
 */

import { eq } from 'drizzle-orm';
import {
  type EncryptionKeys,
  decryptWithVersion,
  encryptWithVersion,
  isCurrentVersion,
  CryptoError,
} from '../lib/crypto';
import { providerConnections } from '../db/schema';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * Result of a key rotation job run
 */
export interface KeyRotationResult {
  /** Total connections processed */
  processed: number;
  /** Successfully migrated to current version */
  migrated: number;
  /** Already on current version (skipped) */
  skipped: number;
  /** Failed to migrate (logged, not fatal) */
  failed: number;
  /** Error details for failed records */
  errors: Array<{
    connectionId: string;
    error: string;
    code?: string;
  }>;
  /** Whether more records may need processing */
  hasMore: boolean;
}

/**
 * Options for the key rotation job
 */
export interface KeyRotationOptions {
  /** Batch size for processing (default: 100) */
  batchSize?: number;
  /** Whether to continue on errors (default: true) */
  continueOnError?: boolean;
  /** Dry run - log what would be done without making changes (default: false) */
  dryRun?: boolean;
}

/**
 * Migrate provider_connections tokens to current encryption key version
 *
 * This function:
 * 1. Fetches a batch of connections
 * 2. Checks each token's version
 * 3. Re-encrypts tokens not using current version
 * 4. Updates records in individual transactions for safety
 *
 * @param db - Drizzle D1 database instance
 * @param keys - Encryption keys from getEncryptionKeys()
 * @param options - Migration options
 * @returns Result summary
 *
 * @example
 * ```typescript
 * // In a cron handler or admin endpoint
 * const keys = getEncryptionKeys(env);
 * const result = await migrateEncryptionKeys(db, keys, { batchSize: 50 });
 *
 * console.log(`Migrated ${result.migrated}/${result.processed} connections`);
 *
 * // Run until complete
 * while (result.hasMore) {
 *   result = await migrateEncryptionKeys(db, keys);
 * }
 * ```
 */
export async function migrateEncryptionKeys(
  db: DrizzleD1Database,
  keys: EncryptionKeys,
  options: KeyRotationOptions = {}
): Promise<KeyRotationResult> {
  const { batchSize = 100, continueOnError = true, dryRun = false } = options;

  const result: KeyRotationResult = {
    processed: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    hasMore: false,
  };

  // Fetch a batch of connections
  // Note: We fetch batchSize + 1 to detect if there are more records
  const connections = await db
    .select({
      id: providerConnections.id,
      accessToken: providerConnections.accessToken,
      refreshToken: providerConnections.refreshToken,
    })
    .from(providerConnections)
    .limit(batchSize + 1);

  // Check if there are more records beyond this batch
  if (connections.length > batchSize) {
    result.hasMore = true;
    connections.pop(); // Remove the extra record
  }

  for (const connection of connections) {
    result.processed++;

    try {
      // Check if tokens are already on current version
      const accessCurrent = isCurrentVersion(connection.accessToken, keys);
      const refreshCurrent = isCurrentVersion(connection.refreshToken, keys);

      if (accessCurrent && refreshCurrent) {
        result.skipped++;
        continue;
      }

      if (dryRun) {
        result.migrated++;
        continue;
      }

      // Decrypt with available keys
      const [decryptedAccess, decryptedRefresh] = await Promise.all([
        accessCurrent
          ? Promise.resolve(null) // Don't re-decrypt if already current
          : decryptWithVersion(connection.accessToken, keys),
        refreshCurrent ? Promise.resolve(null) : decryptWithVersion(connection.refreshToken, keys),
      ]);

      // Re-encrypt with current key
      const [newAccessToken, newRefreshToken] = await Promise.all([
        decryptedAccess ? encryptWithVersion(decryptedAccess, keys) : null,
        decryptedRefresh ? encryptWithVersion(decryptedRefresh, keys) : null,
      ]);

      // Build update object
      const updateFields: Record<string, string> = {};
      if (newAccessToken) updateFields.accessToken = newAccessToken;
      if (newRefreshToken) updateFields.refreshToken = newRefreshToken;

      // Update the connection
      if (Object.keys(updateFields).length > 0) {
        await db
          .update(providerConnections)
          .set(updateFields)
          .where(eq(providerConnections.id, connection.id));
      }

      result.migrated++;
    } catch (error) {
      result.failed++;

      const errorInfo = {
        connectionId: connection.id,
        error: error instanceof Error ? error.message : String(error),
        code: error instanceof CryptoError ? error.code : undefined,
      };

      result.errors.push(errorInfo);

      // Log the error for monitoring
      console.error(`[rotate-keys] Failed to migrate connection ${connection.id}:`, errorInfo);

      if (!continueOnError) {
        throw error;
      }
    }
  }

  return result;
}

/**
 * Run complete key rotation until all records are migrated
 *
 * Convenience function that calls migrateEncryptionKeys in a loop
 * until all records are processed.
 *
 * @param db - Drizzle D1 database instance
 * @param keys - Encryption keys from getEncryptionKeys()
 * @param options - Migration options
 * @returns Aggregated result summary
 *
 * @example
 * ```typescript
 * const keys = getEncryptionKeys(env);
 * const result = await runFullKeyRotation(db, keys);
 * console.log(`Complete! Migrated ${result.migrated} of ${result.processed} connections`);
 * ```
 */
export async function runFullKeyRotation(
  db: DrizzleD1Database,
  keys: EncryptionKeys,
  options: KeyRotationOptions = {}
): Promise<KeyRotationResult> {
  const aggregated: KeyRotationResult = {
    processed: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    hasMore: false,
  };

  let batchResult: KeyRotationResult;

  do {
    batchResult = await migrateEncryptionKeys(db, keys, options);

    aggregated.processed += batchResult.processed;
    aggregated.migrated += batchResult.migrated;
    aggregated.skipped += batchResult.skipped;
    aggregated.failed += batchResult.failed;
    aggregated.errors.push(...batchResult.errors);
  } while (batchResult.hasMore);

  return aggregated;
}

/**
 * Verify all tokens use the current key version
 *
 * Useful for confirming migration is complete before removing old key.
 *
 * @param db - Drizzle D1 database instance
 * @param keys - Encryption keys from getEncryptionKeys()
 * @returns Verification result with counts
 *
 * @example
 * ```typescript
 * const verification = await verifyKeyRotation(db, keys);
 * if (verification.outdatedCount === 0) {
 *   console.log('Safe to remove ENCRYPTION_KEY_PREVIOUS');
 * } else {
 *   console.log(`${verification.outdatedCount} records still need migration`);
 * }
 * ```
 */
export async function verifyKeyRotation(
  db: DrizzleD1Database,
  keys: EncryptionKeys
): Promise<{
  totalCount: number;
  currentVersionCount: number;
  outdatedCount: number;
  errorCount: number;
}> {
  const connections = await db
    .select({
      id: providerConnections.id,
      accessToken: providerConnections.accessToken,
      refreshToken: providerConnections.refreshToken,
    })
    .from(providerConnections);

  let currentVersionCount = 0;
  let outdatedCount = 0;
  let errorCount = 0;

  for (const connection of connections) {
    try {
      const accessCurrent = isCurrentVersion(connection.accessToken, keys);
      const refreshCurrent = isCurrentVersion(connection.refreshToken, keys);

      if (accessCurrent && refreshCurrent) {
        currentVersionCount++;
      } else {
        outdatedCount++;
      }
    } catch {
      errorCount++;
    }
  }

  return {
    totalCount: connections.length,
    currentVersionCount,
    outdatedCount,
    errorCount,
  };
}
