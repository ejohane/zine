import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { users } from '../schema';
import type { Env } from '../types';
import { getFeatureFlagService } from './feature-flags';

export interface TokenData {
  provider: 'spotify' | 'youtube';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface TokenOperationMetrics {
  operation: 'get' | 'update' | 'refresh';
  source: 'do' | 'd1' | 'both';
  success: boolean;
  latencyMs: number;
  error?: string;
}

export class DualModeTokenService {
  private db: ReturnType<typeof drizzle>;
  private env: Env;
  private metrics: TokenOperationMetrics[] = [];
  private tokenRefreshBuffer = 60 * 60 * 1000; // 1 hour buffer before expiry

  constructor(env: Env) {
    this.env = env;
    this.db = drizzle(env.DB);
  }

  getTokenRefreshBuffer(): number {
    return this.tokenRefreshBuffer;
  }

  /**
   * Get tokens for a user - checks DO first, then D1
   */
  async getTokens(userId: string): Promise<Map<string, TokenData>> {
    const startTime = Date.now();
    const featureFlags = getFeatureFlagService(this.env);
    const shouldUseDO = featureFlags.shouldUseDurableObjects(userId);
    
    let doTokens: Map<string, TokenData> | null = null;
    let d1Tokens: Map<string, TokenData> | null = null;
    let source: 'do' | 'd1' | 'both' = 'd1';
    let error: string | undefined;

    try {
      // Check if user has been migrated to DO
      const user = await this.getUser(userId);
      const hasDurableObject = !!user?.durableObjectId;

      if (shouldUseDO && hasDurableObject) {
        // Try DO first
        try {
          doTokens = await this.getTokensFromDO(userId);
          source = 'do';
          
          // If dual mode is enabled, also fetch from D1 for comparison
          if (featureFlags.getFlag('enableDualModeTokenStorage')) {
            d1Tokens = await this.getTokensFromD1(userId);
            source = 'both';
            
            // Log any discrepancies for monitoring
            this.compareTokens(doTokens, d1Tokens, userId);
          }
        } catch (doError) {
          console.error('Failed to get tokens from DO:', doError);
          error = doError instanceof Error ? doError.message : 'Unknown DO error';
          
          // Fall back to D1
          d1Tokens = await this.getTokensFromD1(userId);
          source = 'd1';
        }
      } else {
        // Use D1 only
        d1Tokens = await this.getTokensFromD1(userId);
        source = 'd1';
      }

      const tokens = doTokens || d1Tokens || new Map();

      if (featureFlags.getFlag('enableMigrationMetrics')) {
        this.recordMetric({
          operation: 'get',
          source,
          success: true,
          latencyMs: Date.now() - startTime,
          error
        });
      }

      return tokens;
    } catch (error) {
      if (featureFlags.getFlag('enableMigrationMetrics')) {
        this.recordMetric({
          operation: 'get',
          source,
          success: false,
          latencyMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      throw error;
    }
  }

  /**
   * Update tokens - writes to both DO and D1 in dual mode
   */
  async updateToken(userId: string, tokenData: TokenData): Promise<void> {
    const startTime = Date.now();
    const featureFlags = getFeatureFlagService(this.env);
    const shouldUseDO = featureFlags.shouldUseDurableObjects(userId);
    
    let source: 'do' | 'd1' | 'both' = 'd1';

    try {
      const user = await this.getUser(userId);
      const hasDurableObject = !!user?.durableObjectId;

      if (shouldUseDO && hasDurableObject) {
        // Update DO
        await this.updateTokenInDO(userId, tokenData);
        source = 'do';

        // If dual mode is enabled, also update D1
        if (featureFlags.getFlag('enableDualModeTokenStorage')) {
          await this.updateTokenInD1(userId, tokenData);
          source = 'both';
        }
      } else {
        // Update D1 only
        await this.updateTokenInD1(userId, tokenData);
        source = 'd1';
      }

      if (featureFlags.getFlag('enableMigrationMetrics')) {
        this.recordMetric({
          operation: 'update',
          source,
          success: true,
          latencyMs: Date.now() - startTime
        });
      }
    } catch (error) {
      if (featureFlags.getFlag('enableMigrationMetrics')) {
        this.recordMetric({
          operation: 'update',
          source,
          success: false,
          latencyMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      throw error;
    }
  }

  /**
   * Refresh tokens
   */
  async refreshTokens(userId: string): Promise<Map<string, TokenData>> {
    const startTime = Date.now();
    const featureFlags = getFeatureFlagService(this.env);
    const shouldUseDO = featureFlags.shouldUseDurableObjects(userId);
    
    let source: 'do' | 'd1' = 'd1';

    try {
      const user = await this.getUser(userId);
      const hasDurableObject = !!user?.durableObjectId;

      if (shouldUseDO && hasDurableObject) {
        // Use DO for refresh
        const doId = this.env.USER_SUBSCRIPTION_MANAGER.idFromString(user.durableObjectId);
        const doStub = this.env.USER_SUBSCRIPTION_MANAGER.get(doId);
        
        const response = await doStub.fetch(
          new Request('https://do.internal/refresh-tokens')
        );
        
        if (!response.ok) {
          throw new Error(`DO refresh failed: ${await response.text()}`);
        }

        source = 'do';
        
        // Get the refreshed tokens
        return await this.getTokensFromDO(userId);
      } else {
        // Use existing token refresh service
        throw new Error('Legacy token refresh not implemented in dual mode');
      }
    } catch (error) {
      if (featureFlags.getFlag('enableMigrationMetrics')) {
        this.recordMetric({
          operation: 'refresh',
          source,
          success: false,
          latencyMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      throw error;
    }
  }

  /**
   * Get tokens from Durable Object
   */
  private async getTokensFromDO(userId: string): Promise<Map<string, TokenData>> {
    // Get the user's durableObjectId from the database
    const user = await this.getUser(userId);
    if (!user?.durableObjectId) {
      throw new Error(`No Durable Object ID found for user ${userId}`);
    }
    
    // Use idFromString with the stored DO ID (already a hex string)
    const doId = this.env.USER_SUBSCRIPTION_MANAGER.idFromString(user.durableObjectId);
    const doStub = this.env.USER_SUBSCRIPTION_MANAGER.get(doId);
    
    const response = await doStub.fetch(
      new Request('https://do.internal/export-tokens')
    );
    
    if (!response.ok) {
      throw new Error(`Failed to get tokens from DO: ${await response.text()}`);
    }

    const tokenData = await response.json() as Record<string, any>;
    const tokens = new Map<string, TokenData>();
    
    for (const [provider, data] of Object.entries(tokenData)) {
      tokens.set(provider, {
        provider: provider as 'spotify' | 'youtube',
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined
      });
    }
    
    return tokens;
  }

  /**
   * Get tokens from D1 database
   */
  private async getTokensFromD1(_userId: string): Promise<Map<string, TokenData>> {
    // NOTE: Token columns have been removed from schema
    // D1 tokens are only available during migration period
    // This function will return empty map after migration
    console.warn('[DualModeTokenService] Token columns removed from D1 - returning empty map');
    
    const tokens = new Map<string, TokenData>();
    return tokens;
  }

  /**
   * Delete a token for a specific provider
   */
  async deleteToken(userId: string, provider: 'spotify' | 'youtube'): Promise<void> {
    try {
      // Get the user's durableObjectId from the database
      const user = await this.getUser(userId);
      if (!user?.durableObjectId) {
        console.warn(`No Durable Object ID found for user ${userId}, cannot delete token`);
        return;
      }
      
      // Use idFromString with the stored DO ID (already a hex string)
      const doId = this.env.USER_SUBSCRIPTION_MANAGER.idFromString(user.durableObjectId);
      const doStub = this.env.USER_SUBSCRIPTION_MANAGER.get(doId);
      
      const response = await doStub.fetch(
        new Request('https://do.internal/delete-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider })
        })
      );
      
      if (!response.ok) {
        throw new Error(`Failed to delete token from DO: ${await response.text()}`);
      }
      
      console.log(`Successfully deleted ${provider} token for user ${userId}`);
    } catch (error) {
      console.error(`Failed to delete token for ${userId}/${provider}:`, error);
      throw error;
    }
  }

  /**
   * Update token in Durable Object
   */
  private async updateTokenInDO(userId: string, tokenData: TokenData): Promise<void> {
    // Get the user's durableObjectId from the database
    const user = await this.getUser(userId);
    if (!user?.durableObjectId) {
      throw new Error(`No Durable Object ID found for user ${userId}`);
    }
    
    // Use idFromString with the stored DO ID (already a hex string)
    const doId = this.env.USER_SUBSCRIPTION_MANAGER.idFromString(user.durableObjectId);
    const doStub = this.env.USER_SUBSCRIPTION_MANAGER.get(doId);
    
    const response = await doStub.fetch(
      new Request('https://do.internal/update-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokenData)
      })
    );
    
    if (!response.ok) {
      throw new Error(`Failed to update token in DO: ${await response.text()}`);
    }
  }

  /**
   * Update token in D1 database
   */
  private async updateTokenInD1(_userId: string, _tokenData: TokenData): Promise<void> {
    // NOTE: Token columns have been removed from schema
    // D1 token updates are only available during migration period
    console.warn('[DualModeTokenService] Cannot update tokens in D1 - columns removed');
  }

  /**
   * Get user record
   */
  private async getUser(userId: string): Promise<any> {
    const result = await this.db.select()
      .from(users)
      .where(eq(users.id, userId))
      .execute();
    
    return result[0];
  }

  /**
   * Compare tokens between DO and D1 for monitoring
   */
  private compareTokens(
    doTokens: Map<string, TokenData>, 
    d1Tokens: Map<string, TokenData>, 
    userId: string
  ): void {
    const discrepancies: string[] = [];
    
    // Check for missing tokens
    for (const [provider, doToken] of doTokens) {
      const d1Token = d1Tokens.get(provider);
      if (!d1Token) {
        discrepancies.push(`Token for ${provider} exists in DO but not in D1`);
      } else {
        // Compare token values
        if (doToken.accessToken !== d1Token.accessToken) {
          discrepancies.push(`Access token mismatch for ${provider}`);
        }
        if (doToken.refreshToken !== d1Token.refreshToken) {
          discrepancies.push(`Refresh token mismatch for ${provider}`);
        }
      }
    }
    
    for (const [provider] of d1Tokens) {
      if (!doTokens.has(provider)) {
        discrepancies.push(`Token for ${provider} exists in D1 but not in DO`);
      }
    }
    
    if (discrepancies.length > 0) {
      console.warn(`Token discrepancies for user ${userId}:`, discrepancies);
    }
  }

  /**
   * Record operation metrics
   */
  private recordMetric(metric: TokenOperationMetrics): void {
    this.metrics.push(metric);
    
    // Keep only last 1000 metrics to prevent memory issues
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): {
    totalOperations: number;
    byOperation: Record<string, number>;
    bySource: Record<string, number>;
    successRate: number;
    averageLatency: number;
    errors: number;
  } {
    const summary = {
      totalOperations: this.metrics.length,
      byOperation: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
      successRate: 0,
      averageLatency: 0,
      errors: 0
    };
    
    let successCount = 0;
    let totalLatency = 0;
    
    for (const metric of this.metrics) {
      // Count by operation
      summary.byOperation[metric.operation] = (summary.byOperation[metric.operation] || 0) + 1;
      
      // Count by source
      summary.bySource[metric.source] = (summary.bySource[metric.source] || 0) + 1;
      
      // Track success/errors
      if (metric.success) {
        successCount++;
      } else {
        summary.errors++;
      }
      
      // Track latency
      totalLatency += metric.latencyMs;
    }
    
    summary.successRate = this.metrics.length > 0 ? (successCount / this.metrics.length) * 100 : 0;
    summary.averageLatency = this.metrics.length > 0 ? totalLatency / this.metrics.length : 0;
    
    return summary;
  }
}