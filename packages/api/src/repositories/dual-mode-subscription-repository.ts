import { 
  SubscriptionRepository, 
  UserAccount, 
  SubscriptionProvider, 
  Subscription, 
  UserSubscription 
} from '@zine/shared';
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

  // Provider operations
  async getProviders(): Promise<SubscriptionProvider[]> {
    return this.baseRepository.getProviders();
  }

  async getProvider(id: string): Promise<SubscriptionProvider | null> {
    return this.baseRepository.getProvider(id);
  }

  async createProvider(provider: Omit<SubscriptionProvider, 'createdAt'>): Promise<SubscriptionProvider> {
    return this.baseRepository.createProvider(provider);
  }

  // User account operations
  async getUserAccount(userId: string, providerId: string): Promise<UserAccount | null> {
    return this.baseRepository.getUserAccount(userId, providerId);
  }

  async getUserAccountsByProvider(providerId: string): Promise<UserAccount[]> {
    return this.baseRepository.getUserAccountsByProvider(providerId);
  }

  async getValidUserAccountForProvider(providerId: string): Promise<UserAccount | null> {
    return this.baseRepository.getValidUserAccountForProvider(providerId);
  }

  async createUserAccount(account: Omit<UserAccount, 'createdAt' | 'updatedAt'>): Promise<UserAccount> {
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
    // NOTE: Since getUserAccountById doesn't exist, we need to find the account another way
    // This is a temporary workaround - ideally we should add getUserAccountById to D1SubscriptionRepository
    return this.baseRepository.updateUserAccount(id, updates);
  }

  async getValidUserAccount(userId: string, providerId: string): Promise<UserAccount | null> {
    // Use dual-mode token service to get tokens
    const tokens = await this.tokenService.getTokens(userId);
    const tokenData = tokens.get(providerId);
    
    if (!tokenData) {
      return null;
    }

    // Get the base account info from D1
    const account = await this.baseRepository.getUserAccount(userId, providerId);
    if (!account) {
      return null;
    }

    // Check if token needs refresh
    const needsRefresh = tokenData.expiresAt && tokenData.expiresAt <= new Date(Date.now() + 60 * 60 * 1000);
    
    if (needsRefresh) {
      try {
        // Refresh using dual-mode service
        const refreshedTokens = await this.tokenService.refreshTokens(userId);
        const refreshedToken = refreshedTokens.get(providerId);
        
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

  async deleteUserAccount(id: string): Promise<void> {
    return this.baseRepository.deleteUserAccount(id);
  }

  // Subscription operations
  async getSubscription(id: string): Promise<Subscription | null> {
    return this.baseRepository.getSubscription(id);
  }

  async getSubscriptionsByProvider(providerId: string): Promise<Subscription[]> {
    return this.baseRepository.getSubscriptionsByProvider(providerId);
  }

  async createSubscription(subscription: Omit<Subscription, 'createdAt'>): Promise<Subscription> {
    return this.baseRepository.createSubscription(subscription);
  }

  async findOrCreateSubscription(subscription: Omit<Subscription, 'id' | 'createdAt'>): Promise<Subscription> {
    return this.baseRepository.findOrCreateSubscription(subscription);
  }

  async updateSubscription(id: string, updates: Partial<Pick<Subscription, 'totalEpisodes'>>): Promise<Subscription> {
    return this.baseRepository.updateSubscription(id, updates);
  }

  // User subscription operations
  async getUserSubscriptions(userId: string): Promise<(UserSubscription & { subscription: Subscription })[]> {
    return this.baseRepository.getUserSubscriptions(userId);
  }

  async getUserSubscriptionsByProvider(userId: string, providerId: string): Promise<(UserSubscription & { subscription: Subscription })[]> {
    return this.baseRepository.getUserSubscriptionsByProvider(userId, providerId);
  }

  async getUsersForSubscription(subscriptionId: string): Promise<string[]> {
    return this.baseRepository.getUsersForSubscription(subscriptionId);
  }

  async createUserSubscription(userSubscription: Omit<UserSubscription, 'createdAt' | 'updatedAt'>): Promise<UserSubscription> {
    return this.baseRepository.createUserSubscription(userSubscription);
  }

  async updateUserSubscription(id: string, updates: Partial<Pick<UserSubscription, 'isActive'>>): Promise<UserSubscription> {
    return this.baseRepository.updateUserSubscription(id, updates);
  }

  async deleteUserSubscription(id: string): Promise<void> {
    return this.baseRepository.deleteUserSubscription(id);
  }

  /**
   * Get metrics from the dual-mode token service
   */
  getTokenServiceMetrics() {
    return this.tokenService.getMetricsSummary();
  }
}