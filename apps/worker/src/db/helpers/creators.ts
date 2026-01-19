/**
 * Creator Helper Functions
 *
 * Shared helper functions for creator extraction and find-or-create operations.
 * Used by the ingestion processor, bookmarks router, and backfill scripts.
 *
 * @see /features/creator-view/spec.md
 */

import { ulid } from 'ulid';
import { createHash } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { creators } from '../schema';
import type { Database } from '../index';
import type { Creator } from '@zine/shared';

// ============================================================================
// Types
// ============================================================================

/**
 * Parameters for creating or finding a creator.
 */
export interface CreatorParams {
  provider: string;
  providerCreatorId: string;
  name: string;
  imageUrl?: string;
  description?: string;
  handle?: string;
  externalUrl?: string;
}

// ============================================================================
// Name Normalization
// ============================================================================

/**
 * Normalize creator name for deduplication.
 * Converts to lowercase and trims whitespace.
 *
 * @param name - The creator's display name
 * @returns Normalized name for comparison/storage
 */
export function normalizeCreatorName(name: string): string {
  return name.toLowerCase().trim();
}

// ============================================================================
// Synthetic ID Generation
// ============================================================================

/**
 * Generate a synthetic creator ID for providers without native IDs.
 * Uses SHA-256 hash of (provider, normalizedName) for consistency.
 *
 * This ensures that the same creator name on the same provider
 * always generates the same ID, enabling deduplication.
 *
 * @param provider - The provider name (e.g., 'WEB', 'RSS')
 * @param name - The creator's display name
 * @returns 32-character hex string ID
 */
export function generateSyntheticCreatorId(provider: string, name: string): string {
  const normalized = normalizeCreatorName(name);
  return createHash('sha256').update(`${provider}:${normalized}`).digest('hex').substring(0, 32);
}

// ============================================================================
// Find or Create Creator
// ============================================================================

/**
 * Determine if we should update an existing creator record.
 * Updates if we have new info that was previously missing.
 *
 * @param existing - The existing creator record
 * @param params - The new creator parameters
 * @returns True if any field should be updated
 */
function shouldUpdateCreator(existing: Creator, params: CreatorParams): boolean {
  // Update if name changed or we have new info for null fields
  return (
    existing.name !== params.name ||
    (!existing.imageUrl && !!params.imageUrl) ||
    (!existing.description && !!params.description) ||
    (!existing.handle && !!params.handle) ||
    (!existing.externalUrl && !!params.externalUrl)
  );
}

/**
 * Context type for database operations
 */
export interface DbContext {
  db: Database;
}

/**
 * Find existing creator or create a new one.
 * Handles the common pattern used throughout the app.
 *
 * This function:
 * 1. Looks up existing creator by provider + providerCreatorId
 * 2. If found and we have new info, updates the record
 * 3. If not found, creates a new creator
 *
 * @param ctx - Context with database access
 * @param params - Creator parameters
 * @returns The found or created Creator record
 */
export async function findOrCreateCreator(ctx: DbContext, params: CreatorParams): Promise<Creator> {
  const normalizedName = normalizeCreatorName(params.name);

  // Try to find existing creator by provider + providerCreatorId
  const existing = await ctx.db.query.creators.findFirst({
    where: and(
      eq(creators.provider, params.provider),
      eq(creators.providerCreatorId, params.providerCreatorId)
    ),
  });

  if (existing) {
    // Cast to Creator type since DB returns typed schema
    const existingCreator: Creator = {
      id: existing.id,
      provider: existing.provider as Creator['provider'],
      providerCreatorId: existing.providerCreatorId,
      name: existing.name,
      normalizedName: existing.normalizedName,
      imageUrl: existing.imageUrl ?? undefined,
      description: existing.description ?? undefined,
      externalUrl: existing.externalUrl ?? undefined,
      handle: existing.handle ?? undefined,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };

    // Optionally update with new info if available
    if (shouldUpdateCreator(existingCreator, params)) {
      const now = Date.now();
      await ctx.db
        .update(creators)
        .set({
          name: params.name,
          normalizedName,
          imageUrl: params.imageUrl ?? existing.imageUrl,
          description: params.description ?? existing.description,
          handle: params.handle ?? existing.handle,
          externalUrl: params.externalUrl ?? existing.externalUrl,
          updatedAt: now,
        })
        .where(eq(creators.id, existing.id));

      // Return updated creator
      return {
        ...existingCreator,
        name: params.name,
        normalizedName,
        imageUrl: params.imageUrl ?? existingCreator.imageUrl,
        description: params.description ?? existingCreator.description,
        handle: params.handle ?? existingCreator.handle,
        externalUrl: params.externalUrl ?? existingCreator.externalUrl,
        updatedAt: now,
      };
    }

    return existingCreator;
  }

  // Create new creator
  const id = ulid();
  const now = Date.now();
  const newCreator: Creator = {
    id,
    provider: params.provider as Creator['provider'],
    providerCreatorId: params.providerCreatorId,
    name: params.name,
    normalizedName,
    imageUrl: params.imageUrl,
    description: params.description,
    handle: params.handle,
    externalUrl: params.externalUrl,
    createdAt: now,
    updatedAt: now,
  };

  await ctx.db.insert(creators).values({
    id: newCreator.id,
    provider: newCreator.provider,
    providerCreatorId: newCreator.providerCreatorId,
    name: newCreator.name,
    normalizedName: newCreator.normalizedName,
    imageUrl: newCreator.imageUrl ?? null,
    description: newCreator.description ?? null,
    handle: newCreator.handle ?? null,
    externalUrl: newCreator.externalUrl ?? null,
    createdAt: newCreator.createdAt,
    updatedAt: newCreator.updatedAt,
  });

  return newCreator;
}

