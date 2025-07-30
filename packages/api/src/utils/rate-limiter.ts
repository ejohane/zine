/**
 * Token Bucket Rate Limiter
 * 
 * Implements a token bucket algorithm for precise rate limiting.
 * Tokens are added at a fixed rate and consumed when making requests.
 * If no tokens are available, requests must wait.
 */

export interface RateLimiterConfig {
  /**
   * Maximum number of tokens the bucket can hold
   */
  capacity: number;
  
  /**
   * Number of tokens added per interval
   */
  refillRate: number;
  
  /**
   * Interval in milliseconds for refilling tokens
   */
  refillInterval: number;
  
  /**
   * Optional name for logging/debugging
   */
  name?: string;
}

export interface RateLimiterMetrics {
  totalRequests: number;
  acceptedRequests: number;
  rejectedRequests: number;
  totalWaitTime: number;
  averageWaitTime: number;
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private metrics: RateLimiterMetrics;
  
  constructor(private config: RateLimiterConfig) {
    this.tokens = config.capacity;
    this.lastRefill = Date.now();
    this.metrics = {
      totalRequests: 0,
      acceptedRequests: 0,
      rejectedRequests: 0,
      totalWaitTime: 0,
      averageWaitTime: 0,
    };
  }
  
  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const intervalsElapsed = Math.floor(elapsed / this.config.refillInterval);
    
    if (intervalsElapsed > 0) {
      const tokensToAdd = intervalsElapsed * this.config.refillRate;
      this.tokens = Math.min(this.config.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now - (elapsed % this.config.refillInterval);
    }
  }
  
  /**
   * Check if tokens are available without consuming
   */
  canConsume(tokens: number = 1): boolean {
    this.refill();
    return this.tokens >= tokens;
  }
  
  /**
   * Try to consume tokens immediately
   * Returns true if successful, false if not enough tokens
   */
  tryConsume(tokens: number = 1): boolean {
    this.refill();
    this.metrics.totalRequests++;
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      this.metrics.acceptedRequests++;
      return true;
    }
    
    this.metrics.rejectedRequests++;
    return false;
  }
  
  /**
   * Consume tokens, waiting if necessary
   * Returns a promise that resolves when tokens are consumed
   */
  async consume(tokens: number = 1): Promise<void> {
    const startTime = Date.now();
    
    while (!this.tryConsume(tokens)) {
      // Calculate wait time until next refill
      const now = Date.now();
      const timeSinceLastRefill = now - this.lastRefill;
      const timeUntilNextRefill = this.config.refillInterval - timeSinceLastRefill;
      
      // Wait until next refill
      await new Promise(resolve => setTimeout(resolve, Math.max(1, timeUntilNextRefill)));
    }
    
    const waitTime = Date.now() - startTime;
    this.metrics.totalWaitTime += waitTime;
    this.metrics.averageWaitTime = this.metrics.totalWaitTime / this.metrics.acceptedRequests;
  }
  
  /**
   * Get current metrics
   */
  getMetrics(): RateLimiterMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      acceptedRequests: 0,
      rejectedRequests: 0,
      totalWaitTime: 0,
      averageWaitTime: 0,
    };
  }
  
  /**
   * Get current token count
   */
  getTokenCount(): number {
    this.refill();
    return this.tokens;
  }
}

/**
 * Provider-specific rate limiter configurations
 */
export const RATE_LIMITER_CONFIGS = {
  spotify: {
    // Spotify allows ~180 requests per minute
    // We'll be conservative and use 150/min
    capacity: 150,
    refillRate: 150,
    refillInterval: 60 * 1000, // 1 minute
    name: 'Spotify API',
  },
  youtube: {
    // YouTube has a daily quota of 10,000 units
    // Most read operations cost 1 unit
    // We'll limit to ~7 requests per minute to stay well under daily limit
    capacity: 100,
    refillRate: 7,
    refillInterval: 60 * 1000, // 1 minute
    name: 'YouTube API',
  },
} as const;

/**
 * Rate limiter with exponential backoff for retries
 */
export class RateLimiterWithRetry extends RateLimiter {
  constructor(
    config: RateLimiterConfig,
    private maxRetries: number = 3,
    private baseDelay: number = 1000,
  ) {
    super(config);
  }
  
  /**
   * Execute a function with rate limiting and automatic retry
   */
  async execute<T>(
    fn: () => Promise<T>,
    options: {
      tokens?: number;
      retryOn?: (error: any) => boolean;
    } = {},
  ): Promise<T> {
    const { tokens = 1, retryOn = (error) => error.status === 429 } = options;
    
    let lastError: any;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        // Wait for rate limit
        await this.consume(tokens);
        
        // Execute function
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Check if we should retry
        if (attempt < this.maxRetries && retryOn(error)) {
          // Exponential backoff
          const delay = this.baseDelay * Math.pow(2, attempt);
          console.log(
            `Rate limit retry attempt ${attempt + 1}/${this.maxRetries} after ${delay}ms`,
          );
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
    
    throw lastError;
  }
}