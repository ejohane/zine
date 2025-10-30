import type { Env } from '../types';
import { OAuthService } from '../oauth/oauth-service';
import { getOAuthProviders } from '../oauth/oauth-config';
import { SingleUserPollingService, UserPollResult } from './single-user-polling-service';

export interface OAuthTokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // timestamp
  lastRefresh: number; // timestamp
  provider: 'spotify' | 'youtube';
}

export interface SubscriptionCache {
  id: string;
  title: string;
  type: 'spotify' | 'youtube';
  lastPolled: number; // timestamp
  feedUrl?: string;
  channelId?: string;
  showId?: string;
}

export interface PollResult {
  success: boolean;
  newItemsCount: number;
  errors: string[];
  results: UserPollResult[];
}

export interface RefreshAttempt {
  count: number;
  lastAttempt: number; // timestamp
  nextAllowedAttempt: number; // timestamp
}

export class UserSubscriptionManager {
  private state: DurableObjectState;
  private env: Env;
  private userId: string | null = null;
  private tokenRefreshBuffer: number = 60 * 60 * 1000; // 1 hour

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    try {
      switch (url.pathname) {
        case '/init':
          return await this.handleInit(request);
        case '/poll':
          return await this.handlePoll();
        case '/refresh-tokens':
          return await this.handleTokenRefresh();
        case '/update-token':
          return await this.handleTokenUpdate(request);
        case '/get-tokens':
          return await this.handleGetTokens();
        case '/get-subscriptions':
          return await this.handleGetSubscriptions();
        case '/status':
          return await this.handleStatus();
        case '/validate-tokens':
          return await this.handleValidateTokens();
        case '/export-tokens':
          return await this.handleExportTokens();
        case '/delete-token':
          return await this.handleDeleteToken(request);
        default:
          return new Response('Not found', { status: 404 });
      }
    } catch (error) {
      console.error('DO error:', error);
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  async alarm(): Promise<void> {
    // Alarms are not used in current architecture
    // Polling is triggered by cron job sending /poll requests
    console.log('[DO] Alarm triggered but not used - polling handled by cron job');
  }

  private async handleInit(request: Request): Promise<Response> {
    const { userId } = await request.json() as { userId: string };
    this.userId = userId;
    await this.state.storage.put('userId', userId);
    
    // Initialize from database
    await this.initializeFromDatabase();
    
    // Note: No alarm scheduling needed - polling is triggered by cron job
    
    return new Response(
      JSON.stringify({ success: true, userId }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private async handlePoll(): Promise<Response> {
    const result = await this.pollSubscriptions();
    return new Response(
      JSON.stringify(result),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private async handleTokenRefresh(): Promise<Response> {
    const tokens = await this.state.storage.get<Map<string, OAuthTokenData>>('tokens') || new Map();
    const refreshResults: Record<string, boolean> = {};
    
    for (const [provider, token] of tokens) {
      try {
        const refreshed = await this.refreshToken(provider as 'spotify' | 'youtube', token);
        if (refreshed) {
          tokens.set(provider, refreshed);
          refreshResults[provider] = true;
        }
      } catch (error) {
        console.error(`Failed to refresh ${provider} token:`, error);
        refreshResults[provider] = false;
      }
    }
    
    await this.state.storage.put('tokens', tokens);
    
    return new Response(
      JSON.stringify({ refreshResults }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private async handleTokenUpdate(request: Request): Promise<Response> {
    const tokenData = await request.json() as any;
    console.log(`[DO] Received token update for provider ${tokenData.provider}`)
    
    const tokens = await this.state.storage.get<Map<string, OAuthTokenData>>('tokens') || new Map();
    console.log(`[DO] Current tokens count: ${tokens.size}`)
    
    // Validate token data
    if (!this.isValidTokenData(tokenData)) {
      console.error(`[DO] Invalid token data received:`, {
        hasAccessToken: !!tokenData?.accessToken,
        hasRefreshToken: !!tokenData?.refreshToken,
        hasExpiresAt: !!tokenData?.expiresAt,
        hasLastRefresh: !!tokenData?.lastRefresh,
        provider: tokenData?.provider
      })
      return new Response(
        JSON.stringify({ error: 'Invalid token data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    tokens.set(tokenData.provider, tokenData);
    await this.state.storage.put('tokens', tokens);
    console.log(`[DO] Successfully stored token for ${tokenData.provider}, total tokens: ${tokens.size}`)
    
    // Clear any refresh attempt tracking for this provider
    const refreshAttempts = await this.state.storage.get<Map<string, RefreshAttempt>>('refreshAttempts') || new Map();
    refreshAttempts.delete(tokenData.provider);
    await this.state.storage.put('refreshAttempts', refreshAttempts);
    
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private async handleGetTokens(): Promise<Response> {
    const tokens = await this.state.storage.get<Map<string, OAuthTokenData>>('tokens') || new Map();
    const tokenData: Record<string, Omit<OAuthTokenData, 'accessToken' | 'refreshToken'>> = {};
    
    for (const [provider, token] of tokens) {
      tokenData[provider] = {
        expiresAt: token.expiresAt,
        lastRefresh: token.lastRefresh,
        provider: token.provider
      };
    }
    
    return new Response(
      JSON.stringify(tokenData),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private async handleGetSubscriptions(): Promise<Response> {
    const subscriptions = await this.state.storage.get<Map<string, SubscriptionCache>>('subscriptions') || new Map();
    
    return new Response(
      JSON.stringify(Array.from(subscriptions.values())),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private async handleStatus(): Promise<Response> {
    const userId = await this.state.storage.get<string>('userId');
    const tokens = await this.state.storage.get<Map<string, OAuthTokenData>>('tokens') || new Map();
    const subscriptions = await this.state.storage.get<Map<string, SubscriptionCache>>('subscriptions') || new Map();
    const lastPollTime = await this.state.storage.get<number>('lastPollTime');
    const nextAlarm = await this.state.storage.getAlarm();
    
    // Check token validity
    const tokenStatus: Record<string, { valid: boolean; expiresAt: Date }> = {};
    for (const [provider, token] of tokens) {
      tokenStatus[provider] = {
        valid: this.isTokenValid(token),
        expiresAt: new Date(token.expiresAt)
      };
    }
    
    return new Response(
      JSON.stringify({
        userId,
        tokenCount: tokens.size,
        tokenStatus,
        subscriptionCount: subscriptions.size,
        lastPollTime: lastPollTime ? new Date(lastPollTime) : null,
        nextAlarm: nextAlarm ? new Date(nextAlarm) : null
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private async handleValidateTokens(): Promise<Response> {
    const tokens = await this.state.storage.get<Map<string, OAuthTokenData>>('tokens') || new Map();
    const validationResults: Record<string, boolean> = {};
    
    for (const [provider, token] of tokens) {
      validationResults[provider] = this.isTokenValid(token);
    }
    
    return new Response(
      JSON.stringify({ validationResults }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private async handleExportTokens(): Promise<Response> {
    const userId = await this.state.storage.get<string>('userId');
    const tokens = await this.state.storage.get<Map<string, OAuthTokenData>>('tokens') || new Map();
    
    console.log(`[DO] Exporting tokens for user ${userId}, count: ${tokens.size}`)
    
    const exportData: Record<string, OAuthTokenData> = {};
    
    // Convert Map to object for export
    for (const [provider, token] of tokens) {
      console.log(`[DO] Exporting token for provider ${provider}, has accessToken: ${!!token.accessToken}`)
      exportData[provider] = token;
    }
    
    return new Response(
      JSON.stringify(exportData),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private async handleDeleteToken(request: Request): Promise<Response> {
    const { provider } = await request.json() as { provider: string };
    
    if (!provider) {
      return new Response(
        JSON.stringify({ error: 'Provider is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const tokens = await this.state.storage.get<Map<string, OAuthTokenData>>('tokens') || new Map();
    
    if (!tokens.has(provider)) {
      return new Response(
        JSON.stringify({ error: `No token found for provider: ${provider}` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    tokens.delete(provider);
    await this.state.storage.put('tokens', tokens);
    
    // Also clear any refresh attempts for this provider
    const refreshAttempts = await this.state.storage.get<Map<string, RefreshAttempt>>('refreshAttempts') || new Map();
    refreshAttempts.delete(provider);
    await this.state.storage.put('refreshAttempts', refreshAttempts);
    
    console.log(`Deleted token for provider: ${provider}`);
    
    return new Response(
      JSON.stringify({ success: true, message: `Token for ${provider} deleted` }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  private async initializeFromDatabase(): Promise<void> {
    const userId = this.userId || await this.state.storage.get<string>('userId');
    if (!userId) return;
    
    try {
      // Check if tokens already exist in DO storage
      const existingTokens = await this.state.storage.get<Map<string, OAuthTokenData>>('tokens');
      if (existingTokens && existingTokens.size > 0) {
        console.log(`DO for user ${userId} already has ${existingTokens.size} tokens`);
        return;
      }
      
      // Only fetch provider information from database (no tokens)
      // This method is primarily used during migration when tokens are still in DB
      const accounts = await this.env.DB.prepare(`
        SELECT
          id,
          provider_id as provider,
          is_active as isActive
        FROM user_accounts
        WHERE user_id = ? AND is_active = 1
      `).bind(userId).all();
      
      console.log(`Found ${accounts.results.length} active accounts for user ${userId}`);
      
      // During migration, tokens will be added via the /update-token endpoint
      // This just ensures the DO knows which providers the user has connected
      
    } catch (error) {
      console.error('Failed to initialize from database:', error);
    }
  }

  private async pollSubscriptions(): Promise<PollResult> {
    const result: PollResult = {
      success: false,
      newItemsCount: 0,
      errors: [],
      results: []
    };
    
    try {
      const userId = await this.state.storage.get<string>('userId');
      if (!userId) {
        result.errors.push('User ID not initialized');
        return result;
      }
      
      const tokens = await this.state.storage.get<Map<string, OAuthTokenData>>('tokens') || new Map();
      if (tokens.size === 0) {
        result.errors.push('No tokens available');
        return result;
      }
      
      // Refresh expired tokens before polling
      await this.refreshExpiredTokens();
      
      // Reload tokens after refresh to get the updated access tokens
      const refreshedTokens = await this.state.storage.get<Map<string, OAuthTokenData>>('tokens') || new Map();
      
      // Use the single-user polling service
      const pollingService = new SingleUserPollingService(userId, this.env);
      const pollResults = await pollingService.pollUserSubscriptions(refreshedTokens);
      
      // Aggregate results
      result.results = pollResults;
      result.newItemsCount = pollResults.reduce((sum, r) => sum + r.newItemsFound, 0);
      result.success = true;
      
      // Extract any errors
      for (const pollResult of pollResults) {
        if (pollResult.errors && pollResult.errors.length > 0) {
          result.errors.push(...pollResult.errors);
        }
      }
      
      await this.state.storage.put('lastPollTime', Date.now());
      
      console.log(`[DO] User ${userId} polling complete: ${result.newItemsCount} new items found`);
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
      console.error(`[DO] User polling error:`, error);
    }
    
    return result;
  }

  private async refreshToken(provider: 'spotify' | 'youtube', token: OAuthTokenData): Promise<OAuthTokenData | null> {
    // Check exponential backoff
    if (!await this.canAttemptRefresh(provider)) {
      console.log(`Skipping refresh for ${provider} due to exponential backoff`);
      return null;
    }
    
    try {
      const oauthProviders = getOAuthProviders(this.env);
      const oauthProvider = oauthProviders[provider];
      if (!oauthProvider) {
        throw new Error(`No OAuth provider for: ${provider}`);
      }
      
      const oauthService = new OAuthService(oauthProvider.config);
      const response = await oauthService.refreshToken(token.refreshToken);
      
      const newToken: OAuthTokenData = {
        accessToken: response.access_token,
        refreshToken: response.refresh_token || token.refreshToken, // Some providers don't return new refresh token
        expiresAt: Date.now() + (response.expires_in || 3600) * 1000,
        lastRefresh: Date.now(),
        provider
      };
      
      // Clear refresh attempt tracking on success
      await this.recordRefreshAttempt(provider, true);
      
      return newToken;
    } catch (error) {
      console.error(`Failed to refresh ${provider} token:`, error);
      await this.recordRefreshAttempt(provider, false);
      throw error;
    }
  }

  private async refreshExpiredTokens(): Promise<void> {
    const tokens = await this.state.storage.get<Map<string, OAuthTokenData>>('tokens') || new Map();
    const oneHourFromNow = Date.now() + this.tokenRefreshBuffer;
    
    for (const [provider, token] of tokens) {
      if (token.expiresAt <= oneHourFromNow) {
        console.log(`Token for ${provider} expires within 1 hour, attempting refresh`);
        
        try {
          const refreshed = await this.refreshToken(provider as 'spotify' | 'youtube', token);
          if (refreshed) {
            tokens.set(provider, refreshed);
            console.log(`Successfully refreshed ${provider} token`);
          }
        } catch (error) {
          console.error(`Failed to refresh ${provider} token:`, error);
        }
      }
    }
    
    await this.state.storage.put('tokens', tokens);
  }

  private async canAttemptRefresh(provider: string): Promise<boolean> {
    const refreshAttempts = await this.state.storage.get<Map<string, RefreshAttempt>>('refreshAttempts') || new Map();
    const attempt = refreshAttempts.get(provider);
    
    if (!attempt) {
      return true; // First attempt
    }
    
    return Date.now() >= attempt.nextAllowedAttempt;
  }

  private async recordRefreshAttempt(provider: string, success: boolean): Promise<void> {
    const refreshAttempts = await this.state.storage.get<Map<string, RefreshAttempt>>('refreshAttempts') || new Map();
    
    if (success) {
      refreshAttempts.delete(provider);
    } else {
      const existing = refreshAttempts.get(provider);
      const attemptCount = existing ? existing.count + 1 : 1;
      
      // Exponential backoff: 2^attemptCount minutes, max 4 hours
      const backoffMinutes = Math.min(Math.pow(2, attemptCount), 240);
      const now = Date.now();
      const nextAllowedAttempt = now + backoffMinutes * 60 * 1000;
      
      refreshAttempts.set(provider, {
        count: attemptCount,
        lastAttempt: now,
        nextAllowedAttempt
      });
      
      console.log(`Provider ${provider} failed refresh attempt ${attemptCount}, next attempt allowed at ${new Date(nextAllowedAttempt).toISOString()}`);
    }
    
    await this.state.storage.put('refreshAttempts', refreshAttempts);
  }

  private isTokenValid(token: OAuthTokenData): boolean {
    return token.expiresAt > Date.now();
  }

  private isValidTokenData(data: any): data is OAuthTokenData {
    return (
      typeof data === 'object' &&
      typeof data.accessToken === 'string' &&
      typeof data.refreshToken === 'string' &&
      typeof data.expiresAt === 'number' &&
      typeof data.lastRefresh === 'number' &&
      (data.provider === 'spotify' || data.provider === 'youtube')
    );
  }

  // Not used - polling is triggered by cron job
  // private async scheduleNextAlarm(): Promise<void> {
  //   // Keeping method for backward compatibility
  // }
}