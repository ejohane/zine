import { Context } from 'hono';

export interface RateLimitResult {
  allowed: boolean;
  remainingTime?: number; // milliseconds until next allowed request
  lastRefresh?: number; // timestamp of last refresh
}

export class RateLimiter {
  private static readonly RATE_LIMIT_KEY_PREFIX = 'rate_limit:manual_refresh:';
  private static readonly RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes in milliseconds

  /**
   * Check if a user is allowed to make a manual refresh request
   * Uses KV storage to track last refresh time
   */
  static async checkRateLimit(
    c: Context,
    userId: string
  ): Promise<RateLimitResult> {
    const kv = c.env.KV as KVNamespace;
    if (!kv) {
      // If KV is not configured, allow the request
      console.warn('KV namespace not configured for rate limiting');
      return { allowed: true };
    }

    const key = `${this.RATE_LIMIT_KEY_PREFIX}${userId}`;
    
    try {
      const lastRefreshStr = await kv.get(key);
      
      if (!lastRefreshStr) {
        // First refresh, allow it
        return { allowed: true };
      }

      const lastRefresh = parseInt(lastRefreshStr, 10);
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefresh;

      if (timeSinceLastRefresh >= this.RATE_LIMIT_WINDOW) {
        // Enough time has passed, allow the refresh
        return { 
          allowed: true,
          lastRefresh 
        };
      }

      // Rate limited
      const remainingTime = this.RATE_LIMIT_WINDOW - timeSinceLastRefresh;
      return {
        allowed: false,
        remainingTime,
        lastRefresh
      };
    } catch (error) {
      console.error('Error checking rate limit:', error);
      // On error, allow the request but log the issue
      return { allowed: true };
    }
  }

  /**
   * Record a manual refresh request for rate limiting
   */
  static async recordRefresh(
    c: Context,
    userId: string
  ): Promise<void> {
    const kv = c.env.KV as KVNamespace;
    if (!kv) {
      console.warn('KV namespace not configured for rate limiting');
      return;
    }

    const key = `${this.RATE_LIMIT_KEY_PREFIX}${userId}`;
    const now = Date.now();

    try {
      // Store with expiration slightly longer than rate limit window
      await kv.put(key, now.toString(), {
        expirationTtl: Math.ceil(this.RATE_LIMIT_WINDOW / 1000) + 60 // Add 60 seconds buffer
      });
    } catch (error) {
      console.error('Error recording refresh:', error);
      // Continue even if recording fails
    }
  }

  /**
   * Get formatted message for rate limited response
   */
  static getRateLimitMessage(remainingTime: number): string {
    const minutes = Math.ceil(remainingTime / 60000);
    const seconds = Math.ceil((remainingTime % 60000) / 1000);
    
    if (minutes > 0) {
      return `Please wait ${minutes} minute${minutes > 1 ? 's' : ''} before refreshing again`;
    }
    return `Please wait ${seconds} second${seconds > 1 ? 's' : ''} before refreshing again`;
  }
}