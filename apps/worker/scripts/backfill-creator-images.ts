#!/usr/bin/env bun
/**
 * Backfill Script: Populate imageUrl on creators from items
 *
 * This script runs against the local D1 SQLite database to:
 * 1. Find all creators that have NULL image_url
 * 2. Get the image from items belonging to that creator:
 *    - First try: items.creator_image_url column
 *    - Second try: items.raw_metadata (showImageUrl for Spotify, etc.)
 * 3. Update the creator's image_url
 *
 * Usage: bun run scripts/backfill-creator-images.ts
 */

import Database from 'bun:sqlite';

// ============================================================================
// Configuration
// ============================================================================

const DB_PATH =
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/2a13f10f1e768310d0250437a6253d204a8c839f02e306404fa5e52ca7ded965.sqlite';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract creator image URL from raw_metadata based on provider
 */
function extractImageFromMetadata(provider: string, rawMetadata: string | null): string | null {
  if (!rawMetadata) return null;

  try {
    const metadata = JSON.parse(rawMetadata);

    switch (provider) {
      case 'SPOTIFY':
        // Spotify episodes have showImageUrl in metadata
        return metadata.showImageUrl || null;

      case 'YOUTUBE':
        // YouTube metadata might have channel thumbnail in snippet
        // Note: YouTube videos.list doesn't include channel image, but subscription data might
        return metadata.channelImageUrl || metadata.snippet?.channelThumbnail?.url || null;

      case 'X':
        // X/Twitter has author avatar in metadata
        return metadata.author?.avatar_url || null;

      default:
        // Check common patterns for other providers
        return metadata.authorImageUrl || metadata.creatorImageUrl || null;
    }
  } catch {
    return null;
  }
}

// ============================================================================
// Main Script
// ============================================================================

async function main() {
  console.log('🖼️  Starting creator image backfill...\n');

  // Open database
  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');

  // Get current stats
  const beforeStats = db
    .query<
      { total: number; missing: number },
      []
    >('SELECT COUNT(*) as total, SUM(CASE WHEN image_url IS NULL THEN 1 ELSE 0 END) as missing FROM creators')
    .get();
  console.log(
    `📊 Before: ${beforeStats?.total} creators, ${beforeStats?.missing} missing image_url\n`
  );

  // Get all creators missing image_url
  const creatorsMissingImage = db
    .query<
      { id: string; name: string; provider: string },
      []
    >(`SELECT id, name, provider FROM creators WHERE image_url IS NULL`)
    .all();

  console.log(`📝 Found ${creatorsMissingImage.length} creators missing image_url\n`);

  const nowMs = Date.now();
  let updatedFromColumn = 0;
  let updatedFromMetadata = 0;
  let stillMissing = 0;

  // Process each creator
  for (const creator of creatorsMissingImage) {
    let imageUrl: string | null = null;

    // First try: Get from creator_image_url column
    const itemWithImage = db
      .query<{ imageUrl: string }, [string]>(
        `SELECT creator_image_url as imageUrl
         FROM items
         WHERE creator_id = ?
           AND creator_image_url IS NOT NULL
           AND creator_image_url != ''
         LIMIT 1`
      )
      .get(creator.id);

    if (itemWithImage?.imageUrl) {
      imageUrl = itemWithImage.imageUrl;
      updatedFromColumn++;
    } else {
      // Second try: Extract from raw_metadata
      const itemWithMetadata = db
        .query<{ rawMetadata: string; provider: string }, [string]>(
          `SELECT raw_metadata as rawMetadata, provider
           FROM items
           WHERE creator_id = ?
             AND raw_metadata IS NOT NULL
           LIMIT 1`
        )
        .get(creator.id);

      if (itemWithMetadata?.rawMetadata) {
        imageUrl = extractImageFromMetadata(
          itemWithMetadata.provider,
          itemWithMetadata.rawMetadata
        );
        if (imageUrl) {
          updatedFromMetadata++;
        }
      }
    }

    if (imageUrl) {
      db.query<unknown, [string, number, string]>(
        `UPDATE creators SET image_url = ?, updated_at = ? WHERE id = ?`
      ).run(imageUrl, nowMs, creator.id);

      console.log(`  ✅ Updated: ${creator.name} -> ${imageUrl.substring(0, 60)}...`);
    } else {
      stillMissing++;
      console.log(`  ⚠️  No image found for: ${creator.name} (${creator.provider})`);
    }
  }

  // Get after stats
  const afterStats = db
    .query<
      { total: number; missing: number },
      []
    >('SELECT COUNT(*) as total, SUM(CASE WHEN image_url IS NULL THEN 1 ELSE 0 END) as missing FROM creators')
    .get();

  console.log('\n✨ Backfill complete!\n');
  console.log('📊 Summary:');
  console.log(`   Updated from creator_image_url column: ${updatedFromColumn}`);
  console.log(`   Updated from raw_metadata: ${updatedFromMetadata}`);
  console.log(`   Still missing (no source found): ${stillMissing}`);
  console.log(
    `\n📊 After: ${afterStats?.total} creators, ${afterStats?.missing} missing image_url`
  );

  // Show all creators with their image status
  const allCreators = db
    .query<{ provider: string; name: string; hasImage: number }, []>(
      `SELECT provider, name, CASE WHEN image_url IS NOT NULL THEN 1 ELSE 0 END as hasImage
       FROM creators ORDER BY provider, name`
    )
    .all();
  console.log(`\n👤 Creators in database (${allCreators.length}):`);
  for (const c of allCreators) {
    const status = c.hasImage ? '🖼️' : '❌';
    console.log(`   ${status} ${c.provider}: ${c.name}`);
  }

  db.close();
}

main().catch(console.error);
