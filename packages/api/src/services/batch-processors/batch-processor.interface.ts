import { Subscription, FeedItem } from '@zine/shared'

export interface BatchProcessorResult {
  subscriptionId: string
  subscriptionTitle: string
  newItems: FeedItem[]
  error?: string
}

export interface BatchProcessorOptions {
  maxBatchSize: number
  maxConcurrency: number
  retryAttempts: number
  retryDelay: number
}

export interface BatchProcessor {
  /**
   * Process multiple subscriptions in batches
   * @param subscriptions Subscriptions to process
   * @param accessToken Valid access token for the provider
   * @param options Processing options
   * @returns Array of results for each subscription
   */
  processBatch(
    subscriptions: Subscription[],
    accessToken: string,
    options?: Partial<BatchProcessorOptions>
  ): Promise<BatchProcessorResult[]>

  /**
   * Get the provider ID this processor handles
   */
  getProviderId(): string

  /**
   * Get default batch processing options
   */
  getDefaultOptions(): BatchProcessorOptions
}

export abstract class BaseBatchProcessor implements BatchProcessor {
  protected abstract providerId: string

  abstract processBatch(
    subscriptions: Subscription[],
    accessToken: string,
    options?: Partial<BatchProcessorOptions>
  ): Promise<BatchProcessorResult[]>

  getProviderId(): string {
    return this.providerId
  }

  getDefaultOptions(): BatchProcessorOptions {
    return {
      maxBatchSize: 50,
      maxConcurrency: 5,
      retryAttempts: 3,
      retryDelay: 1000
    }
  }

  /**
   * Split array into chunks of specified size
   */
  protected chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  /**
   * Process multiple promises with concurrency limit
   */
  protected async processWithConcurrency<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    maxConcurrency: number
  ): Promise<R[]> {
    const results: R[] = []
    const executing: Promise<void>[] = []

    for (const item of items) {
      const promise = processor(item).then(result => {
        results.push(result)
      })

      executing.push(promise)

      if (executing.length >= maxConcurrency) {
        await Promise.race(executing)
        executing.splice(
          executing.findIndex(p => p === promise),
          1
        )
      }
    }

    await Promise.all(executing)
    return results
  }

  /**
   * Retry operation with exponential backoff
   */
  protected async retryOperation<T>(
    operation: () => Promise<T>,
    maxAttempts: number,
    baseDelay: number
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt === maxAttempts) {
          throw lastError
        }

        const delay = baseDelay * Math.pow(2, attempt - 1)
        console.log(`[BatchProcessor] Attempt ${attempt} failed, retrying in ${delay}ms: ${lastError.message}`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError
  }
}