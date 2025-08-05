import { SubscriptionRepository, UserAccount } from '@zine/shared';
import { D1SubscriptionRepository } from '../d1-subscription-repository';
import { DualModeTokenService } from '../services/dual-mode-token-service';
import type { Env } from '../types';

/**
 * Wrapper for SubscriptionRepository that intercepts token operations
 * and routes them through the DualModeTokenService
 */
export class DualModeSubscriptionRepository implements SubscriptionRepository {
  private baseRepository: D1SubscriptionRepository;
  private tokenService: DualModeTokenService;

  constructor(env: Env) {
    this.baseRepository = new D1SubscriptionRepository(env.DB, env);
    this.tokenService = new DualModeTokenService(env);
  }

  // Delegate all non-token methods to base repository
  async getUserAccountsByProvider(provider: string): Promise<UserAccount[]> {
    return this.baseRepository.getUserAccountsByProvider(provider);
  }

  async getUserAccountByProvider(userId: string, provider: string): Promise<UserAccount | null> {
    return this.baseRepository.getUserAccountByProvider(userId, provider);
  }

  async createUserAccount(account: Omit<UserAccount, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserAccount> {
    // Create account in D1 first
    const newAccount = await this.baseRepository.createUserAccount(account);
    
    // Also update DO if user has been migrated
    try {
      await this.tokenService.updateToken(account.userId, {
        provider: account.providerId as 'spotify' | 'youtube',
        accessToken: account.accessToken,
        refreshToken: account.refreshToken || undefined,
        expiresAt: account.expiresAt || undefined
      });
    } catch (error) {
      console.error('Failed to update token in DO after account creation:', error);
      // Don't fail the operation if DO update fails
    }
    
    return newAccount;
  }

  async updateUserAccount(id: string, updates: Partial<Pick<UserAccount, 'accessToken' | 'refreshToken' | 'expiresAt'>>): Promise<UserAccount> {
    // Get the account to know the userId and provider
    const account = await this.baseRepository.getUserAccountById(id);
    if (!account) {
      throw new Error(`Account ${id} not found`);
    }

    // Update using dual-mode token service
    if (updates.accessToken || updates.refreshToken || updates.expiresAt) {
      await this.tokenService.updateToken(account.userId, {
        provider: account.providerId as 'spotify' | 'youtube',
        accessToken: updates.accessToken || account.accessToken,
        refreshToken: updates.refreshToken !== undefined ? updates.refreshToken : account.refreshToken,
        expiresAt: updates.expiresAt !== undefined ? updates.expiresAt : account.expiresAt
      });
    }

    // Also update D1 (dual-mode service handles this based on feature flags)
    return this.baseRepository.updateUserAccount(id, updates);
  }

  async getValidUserAccount(userId: string, provider: string): Promise<UserAccount | null> {
    // Use dual-mode token service to get tokens
    const tokens = await this.tokenService.getTokens(userId);
    const tokenData = tokens.get(provider);
    
    if (!tokenData) {
      return null;
    }

    // Get the base account info from D1
    const account = await this.baseRepository.getUserAccountByProvider(userId, provider);
    if (!account) {
      return null;
    }

    // Check if token needs refresh
    const needsRefresh = tokenData.expiresAt && tokenData.expiresAt <= new Date(Date.now() + 60 * 60 * 1000);
    
    if (needsRefresh) {
      try {
        // Refresh using dual-mode service
        const refreshedTokens = await this.tokenService.refreshTokens(userId);
        const refreshedToken = refreshedTokens.get(provider);
        
        if (refreshedToken) {
          // Update the account with refreshed token data
          return {
            ...account,
            accessToken: refreshedToken.accessToken,
            refreshToken: refreshedToken.refreshToken,
            expiresAt: refreshedToken.expiresAt
          };
        }
      } catch (error) {
        console.error('Failed to refresh token:', error);
      }
    }

    // Return account with token data from dual-mode service
    return {
      ...account,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: tokenData.expiresAt
    };
  }

  // Delegate all other methods to base repository
  async getUserAccountById(id: string): Promise<UserAccount | null> {
    return this.baseRepository.getUserAccountById(id);
  }

  async deleteUserAccount(id: string): Promise<void> {
    return this.baseRepository.deleteUserAccount(id);
  }

  async getProviders(): Promise<any[]> {
    return this.baseRepository.getProviders();
  }

  async getAvailableSubscriptions(provider: string): Promise<any[]> {
    return this.baseRepository.getAvailableSubscriptions(provider);
  }

  async getUserSubscriptions(userId: string, provider?: string): Promise<any[]> {
    return this.baseRepository.getUserSubscriptions(userId, provider);
  }

  async updateUserSubscriptions(userId: string, provider: string, subscriptionIds: string[]): Promise<void> {
    return this.baseRepository.updateUserSubscriptions(userId, provider, subscriptionIds);
  }

  async getFeedItems(options: any): Promise<any> {
    return this.baseRepository.getFeedItems(options);
  }

  async getUserFeedItemsCount(userId: string, options?: any): Promise<number> {
    return this.baseRepository.getUserFeedItemsCount(userId, options);
  }

  async markFeedItemAsRead(userId: string, feedItemId: string, bookmarkId?: number): Promise<void> {
    return this.baseRepository.markFeedItemAsRead(userId, feedItemId, bookmarkId);
  }

  async markFeedItemAsUnread(userId: string, feedItemId: string): Promise<void> {
    return this.baseRepository.markFeedItemAsUnread(userId, feedItemId);
  }

  async createFeedItems(items: any[]): Promise<any[]> {
    return this.baseRepository.createFeedItems(items);
  }

  async createUserFeedItems(userFeedItems: any[]): Promise<void> {
    return this.baseRepository.createUserFeedItems(userFeedItems);
  }

  async checkExistingFeedItems(subscriptionId: string, externalIds: string[]): Promise<Set<string>> {
    return this.baseRepository.checkExistingFeedItems(subscriptionId, externalIds);
  }

  async checkExistingUserFeedItems(userId: string, feedItemIds: string[]): Promise<Set<string>> {
    return this.baseRepository.checkExistingUserFeedItems(userId, feedItemIds);
  }

  async createSubscription(subscription: any): Promise<any> {
    return this.baseRepository.createSubscription(subscription);
  }

  async updateSubscription(id: string, updates: any): Promise<any> {
    return this.baseRepository.updateSubscription(id, updates);
  }

  async getSubscriptionByExternalId(providerId: string, externalId: string): Promise<any | null> {
    return this.baseRepository.getSubscriptionByExternalId(providerId, externalId);
  }

  async countFeedItemsByDateRange(startDate: Date, endDate: Date): Promise<{ subscriptionId: string; count: number }[]> {
    return this.baseRepository.countFeedItemsByDateRange(startDate, endDate);
  }

  /**
   * Get metrics from the dual-mode token service
   */
  getTokenServiceMetrics() {
    return this.tokenService.getMetricsSummary();
  }
}