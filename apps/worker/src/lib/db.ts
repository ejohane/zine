/**
 * SQLite helper utilities for Durable Objects
 */

/**
 * Run database migrations on the Durable Object's SQLite storage
 *
 * This function should be called when a Durable Object is first accessed
 * to ensure the schema is up to date.
 *
 * @param sql - The SQLite storage API from Durable Object state
 * @returns Promise that resolves when migrations are complete
 *
 * @example
 * ```typescript
 * export class UserDO extends DurableObject {
 *   async fetch(request: Request): Promise<Response> {
 *     await runMigrations(this.ctx.storage.sql);
 *     // ... handle request
 *   }
 * }
 * ```
 */
export async function runMigrations(sql: SqlStorage): Promise<void> {
  // TODO: Implement actual migrations in zine-hcb epic
  // This is a stub that will be expanded when UserDO is implemented

  // Create migrations tracking table if it doesn't exist
  sql.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migrations will be added here as the schema evolves
  // Each migration should check if it has already been applied
  // before running to ensure idempotency
}

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
