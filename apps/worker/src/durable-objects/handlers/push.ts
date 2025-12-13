/**
 * /push Handler for User Durable Object
 *
 * Processes Replicache mutations and applies them to SQLite storage.
 * Implements the server-side push protocol:
 * https://doc.replicache.dev/guide/push
 */

import type { PushRequest, PushResponse, Mutation, Source } from '@zine/shared';
import { UserItemState } from '@zine/shared';

// ============================================================================
// Types
// ============================================================================

interface MutationContext {
  sql: SqlStorage;
  now: string;
}

// ============================================================================
// Mutation Processors
// ============================================================================

/**
 * Process a bookmarkItem mutation
 */
function processBookmarkItem(ctx: MutationContext, args: { userItemId: string }): void {
  const { sql, now } = ctx;

  sql.exec(
    `UPDATE user_items 
     SET state = ?, bookmarked_at = ?, archived_at = NULL
     WHERE id = ?`,
    UserItemState.BOOKMARKED,
    now,
    args.userItemId
  );
}

/**
 * Process an archiveItem mutation
 */
function processArchiveItem(ctx: MutationContext, args: { userItemId: string }): void {
  const { sql, now } = ctx;

  sql.exec(
    `UPDATE user_items 
     SET state = ?, archived_at = ?
     WHERE id = ?`,
    UserItemState.ARCHIVED,
    now,
    args.userItemId
  );
}

/**
 * Process an addSource mutation
 */
function processAddSource(ctx: MutationContext, args: { source: Omit<Source, 'createdAt'> }): void {
  const { sql, now } = ctx;
  const { source } = args;

  sql.exec(
    `INSERT OR REPLACE INTO sources (id, provider, provider_id, name, config, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    source.id,
    source.provider,
    source.providerId,
    source.name,
    source.config ? JSON.stringify(source.config) : null,
    now
  );
}

/**
 * Process a removeSource mutation
 */
function processRemoveSource(ctx: MutationContext, args: { sourceId: string }): void {
  const { sql } = ctx;

  sql.exec('DELETE FROM sources WHERE id = ?', args.sourceId);
}

/**
 * Process an updateUserItemState mutation
 */
function processUpdateUserItemState(
  ctx: MutationContext,
  args: { userItemId: string; state: UserItemState }
): void {
  const { sql, now } = ctx;

  // Determine which timestamp to update based on state
  let bookmarkedAt = null;
  let archivedAt = null;

  if (args.state === UserItemState.BOOKMARKED) {
    bookmarkedAt = now;
  } else if (args.state === UserItemState.ARCHIVED) {
    archivedAt = now;
  }

  sql.exec(
    `UPDATE user_items 
     SET state = ?,
         bookmarked_at = COALESCE(?, bookmarked_at),
         archived_at = COALESCE(?, archived_at)
     WHERE id = ?`,
    args.state,
    bookmarkedAt,
    archivedAt,
    args.userItemId
  );
}

/**
 * Process a single mutation by dispatching to the appropriate handler
 */
function processMutation(ctx: MutationContext, mutation: Mutation): void {
  switch (mutation.name) {
    case 'bookmarkItem':
      processBookmarkItem(ctx, mutation.args);
      break;
    case 'archiveItem':
      processArchiveItem(ctx, mutation.args);
      break;
    case 'addSource':
      processAddSource(ctx, mutation.args);
      break;
    case 'removeSource':
      processRemoveSource(ctx, mutation.args);
      break;
    case 'updateUserItemState':
      processUpdateUserItemState(ctx, mutation.args);
      break;
    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = mutation;
      console.warn('Unknown mutation:', (_exhaustive as Mutation).name);
    }
  }
}

// ============================================================================
// Handler
// ============================================================================

/**
 * Handle a Replicache push request
 *
 * @param sql - The SQLite storage API
 * @param request - The parsed PushRequest
 * @returns PushResponse
 */
export function handlePush(sql: SqlStorage, request: PushRequest): PushResponse {
  const { clientGroupID, mutations } = request;
  const now = new Date().toISOString();
  const ctx: MutationContext = { sql, now };

  // Process each mutation
  for (const mutation of mutations) {
    // Get or create client record
    const clientId = `${clientGroupID}-${mutation.id}`;
    const existing = sql
      .exec('SELECT last_mutation_id FROM replicache_clients WHERE id = ?', clientId)
      .toArray();

    const lastMutationId = existing.length > 0 ? (existing[0].last_mutation_id as number) : 0;

    // Skip if we've already processed this mutation
    if (mutation.id <= lastMutationId) {
      continue;
    }

    // Process the mutation
    try {
      processMutation(ctx, mutation);
    } catch (error) {
      console.error(`Error processing mutation ${mutation.id}:`, error);
      return { error: `Mutation ${mutation.id} failed: ${error}` };
    }

    // Update client's last mutation ID
    sql.exec(
      `INSERT INTO replicache_clients (id, client_group_id, last_mutation_id, last_modified)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_mutation_id = excluded.last_mutation_id,
         last_modified = excluded.last_modified`,
      clientId,
      clientGroupID,
      mutation.id,
      now
    );
  }

  // Increment global version
  sql.exec(
    `UPDATE replicache_meta 
     SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) 
     WHERE key = 'version'`
  );

  return {};
}
