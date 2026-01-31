import { and, eq } from 'drizzle-orm';

import type { Database } from '../../db';
import { items } from '../../db/schema';
import type { NewItem } from '../transformers';
import { serializeError } from '../../utils/error-utils';
import {
  extractCreatorFromMetadata,
  findOrCreateCreator,
  generateSyntheticCreatorId,
  type CreatorParams,
} from '../../db/helpers/creators';

// ============================================================================
// Creator Extraction Helpers
// ============================================================================

/**
 * Providers that have native creator IDs from their APIs.
 * For these, we use extractCreatorFromMetadata to parse the raw API response.
 */
const PROVIDERS_WITH_NATIVE_CREATOR_IDS = ['YOUTUBE', 'SPOTIFY', 'X'];

/**
 * Providers that require synthetic creator IDs.
 * For these, we generate a deterministic ID from provider + creator name.
 */
const PROVIDERS_WITH_SYNTHETIC_CREATOR_IDS = ['RSS', 'WEB', 'SUBSTACK'];

/**
 * Extract or create creator parameters from a raw provider item.
 *
 * This function handles two cases:
 * 1. Providers with native IDs (YouTube, Spotify, X): Extract from raw API metadata
 * 2. Providers without native IDs (RSS, WEB, SUBSTACK): Generate synthetic ID from creator name
 *
 * @param provider - The provider type
 * @param rawItem - Raw item data from the provider API
 * @param transformedItem - The transformed NewItem (for fallback creator name)
 * @returns CreatorParams if extraction succeeded, null otherwise
 */
function extractCreatorParams(
  provider: string,
  rawItem: unknown,
  transformedItem: NewItem
): CreatorParams | null {
  // Case 1: Providers with native creator IDs
  if (PROVIDERS_WITH_NATIVE_CREATOR_IDS.includes(provider)) {
    return extractCreatorFromMetadata(provider, rawItem);
  }

  // Case 2: Providers with synthetic creator IDs
  if (PROVIDERS_WITH_SYNTHETIC_CREATOR_IDS.includes(provider) && transformedItem.creator) {
    const syntheticId = generateSyntheticCreatorId(provider, transformedItem.creator);
    return {
      provider,
      providerCreatorId: syntheticId,
      name: transformedItem.creator,
      imageUrl: transformedItem.creatorImageUrl,
    };
  }

  return null;
}

/**
 * Find or create a creator from raw item data.
 *
 * Uses extractCreatorParams to get creator info, then calls findOrCreateCreator
 * to get the internal creator ID.
 *
 * @param db - Database instance
 * @param provider - Provider type
 * @param rawItem - Raw item data from provider API
 * @param transformedItem - Transformed item data (for fallback creator name)
 * @returns Internal creator ID if successful, null otherwise
 */
export async function getOrCreateCreator(
  db: Database,
  provider: string,
  rawItem: unknown,
  transformedItem: NewItem
): Promise<string | null> {
  try {
    const creatorParams = extractCreatorParams(provider, rawItem, transformedItem);

    if (!creatorParams) {
      return null;
    }

    // findOrCreateCreator expects ctx with db property
    const ctx = { db };
    const creator = await findOrCreateCreator(ctx, creatorParams);
    return creator.id;
  } catch (error) {
    // Log but don't fail ingestion if creator extraction fails
    console.error('Failed to extract/create creator:', {
      provider,
      error: serializeError(error),
    });
    return null;
  }
}

/**
 * Backfill creatorId for an existing canonical item if it's missing.
 * This handles items created before the schema normalization.
 *
 * Called when an item is "already seen" to ensure we still update
 * the canonical item's creatorId even though we skip creating user_item.
 */
export async function backfillCreatorIdIfMissing<T>(
  db: Database,
  provider: string,
  rawItem: T,
  transformedItem: NewItem
): Promise<void> {
  try {
    // Check if canonical item exists and is missing creatorId
    const existing = await db
      .select({ id: items.id, creatorId: items.creatorId })
      .from(items)
      .where(and(eq(items.provider, provider), eq(items.providerId, transformedItem.providerId)))
      .limit(1);

    if (existing.length === 0 || existing[0].creatorId) {
      // Item doesn't exist or already has creatorId - nothing to backfill
      return;
    }

    // Extract creator from raw item
    const creatorId = await getOrCreateCreator(db, provider, rawItem, transformedItem);
    if (!creatorId) {
      return;
    }

    // Update the canonical item with the creatorId
    await db
      .update(items)
      .set({ creatorId, updatedAt: new Date().toISOString() })
      .where(eq(items.id, existing[0].id));

    console.log('Backfilled creatorId for item', {
      itemId: existing[0].id,
      provider,
      providerId: transformedItem.providerId,
      creatorId,
    });
  } catch (error) {
    // Log but don't fail - backfill is best-effort
    console.error('Failed to backfill creatorId:', {
      provider,
      providerId: transformedItem.providerId,
      error: serializeError(error),
    });
  }
}
