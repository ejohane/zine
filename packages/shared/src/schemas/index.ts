/**
 * Zod Schemas for Zine
 *
 * Runtime validation schemas matching all exported types.
 */

import { z } from 'zod';
import { ContentType, Provider, UserItemState } from '../types/domain';
import { SCHEMA_VERSION } from '../types/sync';

// ============================================================================
// Enum Schemas
// ============================================================================

export const ContentTypeSchema = z.nativeEnum(ContentType);

export const ProviderSchema = z.nativeEnum(Provider);

export const UserItemStateSchema = z.nativeEnum(UserItemState);

// ============================================================================
// Domain Model Schemas
// ============================================================================

/**
 * Schema for Item
 */
export const ItemSchema = z.object({
  id: z.string().min(1),
  contentType: ContentTypeSchema,
  providerId: z.string().optional(),
  canonicalUrl: z.string().url().optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  author: z.string().optional(),
  publisher: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
  thumbnailUrl: z.string().url().optional(),
  duration: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Schema for UserItem
 */
export const UserItemSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  state: UserItemStateSchema,
  ingestedAt: z.string().datetime(),
  bookmarkedAt: z.string().datetime().optional(),
  archivedAt: z.string().datetime().optional(),
});

/**
 * Schema for Source
 */
export const SourceSchema = z.object({
  id: z.string().min(1),
  provider: ProviderSchema,
  providerId: z.string().min(1),
  name: z.string().min(1),
  config: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
});

// ============================================================================
// Mutation Schemas
// ============================================================================

/**
 * Base mutation schema
 */
const BaseMutationSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  args: z.record(z.unknown()),
  timestamp: z.number().int(),
});

/**
 * Schema for bookmarkItem mutation
 */
export const BookmarkItemMutationSchema = BaseMutationSchema.extend({
  name: z.literal('bookmarkItem'),
  args: z.object({
    userItemId: z.string().min(1),
  }),
});

/**
 * Schema for archiveItem mutation
 */
export const ArchiveItemMutationSchema = BaseMutationSchema.extend({
  name: z.literal('archiveItem'),
  args: z.object({
    userItemId: z.string().min(1),
  }),
});

/**
 * Schema for addSource mutation
 */
export const AddSourceMutationSchema = BaseMutationSchema.extend({
  name: z.literal('addSource'),
  args: z.object({
    source: SourceSchema.omit({ createdAt: true }),
  }),
});

/**
 * Schema for removeSource mutation
 */
export const RemoveSourceMutationSchema = BaseMutationSchema.extend({
  name: z.literal('removeSource'),
  args: z.object({
    sourceId: z.string().min(1),
  }),
});

/**
 * Schema for updateUserItemState mutation
 */
export const UpdateUserItemStateMutationSchema = BaseMutationSchema.extend({
  name: z.literal('updateUserItemState'),
  args: z.object({
    userItemId: z.string().min(1),
    state: UserItemStateSchema,
  }),
});

/**
 * Union schema for all mutations
 */
export const MutationSchema = z.discriminatedUnion('name', [
  BookmarkItemMutationSchema,
  ArchiveItemMutationSchema,
  AddSourceMutationSchema,
  RemoveSourceMutationSchema,
  UpdateUserItemStateMutationSchema,
]);

// ============================================================================
// Sync Request/Response Schemas
// ============================================================================

/**
 * Schema for pull cookie
 */
export const PullCookieSchema = z.object({
  version: z.number().int().nonnegative(),
  schemaVersion: z.number().int().nonnegative(),
});

/**
 * Schema for push request
 */
export const PushRequestSchema = z.object({
  clientGroupID: z.string().min(1),
  mutations: z.array(MutationSchema),
  profileID: z.string().min(1),
  schemaVersion: z.number().int().nonnegative().default(SCHEMA_VERSION),
});

/**
 * Schema for push response
 */
export const PushResponseSchema = z.object({
  error: z.string().optional(),
});

/**
 * Schema for pull request
 */
export const PullRequestSchema = z.object({
  clientGroupID: z.string().min(1),
  cookie: PullCookieSchema.nullable(),
  profileID: z.string().min(1),
  schemaVersion: z.number().int().nonnegative().default(SCHEMA_VERSION),
});

/**
 * Schema for patch operation
 */
export const PatchOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('put'),
    key: z.string().min(1),
    value: z.union([ItemSchema, UserItemSchema, SourceSchema]),
  }),
  z.object({
    op: z.literal('del'),
    key: z.string().min(1),
  }),
  z.object({
    op: z.literal('clear'),
  }),
]);

/**
 * Schema for pull response
 */
export const PullResponseSchema = z.object({
  cookie: PullCookieSchema,
  lastMutationIDChanges: z.record(z.number().int()),
  patch: z.array(PatchOperationSchema),
});

/**
 * Schema for client metadata
 */
export const ClientMetadataSchema = z.object({
  id: z.string().min(1),
  clientGroupID: z.string().min(1),
  lastMutationID: z.number().int().nonnegative(),
  lastModified: z.string().datetime(),
});

// ============================================================================
// Inferred Types (for convenience)
// ============================================================================

export type ItemInput = z.input<typeof ItemSchema>;
export type UserItemInput = z.input<typeof UserItemSchema>;
export type SourceInput = z.input<typeof SourceSchema>;
export type PushRequestInput = z.input<typeof PushRequestSchema>;
export type PullRequestInput = z.input<typeof PullRequestSchema>;
