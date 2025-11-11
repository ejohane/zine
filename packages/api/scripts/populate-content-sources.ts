#!/usr/bin/env tsx
/**
 * Migration Script: Populate content_sources from subscriptions
 * 
 * This script migrates all existing subscription data to the new content_sources table,
 * which is part of the Two-Tier Creator Model implementation.
 * 
 * Usage:
 *   tsx scripts/populate-content-sources.ts [--dry-run] [--verbose]
 * 
 * Options:
 *   --dry-run   Show what would be migrated without making changes
 *   --verbose   Show detailed progress information
 * 
 * See: docs/features/creator-reconciliation/TWO_TIER_CREATOR_MODEL.md
 */

import { join } from 'path'

interface MigrationStats {
  totalSubscriptions: number
  migratedContentSources: number
  skippedDuplicates: number
  errors: number
  byPlatform: Record<string, number>
}

interface SubscriptionRow {
  id: string
  provider_id: string
  external_id: string
  title: string
  creator_name: string
  description?: string
  thumbnail_url?: string
  subscription_url?: string
  subscriber_count?: number
  total_episodes?: number
  video_count?: number
  is_verified?: number
  last_polled_at?: number
  etag?: string
  uploads_playlist_id?: string
  channel_metadata?: string
  content_categories?: string
  primary_language?: string
  average_duration?: number
  upload_frequency?: string
  last_content_date?: number
  total_content_count?: number
  engagement_rate_avg?: number
  popularity_avg?: number
  upload_schedule?: string
  created_at: number
}

async function getLocalDB() {
  // For local testing, use the local.db file
  const Database = (await import('better-sqlite3')).default
  const dbPath = join(__dirname, '..', 'local.db')
  return Database(dbPath)
}

async function runMigration(dryRun: boolean = false, verbose: boolean = false) {
  console.log('🚀 Starting content_sources migration...')
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`)
  console.log('─'.repeat(60))

  const stats: MigrationStats = {
    totalSubscriptions: 0,
    migratedContentSources: 0,
    skippedDuplicates: 0,
    errors: 0,
    byPlatform: {}
  }

  try {
    const db = await getLocalDB()

    // Get all subscriptions
    const subscriptions = db.prepare(`
      SELECT 
        s.*,
        sp.id as provider_id
      FROM subscriptions s
      JOIN subscription_providers sp ON s.provider_id = sp.id
      WHERE s.external_id IS NOT NULL
        AND s.title IS NOT NULL
        AND s.creator_name IS NOT NULL
    `).all() as SubscriptionRow[]

    stats.totalSubscriptions = subscriptions.length
    console.log(`📊 Found ${stats.totalSubscriptions} subscriptions to migrate\n`)

    if (dryRun) {
      console.log('🔍 DRY RUN: Analyzing what would be migrated...\n')
    }

    for (const sub of subscriptions) {
      try {
        const contentSourceId = `${sub.provider_id}:${sub.external_id}`
        const platform = sub.provider_id
        const sourceType = platform === 'youtube' ? 'channel' : platform === 'spotify' ? 'show' : 'unknown'

        // Check if already exists
        const existing = db.prepare(`
          SELECT id FROM content_sources WHERE id = ?
        `).get(contentSourceId)

        if (existing) {
          stats.skippedDuplicates++
          if (verbose) {
            console.log(`⏭️  Skipping duplicate: ${contentSourceId} - ${sub.title}`)
          }
          continue
        }

        // Build metadata JSON
        const metadata = sub.channel_metadata || JSON.stringify({
          content_categories: JSON.parse(sub.content_categories || '[]'),
          primary_language: sub.primary_language,
          average_duration: sub.average_duration,
          upload_frequency: sub.upload_frequency,
          last_content_date: sub.last_content_date,
          total_content_count: sub.total_content_count,
          engagement_rate_avg: sub.engagement_rate_avg,
          popularity_avg: sub.popularity_avg,
          upload_schedule: sub.upload_schedule
        })

        if (!dryRun) {
          // Insert the content source
          db.prepare(`
            INSERT INTO content_sources (
              id, external_id, platform, source_type, title, description,
              thumbnail_url, url, creator_id, creator_name, subscriber_count,
              total_episodes, video_count, is_verified, last_polled_at,
              etag, uploads_playlist_id, metadata, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            contentSourceId,
            sub.external_id,
            platform,
            sourceType,
            sub.title,
            sub.description || null,
            sub.thumbnail_url || null,
            sub.subscription_url || '',
            contentSourceId, // Temporary creator_id (will be reconciled later)
            sub.creator_name,
            sub.subscriber_count || null,
            sub.total_episodes || null,
            sub.video_count || null,
            sub.is_verified || 0,
            sub.last_polled_at || null,
            sub.etag || null,
            sub.uploads_playlist_id || null,
            metadata,
            sub.created_at,
            Date.now()
          )
        }

        stats.migratedContentSources++
        stats.byPlatform[platform] = (stats.byPlatform[platform] || 0) + 1

        if (verbose) {
          console.log(`✅ ${dryRun ? 'Would migrate' : 'Migrated'}: ${contentSourceId} - ${sub.title}`)
        }

      } catch (error) {
        stats.errors++
        console.error(`❌ Error processing subscription ${sub.id}:`, error)
      }
    }

    console.log('\n' + '─'.repeat(60))
    console.log('📈 Migration Summary:')
    console.log('─'.repeat(60))
    console.log(`Total subscriptions:        ${stats.totalSubscriptions}`)
    console.log(`${dryRun ? 'Would migrate' : 'Migrated'}:           ${stats.migratedContentSources}`)
    console.log(`Skipped (duplicates):       ${stats.skippedDuplicates}`)
    console.log(`Errors:                     ${stats.errors}`)
    console.log('\nBy Platform:')
    for (const [platform, count] of Object.entries(stats.byPlatform)) {
      console.log(`  ${platform.padEnd(15)} ${count}`)
    }

    if (!dryRun) {
      // Verify the migration
      console.log('\n' + '─'.repeat(60))
      console.log('🔍 Verification:')
      console.log('─'.repeat(60))

      const counts = db.prepare(`
        SELECT platform, source_type, COUNT(*) as count
        FROM content_sources
        GROUP BY platform, source_type
        ORDER BY platform, source_type
      `).all() as Array<{ platform: string; source_type: string; count: number }>

      console.log('\nContent Sources in Database:')
      for (const row of counts) {
        console.log(`  ${row.platform}/${row.source_type}: ${row.count}`)
      }

      const unmigrated = db.prepare(`
        SELECT COUNT(*) as count
        FROM subscriptions s
        WHERE NOT EXISTS (
          SELECT 1 
          FROM content_sources cs 
          WHERE cs.external_id = s.external_id 
            AND cs.platform = s.provider_id
        )
      `).get() as { count: number }

      if (unmigrated.count > 0) {
        console.log(`\n⚠️  Warning: ${unmigrated.count} subscriptions were not migrated`)
      } else {
        console.log('\n✅ All subscriptions successfully migrated!')
      }
    }

    db.close()

    console.log('\n' + '─'.repeat(60))
    if (dryRun) {
      console.log('✅ Dry run complete - no changes made')
      console.log('💡 Run without --dry-run to apply changes')
    } else {
      console.log('✅ Migration complete!')
      console.log('💡 Next step: Run CreatorReconciliationService to link content sources to creators')
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const verbose = args.includes('--verbose')

// Run the migration
runMigration(dryRun, verbose)
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
