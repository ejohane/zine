/**
 * Sync Types for Zine
 *
 * Types for Replicache push/pull protocol and mutations.
 */

import type { Item, UserItem, Source, UserItemState } from './domain';

// ============================================================================
// Schema Version
// ============================================================================

/**
 * Current schema version.
 * Increment when making breaking changes to the data model.
 */
export const SCHEMA_VERSION = 1;

// ============================================================================
// Mutation Types
// ============================================================================

/**
 * Base mutation interface
 */
export interface BaseMutation {
  /** Unique ID for this mutation (for deduplication) */
  id: number;
  /** Mutation name */
  name: string;
  /** Arguments for the mutation */
  args: Record<string, unknown>;
  /** Client timestamp when mutation was created */
  timestamp: number;
}

/**
 * Bookmark an item mutation
 */
export interface BookmarkItemMutation extends BaseMutation {
  name: 'bookmarkItem';
  args: {
    userItemId: string;
  };
}

/**
 * Archive an item mutation
 */
export interface ArchiveItemMutation extends BaseMutation {
  name: 'archiveItem';
  args: {
    userItemId: string;
  };
}

/**
 * Add a source mutation
 */
export interface AddSourceMutation extends BaseMutation {
  name: 'addSource';
  args: {
    source: Omit<Source, 'createdAt'>;
  };
}

/**
 * Remove a source mutation
 */
export interface RemoveSourceMutation extends BaseMutation {
  name: 'removeSource';
  args: {
    sourceId: string;
  };
}

/**
 * Update user item state mutation
 */
export interface UpdateUserItemStateMutation extends BaseMutation {
  name: 'updateUserItemState';
  args: {
    userItemId: string;
    state: UserItemState;
  };
}

/**
 * Union of all mutation types
 */
export type Mutation =
  | BookmarkItemMutation
  | ArchiveItemMutation
  | AddSourceMutation
  | RemoveSourceMutation
  | UpdateUserItemStateMutation;

// ============================================================================
// Push Types
// ============================================================================

/**
 * Request body for Replicache push endpoint
 */
export interface PushRequest {
  /** Client group identifier */
  clientGroupID: string;
  /** Array of mutations to apply */
  mutations: Mutation[];
  /** Profile ID (Clerk user ID) */
  profileID: string;
  /** Schema version the client is using */
  schemaVersion?: number;
}

/**
 * Response body for Replicache push endpoint
 */
export interface PushResponse {
  /** Empty on success, error details on failure */
  error?: string;
}

// ============================================================================
// Pull Types
// ============================================================================

/**
 * Cookie for incremental sync
 */
export interface PullCookie {
  /** Server version at last pull */
  version: number;
  /** Schema version */
  schemaVersion: number;
}

/**
 * Request body for Replicache pull endpoint
 */
export interface PullRequest {
  /** Client group identifier */
  clientGroupID: string;
  /** Cookie from previous pull (null for initial sync) */
  cookie: PullCookie | null;
  /** Profile ID (Clerk user ID) */
  profileID: string;
  /** Schema version the client is using */
  schemaVersion?: number;
}

/**
 * A single patch operation
 */
export type PatchOperation =
  | { op: 'put'; key: string; value: Item | UserItem | Source }
  | { op: 'del'; key: string }
  | { op: 'clear' };

/**
 * Response body for Replicache pull endpoint
 */
export interface PullResponse {
  /** Cookie for next pull */
  cookie: PullCookie;
  /** Last mutation ID processed for each client */
  lastMutationIDChanges: Record<string, number>;
  /** Patch operations to apply */
  patch: PatchOperation[];
}

// ============================================================================
// Client Metadata
// ============================================================================

/**
 * Metadata about a Replicache client
 */
export interface ClientMetadata {
  /** Client ID */
  id: string;
  /** Client group ID */
  clientGroupID: string;
  /** Last mutation ID processed */
  lastMutationID: number;
  /** Last modified timestamp */
  lastModified: string;
}
