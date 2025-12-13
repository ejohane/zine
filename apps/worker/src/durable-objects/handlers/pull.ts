/**
 * /pull Handler for User Durable Object
 *
 * Returns changes since the client's last sync cookie.
 * Implements the server-side pull protocol:
 * https://doc.replicache.dev/guide/pull
 */

import type {
  PullRequest,
  PullResponse,
  PatchOperation,
  PullCookie,
  Item,
  UserItem,
  Source,
} from '@zine/shared';
import { SCHEMA_VERSION, itemKey, userItemKey, sourceKey } from '@zine/shared';

// ============================================================================
// Types
// ============================================================================

interface CanonicalItemRow {
  id: string;
  content_type: string;
  provider_id: string | null;
  canonical_url: string | null;
  title: string | null;
  summary: string | null;
  author: string | null;
  publisher: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  duration: number | null;
  created_at: string;
  updated_at: string;
}

interface UserItemRow {
  id: string;
  item_id: string;
  state: string;
  ingested_at: string;
  bookmarked_at: string | null;
  archived_at: string | null;
}

interface SourceRow {
  id: string;
  provider: string;
  provider_id: string;
  name: string;
  config: string | null;
  created_at: string;
}

interface ClientRow {
  id: string;
  last_mutation_id: number;
}

// ============================================================================
// Row Converters
// ============================================================================

function rowToItem(row: CanonicalItemRow): Item {
  return {
    id: row.id,
    contentType: row.content_type as Item['contentType'],
    providerId: row.provider_id ?? undefined,
    canonicalUrl: row.canonical_url ?? undefined,
    title: row.title ?? undefined,
    summary: row.summary ?? undefined,
    author: row.author ?? undefined,
    publisher: row.publisher ?? undefined,
    publishedAt: row.published_at ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    duration: row.duration ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToUserItem(row: UserItemRow): UserItem {
  return {
    id: row.id,
    itemId: row.item_id,
    state: row.state as UserItem['state'],
    ingestedAt: row.ingested_at,
    bookmarkedAt: row.bookmarked_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
  };
}

function rowToSource(row: SourceRow): Source {
  return {
    id: row.id,
    provider: row.provider as Source['provider'],
    providerId: row.provider_id,
    name: row.name,
    config: row.config ? JSON.parse(row.config) : undefined,
    createdAt: row.created_at,
  };
}

// ============================================================================
// Handler
// ============================================================================

/**
 * Handle a Replicache pull request
 *
 * @param sql - The SQLite storage API
 * @param request - The parsed PullRequest
 * @returns PullResponse with patch and cookie
 */
export function handlePull(sql: SqlStorage, request: PullRequest): PullResponse {
  const { clientGroupID, cookie } = request;

  // Get current server version
  const versionResult = sql
    .exec("SELECT value FROM replicache_meta WHERE key = 'version'")
    .toArray();
  const currentVersion =
    versionResult.length > 0 ? parseInt(versionResult[0].value as string, 10) : 0;

  // Get last mutation IDs for all clients in this group
  const clients = sql
    .exec(
      'SELECT id, last_mutation_id FROM replicache_clients WHERE client_group_id = ?',
      clientGroupID
    )
    .toArray() as unknown as ClientRow[];

  const lastMutationIDChanges: Record<string, number> = {};
  for (const client of clients) {
    // Extract the original client ID (remove the group prefix we added)
    const originalClientId = client.id.replace(`${clientGroupID}-`, '');
    lastMutationIDChanges[originalClientId] = client.last_mutation_id;
  }

  // Determine if we need a full sync or incremental
  const fromVersion = cookie?.version ?? 0;
  const patch: PatchOperation[] = [];

  // For simplicity, we do a full sync if:
  // - No cookie (first sync)
  // - Schema version mismatch
  // In production, you'd want incremental sync with change tracking
  const needsFullSync = !cookie || cookie.schemaVersion !== SCHEMA_VERSION || fromVersion === 0;

  if (needsFullSync) {
    // Clear operation for initial sync
    patch.push({ op: 'clear' });

    // Fetch all canonical items
    const items = sql
      .exec('SELECT * FROM canonical_items')
      .toArray() as unknown as CanonicalItemRow[];
    for (const row of items) {
      const item = rowToItem(row);
      patch.push({ op: 'put', key: itemKey(item.id), value: item });
    }

    // Fetch all user items
    const userItems = sql.exec('SELECT * FROM user_items').toArray() as unknown as UserItemRow[];
    for (const row of userItems) {
      const userItem = rowToUserItem(row);
      patch.push({ op: 'put', key: userItemKey(userItem.id), value: userItem });
    }

    // Fetch all sources
    const sources = sql.exec('SELECT * FROM sources').toArray() as unknown as SourceRow[];
    for (const row of sources) {
      const source = rowToSource(row);
      patch.push({ op: 'put', key: sourceKey(source.id), value: source });
    }
  }
  // TODO: Implement incremental sync with version tracking
  // For now, we only support full sync. Incremental sync would require:
  // 1. Tracking which rows changed since fromVersion
  // 2. Returning only the changed rows as put/del operations

  const newCookie: PullCookie = {
    version: currentVersion,
    schemaVersion: SCHEMA_VERSION,
  };

  return {
    cookie: newCookie,
    lastMutationIDChanges,
    patch,
  };
}
