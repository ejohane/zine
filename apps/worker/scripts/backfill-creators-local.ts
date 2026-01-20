#!/usr/bin/env bun
/**
 * Local Backfill Script: Populate creatorId on items
 *
 * This script runs against the local D1 SQLite database to:
 * 1. Create creator records for each unique (provider, creator) combination
 * 2. Link items to their creators via creatorId
 *
 * Usage: bun run scripts/backfill-creators-local.ts
 */

import Database from 'bun:sqlite';
import { createHash } from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

const DB_PATH =
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/2a13f10f1e768310d0250437a6253d204a8c839f02e306404fa5e52ca7ded965.sqlite';

// ============================================================================
// Helper Functions
// ============================================================================

function normalizeCreatorName(name: string): string {
  return name.toLowerCase().trim();
}

function generateSyntheticCreatorId(provider: string, name: string): string {
  const normalized = normalizeCreatorName(name);
  return createHash('sha256').update(`${provider}:${normalized}`).digest('hex').substring(0, 32);
}

function generateUlid(): string {
  // Simple ULID-like generation (timestamp + random)
  const timestamp = Date.now().toString(36).padStart(10, '0');
  const random = Math.random().toString(36).substring(2, 12).padStart(10, '0');
  return (timestamp + random).toUpperCase().substring(0, 26);
}

// ============================================================================
// Main Script
// ============================================================================

async function main() {
  console.log('🚀 Starting creator backfill...\n');

  // Open database
  const db = new Database(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');

  // Get current stats
  const beforeStats = db
    .query<
      { total: number; missing: number },
      []
    >('SELECT COUNT(*) as total, SUM(CASE WHEN creator_id IS NULL THEN 1 ELSE 0 END) as missing FROM items')
    .get();
  console.log(
    `📊 Before: ${beforeStats?.total} items, ${beforeStats?.missing} missing creatorId\n`
  );

  // Get all unique (provider, creator) combinations from items
  const uniqueCreators = db
    .query<{ provider: string; creator: string; count: number }, []>(
      `SELECT provider, creator, COUNT(*) as count
       FROM items
       WHERE creator IS NOT NULL
       GROUP BY provider, creator
       ORDER BY provider, count DESC`
    )
    .all();

  console.log(`📝 Found ${uniqueCreators.length} unique creators to process\n`);

  const now = new Date().toISOString();
  const nowMs = Date.now();
  let creatorsCreated = 0;
  let creatorsExisted = 0;
  let itemsLinked = 0;

  // Process each unique creator
  for (const { provider, creator } of uniqueCreators) {
    const providerCreatorId = generateSyntheticCreatorId(provider, creator);
    const normalizedName = normalizeCreatorName(creator);

    // Check if creator already exists
    const existingCreator = db
      .query<
        { id: string },
        [string, string]
      >('SELECT id FROM creators WHERE provider = ? AND provider_creator_id = ?')
      .get(provider, providerCreatorId);

    let creatorId: string;

    if (existingCreator) {
      creatorId = existingCreator.id;
      creatorsExisted++;
    } else {
      // Create new creator
      creatorId = generateUlid();

      db.query(
        `INSERT INTO creators (id, provider, provider_creator_id, name, normalized_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(creatorId, provider, providerCreatorId, creator, normalizedName, nowMs, nowMs);

      creatorsCreated++;
      console.log(`  ✅ Created creator: ${creator} (${provider})`);
    }

    // Link all items with this (provider, creator) to the creator
    const result = db
      .query<
        { changes: number },
        [string, string, string, string]
      >(`UPDATE items SET creator_id = ?, updated_at = ? WHERE provider = ? AND creator = ? AND creator_id IS NULL`)
      .run(creatorId, now, provider, creator);

    itemsLinked += result.changes;
  }

  // Get after stats
  const afterStats = db
    .query<
      { total: number; missing: number },
      []
    >('SELECT COUNT(*) as total, SUM(CASE WHEN creator_id IS NULL THEN 1 ELSE 0 END) as missing FROM items')
    .get();

  console.log('\n✨ Backfill complete!\n');
  console.log('📊 Summary:');
  console.log(`   Creators created: ${creatorsCreated}`);
  console.log(`   Creators existed: ${creatorsExisted}`);
  console.log(`   Items linked: ${itemsLinked}`);
  console.log(`\n📊 After: ${afterStats?.total} items, ${afterStats?.missing} missing creatorId`);

  // Show creators created
  const allCreators = db
    .query<
      { provider: string; name: string; id: string },
      []
    >('SELECT provider, name, id FROM creators ORDER BY provider, name')
    .all();
  console.log(`\n👤 Creators in database (${allCreators.length}):`);
  for (const c of allCreators) {
    console.log(`   ${c.provider}: ${c.name}`);
  }

  db.close();
}

main().catch(console.error);