// ============================================================================
// Metadata Extraction
// ============================================================================

/**
 * Extract creator info from rawMetadata based on provider.
 * Parses provider-specific metadata formats to extract creator details.
 *
 * @param provider - The provider type (YOUTUBE, SPOTIFY, X, etc.)
 * @param metadata - Raw metadata object (parsed from JSON or directly)
 * @returns CreatorParams if extraction succeeded, null otherwise
 */
export function extractCreatorFromMetadata(
  provider: string,
  metadata: unknown
): CreatorParams | null {
  try {
    switch (provider) {
      case 'YOUTUBE':
        return extractYouTubeCreator(metadata);
      case 'SPOTIFY':
        return extractSpotifyCreator(metadata);
      case 'X':
        return extractXCreator(metadata);
      default:
        return null;
    }
  } catch (error) {
    console.error('Error extracting creator from metadata:', error);
    return null;
  }
}

/**
 * Extract creator info from YouTube metadata.
 * Handles YouTube Data API v3 response format.
 */
function extractYouTubeCreator(metadata: unknown): CreatorParams | null {
  if (!metadata || typeof metadata !== 'object') return null;

  const md = metadata as Record<string, unknown>;
  const snippet = md.snippet as Record<string, unknown> | undefined;

  if (!snippet) return null;

  const channelId = snippet.channelId as string | undefined;
  const channelTitle = snippet.channelTitle as string | undefined;

  if (!channelId || !channelTitle) return null;

  return {
    provider: 'YOUTUBE',
    providerCreatorId: channelId,
    name: channelTitle,
  };
}

/**
 * Extract creator info from Spotify metadata.
 * Handles Spotify Web API episode response format.
 */
function extractSpotifyCreator(metadata: unknown): CreatorParams | null {
  if (!metadata || typeof metadata !== 'object') return null;

  const md = metadata as Record<string, unknown>;
  const show = md.show as Record<string, unknown> | undefined;

  if (!show) return null;

  const showId = show.id as string | undefined;
  const showName = show.name as string | undefined;
  const images = show.images as Array<{ url?: string }> | undefined;
  const showImage = images?.[0]?.url;
  const description = show.description as string | undefined;
  const publisher = show.publisher as string | undefined;
  const externalUrls = show.external_urls as { spotify?: string } | undefined;

  if (!showId || !showName) return null;

  return {
    provider: 'SPOTIFY',
    providerCreatorId: showId,
    name: showName,
    imageUrl: showImage,
    description: description,
    handle: publisher,
    externalUrl: externalUrls?.spotify,
  };
}

/**
 * Extract creator info from X/Twitter metadata.
 * Handles fxtwitter/vxtwitter API response format.
 */
function extractXCreator(metadata: unknown): CreatorParams | null {
  if (!metadata || typeof metadata !== 'object') return null;

  const md = metadata as Record<string, unknown>;
  const author = md.author as Record<string, unknown> | undefined;

  if (!author) return null;

  const authorId = author.id as string | undefined;
  const authorName = author.name as string | undefined;
  const authorUsername = author.username as string | undefined;

  if (!authorId || !authorName) return null;

  return {
    provider: 'X',
    providerCreatorId: authorId,
    name: authorName,
    handle: authorUsername,
  };
}
