import { SubscriptionRepository, FeedItemRepository, UserAccount, Subscription, FeedItem } from '@zine/shared'
import { BatchProcessor, BatchProcessorOptions } from './batch-processors/batch-processor.interface'
import { SpotifyBatchProcessor } from './batch-processors/spotify-batch-processor'
import { YouTubeBatchProcessor } from './batch-processors/youtube-batch-processor'
import { BatchDatabaseOperations } from '../repositories/batch-operations'
import { DeduplicationCache } from '../repositories/deduplication-cache'

export interface PollResult {
  provider: 'spotify' | 'youtube'
  subscriptionId: string
  subscriptionTitle: string
  newItemsFound: number
  totalUsersNotified: number
  errors?: string[]
}

export interface PollingResults {
  timestamp: Date
  totalSubscriptionsPolled: number
  totalNewItems: number
  totalUsersNotified: number
  results: PollResult[]
  errors: string[]
  performanceMetrics?: {
    durationMs: number
    cacheHitRate: number
    dbQueriesReduced: number
  }
}

export class OptimizedFeedPollingService {
  private batchProcessors: Map<string, BatchProcessor>
  private deduplicationCache: DeduplicationCache
  private batchOps: BatchDatabaseOperations
  private dbQueryCount = 0
  
  constructor(
    private subscriptionRepository: SubscriptionRepository,
    _feedItemRepository: FeedItemRepository,
    d1Database: D1Database,
    processorOptions?: {
      spotify?: Partial<BatchProcessorOptions>
      youtube?: Partial<BatchProcessorOptions>
    }
  ) {
    // Initialize batch processors with optional overrides
    const spotifyProcessor = new SpotifyBatchProcessor()
    const youtubeProcessor = new YouTubeBatchProcessor()
    
    // Apply any option overrides
    if (processorOptions?.spotify) {
      const defaultOpts = spotifyProcessor.getDefaultOptions()
      spotifyProcessor.getDefaultOptions = () => ({ ...defaultOpts, ...processorOptions.spotify })
    }
    if (processorOptions?.youtube) {
      const defaultOpts = youtubeProcessor.getDefaultOptions()
      youtubeProcessor.getDefaultOptions = () => ({ ...defaultOpts, ...processorOptions.youtube })
    }
    
    this.batchProcessors = new Map<string, BatchProcessor>([
      ['spotify', spotifyProcessor],
      ['youtube', youtubeProcessor]
    ])

    // Initialize optimization components
    this.batchOps = new BatchDatabaseOperations(d1Database)
    this.deduplicationCache = new DeduplicationCache({
      maxSize: 20000,  // Larger cache for better hit rate
      ttlMinutes: 120  // 2 hours TTL
    })
  }

