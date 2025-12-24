/**
 * Zod Schemas for Zine
 *
 * Runtime validation schemas matching all exported types.
 */

import { z } from 'zod';
import {
  ContentType,
  Provider,
  UserItemState,
  SubscriptionStatus,
  ProviderConnectionStatus,
} from '../types/domain';

// ============================================================================
// Enum Schemas
// ============================================================================

export const ContentTypeSchema = z.nativeEnum(ContentType);

export const ProviderSchema = z.nativeEnum(Provider);

export const UserItemStateSchema = z.nativeEnum(UserItemState);

export const SubscriptionStatusSchema = z.nativeEnum(SubscriptionStatus);

export const ProviderConnectionStatusSchema = z.nativeEnum(ProviderConnectionStatus);

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
// Inferred Types (for convenience)
// ============================================================================

export type ItemInput = z.input<typeof ItemSchema>;
export type UserItemInput = z.input<typeof UserItemSchema>;
export type SourceInput = z.input<typeof SourceSchema>;
