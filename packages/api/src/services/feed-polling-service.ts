import { SubscriptionRepository, FeedItemRepository, UserAccount, Subscription, FeedItem } from '@zine/shared'
import { BatchProcessor } from './batch-processors/batch-processor.interface'
import { SpotifyBatchProcessor } from './batch-processors/spotify-batch-processor'
import { YouTubeBatchProcessor } from './batch-processors/youtube-batch-processor'

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
}

export class FeedPollingService {
  private batchProcessors: Map<string, BatchProcessor>
  
  constructor(
    private subscriptionRepository: SubscriptionRepository,
    private feedItemRepository: FeedItemRepository
  ) {
    // Initialize batch processors
    this.batchProcessors = new Map<string, BatchProcessor>([
      ['spotify', new SpotifyBatchProcessor()],
      ['youtube', new YouTubeBatchProcessor()]
    ])
  }

  async pollAllActiveSubscriptions(): Promise<PollingResults> {
    const startTime = new Date()
    console.log(`[FeedPolling] Starting polling at ${startTime.toISOString()}`)

    const results: PollResult[] = []
    const globalErrors: string[] = []
    let totalNewItems = 0
    let totalUsersNotified = 0

    try {
      // Get all active subscriptions grouped by provider
      const subscriptionsByProvider = new Map<string, Subscription[]>()
      
      for (const [providerId] of this.batchProcessors) {
        const subs = await this.subscriptionRepository.getSubscriptionsByProvider(providerId)
        if (subs.length > 0) {
          subscriptionsByProvider.set(providerId, subs)
          console.log(`[FeedPolling] Found ${subs.length} ${providerId} subscriptions`)
        }
      }

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
          console.log(`[FeedPolling] No valid tokens available for ${providerId}`)
          continue
        }

        try {
          console.log(`[FeedPolling] Starting batch processing for ${providerId}`)
          if (!userAccount.accessToken) {
            console.log(`[FeedPolling] No access token found for ${providerId}, skipping`)
            continue
          }
          const batchResults = await processor.processBatch(subscriptions, userAccount.accessToken, {
            onProgress: (completed, total) => {
              console.log(`[FeedPolling] ${providerId} progress: ${completed}/${total} (${Math.round(completed/total * 100)}%)`)
            }
          })
          
          // Process batch results
          for (const batchResult of batchResults) {
            if (batchResult.error) {
              globalErrors.push(`${batchResult.subscriptionTitle}: ${batchResult.error}`)
              continue
            }

            // Deduplicate and create feed items
            const createdFeedItems: FeedItem[] = []
            for (const item of batchResult.newItems) {
              const feedItem = await this.feedItemRepository.findOrCreateFeedItem({
                subscriptionId: item.subscriptionId,
                externalId: item.externalId,
                title: item.title,
                description: item.description,
                thumbnailUrl: item.thumbnailUrl,
                publishedAt: item.publishedAt,
                durationSeconds: item.durationSeconds,
                externalUrl: item.externalUrl
              })

              // Check if this is actually new (created within last 5 seconds)
              const isNew = feedItem.createdAt.getTime() > Date.now() - 5000
              if (isNew) {
                createdFeedItems.push(feedItem)
              }
            }

            // Create user feed items for all subscribed users
            const usersNotified = await this.createUserFeedItems(batchResult.subscriptionId, createdFeedItems)

            results.push({
              provider: providerId as 'spotify' | 'youtube',
              subscriptionId: batchResult.subscriptionId,
              subscriptionTitle: batchResult.subscriptionTitle,
              newItemsFound: createdFeedItems.length,
              totalUsersNotified: usersNotified
            })

            totalNewItems += createdFeedItems.length
            totalUsersNotified += usersNotified
          }
        } catch (error) {
          const errorMsg = `${providerId} batch processing failed: ${error instanceof Error ? error.message : String(error)}`
          console.error(`[FeedPolling] ${errorMsg}`)
          globalErrors.push(errorMsg)
        }
      }

      const endTime = new Date()
      const duration = endTime.getTime() - startTime.getTime()
      console.log(`[FeedPolling] Completed in ${duration}ms. Found ${totalNewItems} new items for ${totalUsersNotified} users`)

      const totalSubscriptions = Array.from(subscriptionsByProvider.values())
        .reduce((sum, subs) => sum + subs.length, 0)

      return {
        timestamp: startTime,
        totalSubscriptionsPolled: totalSubscriptions,
        totalNewItems,
        totalUsersNotified,
        results,
        errors: globalErrors
      }
    } catch (error) {
      console.error('[FeedPolling] Fatal error during polling:', error)
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


  private async createUserFeedItems(subscriptionId: string, newFeedItems: FeedItem[]): Promise<number> {
    if (newFeedItems.length === 0) return 0

    // Get all users subscribed to this subscription
    const subscribedUserIds = await this.subscriptionRepository.getUsersForSubscription(subscriptionId)
    console.log(`[FeedPolling] Found ${subscribedUserIds.length} users subscribed to ${subscriptionId}`)
    
    if (subscribedUserIds.length === 0) return 0

    // Create user feed items for each new feed item and each subscribed user
    const userFeedItems = []
    for (const userId of subscribedUserIds) {
      for (const feedItem of newFeedItems) {
        userFeedItems.push({
          id: `${userId}-${feedItem.id}`,
          userId,
          feedItemId: feedItem.id,
          isRead: false
        })
      }
    }

    // Batch create all user feed items
    if (userFeedItems.length > 0) {
      await this.feedItemRepository.createUserFeedItems(userFeedItems)
      console.log(`[FeedPolling] Created ${userFeedItems.length} user feed items for subscription ${subscriptionId}`)
    }
    
    return subscribedUserIds.length
  }

  private async getValidUserAccountForProvider(providerId: string): Promise<UserAccount | null> {
    try {
      return await this.subscriptionRepository.getValidUserAccountForProvider(providerId)
    } catch (error) {
      console.error(`Error getting user account for provider ${providerId}:`, error)
      return null
    }
  }


}