  async pollProviderSubscriptions(providerId: string, subscriptions: any[]): Promise<void> {
    // Process specific provider subscriptions with optimized batching
    const processor = this.batchProcessors.get(providerId)
    if (!processor) {
      console.error(`No batch processor found for provider: ${providerId}`)
      return
    }

    // Get a valid access token for this provider
    const userAccount = await this.getValidUserAccountForProvider(providerId)
    if (!userAccount || !userAccount.accessToken) {
      console.log(`[OptimizedFeedPolling] No valid token available for ${providerId}`)
      return
    }

    try {
      console.log(`[OptimizedFeedPolling] Processing ${subscriptions.length} ${providerId} subscriptions`)
      
      // Process with smaller batch size to avoid CPU timeout
      const batchResults = await processor.processBatch(subscriptions, userAccount.accessToken, {
        maxBatchSize: 10, // Smaller batch size
        maxConcurrency: 2, // Lower concurrency
        onProgress: (completed, total) => {
          console.log(`[OptimizedFeedPolling] ${providerId} progress: ${completed}/${total}`)
        }
      })
      
      // Process results
      const newItems: Array<Omit<FeedItem, 'id' | 'createdAt'>> = []
      
      for (const batchResult of batchResults) {
        if (batchResult.error) {
          console.error(`${batchResult.subscriptionTitle}: ${batchResult.error}`)
          continue
        }
        
        // Update totalEpisodes if provided
        if (batchResult.totalEpisodes !== undefined) {
          await this.subscriptionRepository.updateSubscription(batchResult.subscriptionId, {
            totalEpisodes: batchResult.totalEpisodes
          })
        }
        
        // Collect new items
        for (const item of batchResult.newItems) {
          if (!this.deduplicationCache.has(item.subscriptionId, item.externalId)) {
            newItems.push({
              subscriptionId: item.subscriptionId,
              externalId: item.externalId,
              title: item.title,
              description: item.description,
              thumbnailUrl: item.thumbnailUrl,
              publishedAt: item.publishedAt,
              durationSeconds: item.durationSeconds,
              externalUrl: item.externalUrl
            })
          }
        }
      }
      
      // Batch insert new items if any
      if (newItems.length > 0) {
        console.log(`[OptimizedFeedPolling] Creating ${newItems.length} new feed items for ${providerId}`)
        
        const existingItemsMap = await this.batchOps.checkExistingFeedItems(
          newItems.map(item => ({ 
            subscriptionId: item.subscriptionId, 
            externalId: item.externalId 
          }))
        )
        
        await this.batchOps.batchInsertFeedItems(newItems, existingItemsMap)
        
        // Add to cache
        for (const item of newItems) {
          this.deduplicationCache.add(item as FeedItem)
        }
      }
      
      console.log(`[OptimizedFeedPolling] Completed ${providerId} polling`)
    } catch (error) {
      console.error(`[OptimizedFeedPolling] Error polling ${providerId}:`, error)
    }
  }

