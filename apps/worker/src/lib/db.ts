/**
 * SQLite helper utilities for Durable Objects
 *
 * This module provides low-level migration tracking functions.
 * For the full migration system, see durable-objects/schema.ts
 * and durable-objects/handlers/init.ts
 */

/**
 * Check if a specific migration has been applied
 *
 * @param sql - The SQLite storage API
 * @param migrationName - Name of the migration to check
 * @returns True if the migration has been applied
 */
export function isMigrationApplied(sql: SqlStorage, migrationName: string): boolean {
  const result = sql.exec('SELECT 1 FROM _migrations WHERE name = ?', migrationName);
  return result.toArray().length > 0;
}

/**
 * Mark a migration as applied
 *
 * @param sql - The SQLite storage API
 * @param migrationName - Name of the migration to mark as applied
 */
export function markMigrationApplied(sql: SqlStorage, migrationName: string): void {
  sql.exec('INSERT OR IGNORE INTO _migrations (name) VALUES (?)', migrationName);
}

/**
 * Get the current version number from replicache_meta
 *
 * @param sql - The SQLite storage API
 * @returns The current version number, or 0 if not set
 */
export function getVersion(sql: SqlStorage): number {
  const result = sql.exec("SELECT value FROM replicache_meta WHERE key = 'version'").toArray();
  return result.length > 0 ? parseInt(result[0].value as string, 10) : 0;
}

/**
 * Increment the version number in replicache_meta
 *
 * @param sql - The SQLite storage API
 * @returns The new version number
 */
export function incrementVersion(sql: SqlStorage): number {
  sql.exec(
    `UPDATE replicache_meta 
     SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) 
     WHERE key = 'version'`
  );
  return getVersion(sql);
}
