import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../schema'

/**
 * Query optimizer and index management for feed operations
 * Provides index creation and query optimization recommendations
 */
export class QueryOptimizer {
  private db: ReturnType<typeof drizzle>

  constructor(d1Database: D1Database) {
    this.db = drizzle(d1Database, { schema })
  }

  /**
   * Check if a table exists in the database
   */
  private async tableExists(tableName: string): Promise<boolean> {
    try {
      const result = await this.db.get(sql.raw(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`
      ))
      return result !== null && result !== undefined
    } catch (error) {
      console.error(`[QueryOptimizer] Failed to check if table ${tableName} exists:`, error)
      return false
    }
  }

  /**
   * Create optimized indexes for feed operations
   * Call this during database setup or migration
   */
  async createOptimizedIndexes(): Promise<void> {
    console.log('[QueryOptimizer] Creating optimized indexes...')

    // Check if required tables exist before creating indexes
    const requiredTables = ['feed_items', 'user_feed_items', 'user_subscriptions', 'subscriptions']
    const tablesExist: Record<string, boolean> = {}
    
    for (const table of requiredTables) {
      tablesExist[table] = await this.tableExists(table)
      if (!tablesExist[table]) {
        console.log(`[QueryOptimizer] Table ${table} does not exist, skipping related indexes`)
      }
    }

    const indexes = [
      // Composite index for feed item lookups
      {
        name: 'idx_feed_items_subscription_content',
        table: 'feed_items',
        sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_items_subscription_content 
              ON feed_items(subscription_id, content_id)`
      },
      
      // Index for recent items by subscription
      {
        name: 'idx_feed_items_subscription_added',
        table: 'feed_items',
        sql: `CREATE INDEX IF NOT EXISTS idx_feed_items_subscription_added 
              ON feed_items(subscription_id, added_to_feed_at DESC)`
      },

      // Index for user feed items lookups
      {
        name: 'idx_user_feed_items_user_feed',
        table: 'user_feed_items',
        sql: `CREATE INDEX IF NOT EXISTS idx_user_feed_items_user_feed 
              ON user_feed_items(user_id, feed_item_id)`
      },

      // Index for unread items by user
      {
        name: 'idx_user_feed_items_user_read',
        table: 'user_feed_items',
        sql: `CREATE INDEX IF NOT EXISTS idx_user_feed_items_user_read 
              ON user_feed_items(user_id, is_read) 
              WHERE is_read = 0`
      },

      // Index for user subscriptions
      {
        name: 'idx_user_subscriptions_subscription',
        table: 'user_subscriptions',
        sql: `CREATE INDEX IF NOT EXISTS idx_user_subscriptions_subscription 
              ON user_subscriptions(subscription_id, is_active) 
              WHERE is_active = 1`
      },

      // Index for subscription provider lookups
      {
        name: 'idx_subscriptions_provider',
        table: 'subscriptions',
        sql: `CREATE INDEX IF NOT EXISTS idx_subscriptions_provider 
              ON subscriptions(provider_id)`
      }
    ]

    for (const index of indexes) {
      // Skip index if the required table doesn't exist
      if (!tablesExist[index.table]) {
        console.log(`[QueryOptimizer] Skipping index ${index.name} - table ${index.table} does not exist`)
        continue
      }

      try {
        await this.db.run(sql.raw(index.sql))
        console.log(`[QueryOptimizer] Created index: ${index.name}`)
      } catch (error) {
        console.error(`[QueryOptimizer] Failed to create index ${index.name}:`, error)
      }
    }

    // Analyze tables for query planner - only analyze existing tables
    await this.analyzeTables()
  }

  /**
   * Analyze tables to update statistics for query planner
   */
  async analyzeTables(): Promise<void> {
    const tables = ['feed_items', 'user_feed_items', 'subscriptions', 'user_subscriptions']
    
    for (const table of tables) {
      // Check if table exists before analyzing
      const exists = await this.tableExists(table)
      if (!exists) {
        console.log(`[QueryOptimizer] Skipping analyze for non-existent table: ${table}`)
        continue
      }

      try {
        await this.db.run(sql.raw(`ANALYZE ${table}`))
        console.log(`[QueryOptimizer] Analyzed table: ${table}`)
      } catch (error) {
        console.error(`[QueryOptimizer] Failed to analyze table ${table}:`, error)
      }
    }
  }

  /**
   * Get query execution plan for debugging
   */
  async explainQuery(query: string): Promise<any[]> {
    try {
      const result = await this.db.all(sql.raw(`EXPLAIN QUERY PLAN ${query}`))
      return result
    } catch (error) {
      console.error('[QueryOptimizer] Failed to explain query:', error)
      return []
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<DatabaseStats> {
    const stats: DatabaseStats = {
      tables: {},
      indexes: []
    }

    // Get table statistics
    const tables = ['feed_items', 'user_feed_items', 'subscriptions', 'user_subscriptions']
    for (const table of tables) {
      // Check if table exists before getting stats
      const exists = await this.tableExists(table)
      if (!exists) {
        console.log(`[QueryOptimizer] Skipping stats for non-existent table: ${table}`)
        continue
      }

      try {
        const countResult = await this.db.get(sql.raw(`SELECT COUNT(*) as count FROM ${table}`))
        stats.tables[table] = {
          rowCount: (countResult as any)?.count || 0
        }
      } catch (error) {
        console.error(`[QueryOptimizer] Failed to get stats for table ${table}:`, error)
      }
    }

    // Get index information
    try {
      const indexes = await this.db.all(sql.raw(
        `SELECT name, tbl_name as tableName 
         FROM sqlite_master 
         WHERE type = 'index' 
         AND name NOT LIKE 'sqlite_%'`
      ))
      stats.indexes = indexes.map((idx: any) => ({
        name: idx.name,
        tableName: idx.tableName
      }))
    } catch (error) {
      console.error('[QueryOptimizer] Failed to get index information:', error)
    }

    return stats
  }

  /**
   * Optimize database with VACUUM and other maintenance operations
   */
  async performMaintenance(): Promise<void> {
    console.log('[QueryOptimizer] Performing database maintenance...')

    try {
      // Note: VACUUM cannot be run within a transaction in SQLite
      // This should be run during off-peak hours
      await this.db.run(sql.raw('VACUUM'))
      console.log('[QueryOptimizer] Database vacuumed successfully')
    } catch (error) {
      console.error('[QueryOptimizer] Failed to vacuum database:', error)
    }

    // Re-analyze tables after vacuum
    await this.analyzeTables()
  }

  /**
   * Get recommendations for query optimization
   */
  getOptimizationRecommendations(): OptimizationRecommendation[] {
    return [
      {
        title: 'Use Batch Operations',
        description: 'Always use BatchDatabaseOperations for bulk inserts and checks',
        impact: 'High',
        example: 'Use checkExistingFeedItems() instead of individual queries'
      },
      {
        title: 'Leverage Deduplication Cache',
        description: 'Check cache before database for recent items',
        impact: 'High',
        example: 'cache.has() before feedItemRepository.findOrCreateFeedItem()'
      },
      {
        title: 'Use Covering Indexes',
        description: 'Ensure queries can be satisfied entirely from indexes',
        impact: 'Medium',
        example: 'SELECT subscription_id, content_id uses idx_feed_items_subscription_content'
      },
      {
        title: 'Limit Result Sets',
        description: 'Always use LIMIT for queries that may return many rows',
        impact: 'Medium',
        example: 'Add LIMIT 1000 to getUserFeedItems queries'
      },
      {
        title: 'Connection Pooling',
        description: 'Reuse database connections across requests',
        impact: 'Low',
        example: 'D1 handles this automatically in Workers environment'
      }
    ]
  }
}

export interface DatabaseStats {
  tables: {
    [tableName: string]: {
      rowCount: number
    }
  }
  indexes: Array<{
    name: string
    tableName: string
  }>
}

export interface OptimizationRecommendation {
  title: string
  description: string
  impact: 'High' | 'Medium' | 'Low'
  example: string
}