  async pollAllActiveSubscriptions(): Promise<PollingResults> {
    const startTime = new Date()
    console.log(`[OptimizedFeedPolling] Starting polling at ${startTime.toISOString()}`)

    // Reset metrics
    this.dbQueryCount = 0
    this.deduplicationCache.resetStats()

    const results: PollResult[] = []
    const globalErrors: string[] = []
    let totalNewItems = 0
    let totalUsersNotified = 0

    try {
      // Get all active subscriptions grouped by provider
      const subscriptionsByProvider = new Map<string, Subscription[]>()
      
      for (const [providerId] of this.batchProcessors) {
        const subs = await this.subscriptionRepository.getSubscriptionsByProvider(providerId)
        this.dbQueryCount++
        
        // Filter out any null/undefined subscriptions
        const validSubs = subs.filter(s => s && s.id)
        
        if (validSubs.length > 0) {
          subscriptionsByProvider.set(providerId, validSubs)
          console.log(`[OptimizedFeedPolling] Found ${validSubs.length} ${providerId} subscriptions`)
        }
        
        if (subs.length !== validSubs.length) {
          console.warn(`[OptimizedFeedPolling] Filtered out ${subs.length - validSubs.length} invalid subscriptions for ${providerId}`)
        }
      }

      // Warm cache with recent items for all subscriptions
      await this.warmCacheForSubscriptions(subscriptionsByProvider)

      // Process each provider's subscriptions using batch processors
      for (const [providerId, subscriptions] of subscriptionsByProvider) {
        const processor = this.batchProcessors.get(providerId)
        if (!processor) {
          globalErrors.push(`No batch processor found for provider: ${providerId}`)
          continue
        }

        // Get a valid access token for this provider
        const userAccount = await this.getValidUserAccountForProvider(providerId)
        if (!userAccount) {
          globalErrors.push(`No valid tokens available for ${providerId}`)
          console.log(`[OptimizedFeedPolling] No valid tokens available for ${providerId}`)
          continue
        }

        try {
          console.log(`[OptimizedFeedPolling] Starting batch processing for ${providerId}`)
          if (!userAccount.accessToken) {
            console.log(`[OptimizedFeedPolling] No access token found for ${providerId}, skipping`)
            continue
          }
          const batchResults = await processor.processBatch(subscriptions, userAccount.accessToken, {
            onProgress: (completed, total) => {
              console.log(`[OptimizedFeedPolling] ${providerId} progress: ${completed}/${total} (${Math.round(completed/total * 100)}%)`)
            }
          })
          
          // Process all results for this provider in batches
          const providerNewItems: Array<Omit<FeedItem, 'id' | 'createdAt'>> = []
          const resultsBySubscription = new Map<string, typeof batchResults[0]>()

          for (const batchResult of batchResults) {
            if (batchResult.error) {
              globalErrors.push(`${batchResult.subscriptionTitle}: ${batchResult.error}`)
              continue
            }

            resultsBySubscription.set(batchResult.subscriptionId, batchResult)

            // Update totalEpisodes if provided (for Spotify optimization)
            if (batchResult.totalEpisodes !== undefined) {
              try {
                await this.subscriptionRepository.updateSubscription(batchResult.subscriptionId, {
                  totalEpisodes: batchResult.totalEpisodes
                })
                this.dbQueryCount++
              } catch (error) {
                console.error(`Failed to update totalEpisodes for subscription ${batchResult.subscriptionId}:`, error)
              }
            }

            // Filter items using cache first
            for (const item of batchResult.newItems) {
              // Check cache first for ultra-fast deduplication
              if (!this.deduplicationCache.has(item.subscriptionId, item.externalId)) {
                providerNewItems.push({
                  subscriptionId: item.subscriptionId,
                  externalId: item.externalId,
                  title: item.title,
                  description: item.description,
                  thumbnailUrl: item.thumbnailUrl,
                  publishedAt: item.publishedAt,
                  durationSeconds: item.durationSeconds,
                  externalUrl: item.externalUrl
                })
              }
            }
          }

          // Batch process all new items for this provider
          if (providerNewItems.length > 0) {
            console.log(`[OptimizedFeedPolling] Processing ${providerNewItems.length} potential new items for ${providerId}`)
            
            // Check existing items in a single query
            const existingItemsMap = await this.batchOps.checkExistingFeedItems(
              providerNewItems.map(item => ({ 
                subscriptionId: item.subscriptionId, 
                externalId: item.externalId 
              }))
            )
            this.dbQueryCount++

            // Batch insert truly new items
            const createdItems = await this.batchOps.batchInsertFeedItems(
              providerNewItems,
              existingItemsMap
            )
            this.dbQueryCount++

            // Add new items to cache
            this.deduplicationCache.addBatch(createdItems)

            // Group created items by subscription
            const itemsBySubscription = new Map<string, FeedItem[]>()
            for (const item of createdItems) {
              if (!itemsBySubscription.has(item.subscriptionId)) {
                itemsBySubscription.set(item.subscriptionId, [])
              }
              itemsBySubscription.get(item.subscriptionId)!.push(item)
            }

            // Create user feed items for each subscription with new items
            for (const [subscriptionId, items] of itemsBySubscription) {
              const batchResult = resultsBySubscription.get(subscriptionId)
              
              // Skip if we don't have the batch result (e.g., due to an error)
              if (!batchResult) {
                console.warn(`[OptimizedFeedPolling] No batch result found for subscription ${subscriptionId}, skipping user feed item creation`)
                continue
              }
              
              const usersNotified = await this.createUserFeedItemsBatch(subscriptionId, items)

              results.push({
                provider: providerId as 'spotify' | 'youtube',
                subscriptionId: batchResult.subscriptionId,
                subscriptionTitle: batchResult.subscriptionTitle,
                newItemsFound: items.length,
                totalUsersNotified: usersNotified
              })

              totalNewItems += items.length
              totalUsersNotified += usersNotified
            }
          }
        } catch (error) {
          const errorMsg = `${providerId} batch processing failed: ${error instanceof Error ? error.message : String(error)}`
          console.error(`[OptimizedFeedPolling] ${errorMsg}`)
          globalErrors.push(errorMsg)
        }
      }

      const endTime = new Date()
      const duration = endTime.getTime() - startTime.getTime()
      const cacheStats = this.deduplicationCache.getStats()

      console.log(`[OptimizedFeedPolling] Completed in ${duration}ms`)
      console.log(`[OptimizedFeedPolling] Found ${totalNewItems} new items for ${totalUsersNotified} users`)
      console.log(`[OptimizedFeedPolling] Cache hit rate: ${cacheStats.hitRate}%`)
      console.log(`[OptimizedFeedPolling] Total DB queries: ${this.dbQueryCount}`)

      const totalSubscriptions = Array.from(subscriptionsByProvider.values())
        .reduce((sum, subs) => sum + subs.length, 0)

      return {
        timestamp: startTime,
        totalSubscriptionsPolled: totalSubscriptions,
        totalNewItems,
        totalUsersNotified,
        results,
        errors: globalErrors,
        performanceMetrics: {
          durationMs: duration,
          cacheHitRate: cacheStats.hitRate,
          dbQueriesReduced: Math.max(0, totalSubscriptions * 3 - this.dbQueryCount) // Estimate of queries saved
        }
      }
    } catch (error) {
      console.error('[OptimizedFeedPolling] Fatal error during polling:', error)
      console.error('[OptimizedFeedPolling] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
      globalErrors.push(`Fatal error: ${error instanceof Error ? error.message : String(error)}`)
      
      return {
        timestamp: startTime,
        totalSubscriptionsPolled: 0,
        totalNewItems: 0,
        totalUsersNotified: 0,
        results,
        errors: globalErrors
      }
    }
  }

  private async warmCacheForSubscriptions(subscriptionsByProvider: Map<string, Subscription[]>): Promise<void> {
    const allSubscriptionIds: string[] = []
    
    for (const [provider, subscriptions] of subscriptionsByProvider.entries()) {
      // Filter out any null/undefined subscriptions and safely map to IDs
      const validSubscriptions = subscriptions.filter(s => s && s.id)
      const ids = validSubscriptions.map(s => s.id)
      allSubscriptionIds.push(...ids)
      console.log(`[OptimizedFeedPolling] Provider ${provider}: ${ids.length} subscription IDs`)
    }

    if (allSubscriptionIds.length > 0) {
      console.log(`[OptimizedFeedPolling] Warming cache for ${allSubscriptionIds.length} total subscriptions`)
      
      try {
        const recentItems = await this.batchOps.getRecentFeedItemIds(allSubscriptionIds, 24)
        this.dbQueryCount++
        
        let totalCachedItems = 0
        for (const [_subId, itemIds] of recentItems) {
          totalCachedItems += itemIds.size
        }
        
        this.deduplicationCache.warmCache(recentItems)
        console.log(`[OptimizedFeedPolling] Cache warmed with ${totalCachedItems} recent items from ${recentItems.size} subscriptions`)
      } catch (error) {
        console.error(`[OptimizedFeedPolling] Cache warming failed:`, error)
        console.error(`[OptimizedFeedPolling] Error details:`, {
          totalSubscriptions: allSubscriptionIds.length,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined
        })
        // Don't fail the entire polling operation if cache warming fails
        console.warn(`[OptimizedFeedPolling] Continuing without cache warming due to error`)
      }
    }
  }

  private async createUserFeedItemsBatch(subscriptionId: string, newFeedItems: FeedItem[]): Promise<number> {
    if (newFeedItems.length === 0) return 0

    // Get all users subscribed to this subscription
    const subscribedUserIds = await this.subscriptionRepository.getUsersForSubscription(subscriptionId)
    this.dbQueryCount++
    
    console.log(`[OptimizedFeedPolling] Found ${subscribedUserIds.length} users subscribed to ${subscriptionId}`)
    
    if (subscribedUserIds.length === 0) return 0

    // Use batch operations to create user feed items
    // Note: batchInsertUserFeedItems expects a single userId and array of feedItemIds
    for (const userId of subscribedUserIds) {
      await this.batchOps.batchInsertUserFeedItems(
        userId,
        newFeedItems.map(item => item.id)
      )
    }
    this.dbQueryCount++
    
    return subscribedUserIds.length
  }

  private async getValidUserAccountForProvider(providerId: string): Promise<UserAccount | null> {
    try {
      const account = await this.subscriptionRepository.getValidUserAccountForProvider(providerId)
      this.dbQueryCount++
      return account
    } catch (error) {
      console.error(`Error getting user account for provider ${providerId}:`, error)
      return null
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): ReturnType<DeduplicationCache['getStats']> {
    return this.deduplicationCache.getStats()
  }

  /**
   * Clear cache (useful for testing or maintenance)
   */
  clearCache(): void {
    this.deduplicationCache.clear()
  }
}