/**
 * @zine/shared - Shared code across Zine apps
 *
 * This package contains:
 * - Domain types (Item, Source, UserItem)
 * - Sync types (Push/Pull requests, Mutations)
 * - Zod validation schemas
 * - Replicache mutators
 * - Key conventions and constants
 */

// ============================================================================
// Types
// ============================================================================

// Domain types and enums
export {
  ContentType,
  Provider,
  UserItemState,
  type Item,
  type UserItem,
  type Source,
  isContentType,
  isProvider,
  isUserItemState,
} from './types/domain';

// Sync types
export {
  SCHEMA_VERSION,
  type BaseMutation,
  type BookmarkItemMutation,
  type ArchiveItemMutation,
  type AddSourceMutation,
  type RemoveSourceMutation,
  type UpdateUserItemStateMutation,
  type Mutation,
  type PushRequest,
  type PushResponse,
  type PullCookie,
  type PullRequest,
  type PatchOperation,
  type PullResponse,
  type ClientMetadata,
} from './types/sync';

// ============================================================================
// Constants
// ============================================================================

export { ZINE_VERSION } from './constants';

export {
  KEY_PREFIX,
  itemKey,
  userItemKey,
  sourceKey,
  parseKeyType,
  parseKeyId,
  isItemKey,
  isUserItemKey,
  isSourceKey,
  itemScanPrefix,
  userItemScanPrefix,
  sourceScanPrefix,
} from './constants/keys';

// ============================================================================
// Schemas
// ============================================================================

export {
  // Enum schemas
  ContentTypeSchema,
  ProviderSchema,
  UserItemStateSchema,
  // Domain schemas
  ItemSchema,
  UserItemSchema,
  SourceSchema,
  // Mutation schemas
  BookmarkItemMutationSchema,
  ArchiveItemMutationSchema,
  AddSourceMutationSchema,
  RemoveSourceMutationSchema,
  UpdateUserItemStateMutationSchema,
  MutationSchema,
  // Sync schemas
  PullCookieSchema,
  PushRequestSchema,
  PushResponseSchema,
  PullRequestSchema,
  PatchOperationSchema,
  PullResponseSchema,
  ClientMetadataSchema,
  // Input types
  type ItemInput,
  type UserItemInput,
  type SourceInput,
  type PushRequestInput,
  type PullRequestInput,
} from './schemas';

// ============================================================================
// Mutators
// ============================================================================

export {
  mutators,
  type Mutators,
  type BookmarkItemArgs,
  type ArchiveItemArgs,
  type AddSourceArgs,
  type RemoveSourceArgs,
  type UpdateUserItemStateArgs,
} from './mutators';
