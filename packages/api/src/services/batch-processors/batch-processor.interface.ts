import { Subscription, FeedItem } from '@zine/shared'
import { RateLimiter, RateLimiterConfig } from '../../utils/rate-limiter'
import { CircuitBreaker, CircuitBreakerOptions } from '../../utils/circuit-breaker'
import { ProgressTracker } from '../../utils/progress-tracker'
import { ConcurrentQueue, createTask } from '../../utils/concurrent-queue'

export interface BatchProcessorResult {
  subscriptionId: string
  subscriptionTitle: string
  newItems: FeedItem[]
  error?: string
  totalEpisodes?: number // Updated total episodes count from provider
}

export interface BatchProcessorOptions {
  maxBatchSize: number
  maxConcurrency: number
  retryAttempts: number
  retryDelay: number
  useRateLimiter?: boolean
  useCircuitBreaker?: boolean
  onProgress?: (completed: number, total: number) => void
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
  protected rateLimiter?: RateLimiter
  protected circuitBreaker?: CircuitBreaker
  protected progressTracker?: ProgressTracker

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
      retryDelay: 1000,
      useRateLimiter: true,
      useCircuitBreaker: true
    }
  }

  /**
   * Initialize rate limiter and circuit breaker if configured
   */
  protected initializeProcessingUtilities(
    rateLimiterConfig?: Partial<RateLimiterConfig>,
    circuitBreakerConfig?: Partial<CircuitBreakerOptions>
  ): void {
    // Initialize rate limiter if not already created
    if (!this.rateLimiter && rateLimiterConfig) {
      this.rateLimiter = new RateLimiter({
        capacity: 150,
        refillRate: 150,
        refillInterval: 60 * 1000,
        name: this.providerId,
        ...rateLimiterConfig,
      })
    }
    
    // Initialize circuit breaker if not already created
    if (!this.circuitBreaker && circuitBreakerConfig) {
      this.circuitBreaker = new CircuitBreaker({
        failureThreshold: 5,
        failureWindow: 60000,
        recoveryTimeout: 30000,
        successThreshold: 3,
        name: this.providerId,
        ...circuitBreakerConfig,
      })
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
   * Process multiple items with concurrent queue, rate limiting, and circuit breaker
   */
  protected async processWithConcurrency<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    maxConcurrency: number,
    options?: {
      onProgress?: (completed: number, total: number) => void
      useRateLimiter?: boolean
      useCircuitBreaker?: boolean
    }
  ): Promise<R[]> {
    const { onProgress, useRateLimiter = true, useCircuitBreaker = true } = options || {}
    
    // Create concurrent queue
    const queue = new ConcurrentQueue<R>({
      concurrency: maxConcurrency,
      onProgress,
      priorityQueue: true,
    })
    
    const results: Map<number, R> = new Map()
    
    // Create tasks for each item
    const tasks = items.map((item, index) => {
      return createTask(
        index.toString(),
        async () => {
          let processItem = () => processor(item)
          
          // Wrap with circuit breaker if enabled
          if (useCircuitBreaker && this.circuitBreaker) {
            const originalProcess = processItem
            processItem = () => this.circuitBreaker!.execute(originalProcess)
          }
          
          // Wrap with rate limiter if enabled
          if (useRateLimiter && this.rateLimiter) {
            await this.rateLimiter.consume(1)
          }
          
          const result = await processItem()
          results.set(index, result)
          return result
        },
        0 // Default priority
      )
    })
    
    // Add all tasks to queue
    queue.addBatch(tasks)
    
    // Wait for completion
    await queue.waitForCompletion()
    
    // Return results in original order
    const orderedResults: R[] = []
    for (let i = 0; i < items.length; i++) {
      const result = results.get(i)
      if (result !== undefined) {
        orderedResults.push(result)
      }
    }
    
    return orderedResults
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