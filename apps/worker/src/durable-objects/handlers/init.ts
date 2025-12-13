/**
 * /init Handler for User Durable Object
 *
 * Runs migrations and initializes the replicache_meta table.
 * Can also initialize user profile from Clerk webhook data.
 */

import { migrations, CURRENT_SCHEMA_VERSION } from '../schema';
import { isMigrationApplied, markMigrationApplied } from '../../lib/db';

// ============================================================================
// Types
// ============================================================================

export interface InitRequest {
  /** User ID from Clerk */
  userId?: string;
  /** User email */
  email?: string;
  /** User's first name */
  firstName?: string | null;
  /** User's last name */
  lastName?: string | null;
  /** User's profile image URL */
  imageUrl?: string | null;
  /** When the user was created */
  createdAt?: string;
}

export interface InitResponse {
  success: boolean;
  schemaVersion: number;
  migrationsApplied: string[];
  profileUpdated?: boolean;
}

// ============================================================================
// Handler
// ============================================================================

/**
 * Initialize the Durable Object's SQLite database
 *
 * - Creates the migrations tracking table
 * - Runs any pending migrations in order
 * - Optionally stores user profile from Clerk
 * - Returns the current schema version
 *
 * @param sql - The SQLite storage API from Durable Object context
 * @param request - Optional user profile data from Clerk webhook
 * @returns InitResponse with migration status
 */
export function handleInit(sql: SqlStorage, request?: InitRequest): InitResponse {
  const migrationsApplied: string[] = [];

  // Ensure migrations table exists
  sql.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Run pending migrations in version order
  const sortedMigrations = [...migrations].sort((a, b) => a.version - b.version);

  for (const migration of sortedMigrations) {
    if (!isMigrationApplied(sql, migration.name)) {
      // Execute migration SQL
      sql.exec(migration.up);

      // Mark as applied
      markMigrationApplied(sql, migration.name);
      migrationsApplied.push(migration.name);
    }
  }

  // Store user profile if provided
  let profileUpdated = false;
  if (request?.userId) {
    sql.exec(
      `INSERT OR REPLACE INTO user_profile (
        id, email, first_name, last_name, image_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      request.userId,
      request.email ?? null,
      request.firstName ?? null,
      request.lastName ?? null,
      request.imageUrl ?? null,
      request.createdAt ?? new Date().toISOString()
    );
    profileUpdated = true;
  }

  return {
    success: true,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    migrationsApplied,
    profileUpdated,
  };
}
