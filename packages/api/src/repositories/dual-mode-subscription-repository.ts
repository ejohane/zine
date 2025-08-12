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
 * 
 * Also exposes D1-specific helper methods for data initialization
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
    // Get all accounts for this provider from D1
    const accounts = await this.baseRepository.getUserAccountsByProvider(providerId);
    
    if (accounts.length === 0) {
      return null;
    }
    
    // Try to find an account with valid tokens from DO
    for (const account of accounts) {
      try {
        // Get tokens from dual-mode service
        const tokens = await this.tokenService.getTokens(account.userId);
        const tokenData = tokens.get(providerId);
        
        if (tokenData && tokenData.accessToken) {
          // Check if token needs refresh
          const needsRefresh = tokenData.expiresAt && 
            tokenData.expiresAt <= new Date(Date.now() + this.tokenService.getTokenRefreshBuffer());
          
          if (needsRefresh) {
            try {
              // Try to refresh the token
              const refreshedTokens = await this.tokenService.refreshTokens(account.userId);
              const refreshedToken = refreshedTokens.get(providerId);
              
              if (refreshedToken && refreshedToken.accessToken) {
                return {
                  ...account,
                  accessToken: refreshedToken.accessToken,
                  refreshToken: refreshedToken.refreshToken,
                  expiresAt: refreshedToken.expiresAt
                };
              }
            } catch (refreshError) {
              console.error(`Failed to refresh token for user ${account.userId}:`, refreshError);
              // Continue to next account if refresh fails
              continue;
            }
          }
          
          // Return account with valid token
          return {
            ...account,
            accessToken: tokenData.accessToken,
            refreshToken: tokenData.refreshToken,
            expiresAt: tokenData.expiresAt
          };
        }
      } catch (error) {
        console.error(`Error getting tokens for user ${account.userId}:`, error);
        // Continue to next account if there's an error
        continue;
      }
    }
    
    // No valid account found
    console.warn(`No valid account with tokens found for provider ${providerId}`);
    return null;
  }

  async createUserAccount(account: Omit<UserAccount, 'createdAt' | 'updatedAt'>): Promise<UserAccount> {
    // Create account in D1 first
    const newAccount = await this.baseRepository.createUserAccount(account);
    
    // Also update DO if user has been migrated
    try {
      if (account.accessToken) {
        await this.tokenService.updateToken(account.userId, {
          provider: account.providerId as 'spotify' | 'youtube',
          accessToken: account.accessToken,
          refreshToken: account.refreshToken || undefined,
          expiresAt: account.expiresAt || undefined
        });
      }
    } catch (error) {
      console.error('Failed to update token in DO after account creation:', error);
      // Don't fail the operation if DO update fails
    }
    
    return newAccount;
  }

  async updateUserAccount(id: string, updates: Partial<Pick<UserAccount, 'accessToken' | 'refreshToken' | 'expiresAt'>>): Promise<UserAccount> {
    // Update the account in D1
    const updatedAccount = await this.baseRepository.updateUserAccount(id, updates);
    
    // Also update tokens in Durable Object if tokens are being updated
    if (updates.accessToken || updates.refreshToken) {
      try {
        await this.tokenService.updateToken(updatedAccount.userId, {
          provider: updatedAccount.providerId as 'spotify' | 'youtube',
          accessToken: updates.accessToken || updatedAccount.accessToken || '',
          refreshToken: updates.refreshToken || updatedAccount.refreshToken,
          expiresAt: updates.expiresAt || updatedAccount.expiresAt
        });
      } catch (error) {
        console.error(`Failed to update tokens in DO for user ${updatedAccount.userId}:`, error);
        // Don't fail the whole operation if DO update fails
      }
    }
    
    return updatedAccount;
  }

  async getValidUserAccount(userId: string, providerId: string): Promise<UserAccount | null> {
    console.log(`[DualModeRepo] Getting valid account for user ${userId}, provider ${providerId}`)
    
    // Get the base account info from D1 first to check if account exists
    const account = await this.baseRepository.getUserAccount(userId, providerId);
    if (!account) {
      console.log(`[DualModeRepo] No account found in D1 for user ${userId}, provider ${providerId}`)
      return null;
    }
    
    console.log(`[DualModeRepo] Found account in D1: ${account.id}, provider: ${account.providerId}`)

    // Try to get tokens from dual-mode token service
    let tokens: Map<string, any>;
    try {
      tokens = await this.tokenService.getTokens(userId);
      console.log(`[DualModeRepo] Retrieved tokens map, size: ${tokens.size}, providers: ${Array.from(tokens.keys()).join(', ')}`)
    } catch (error) {
      console.error(`[DualModeRepo] Failed to get tokens for user ${userId}:`, error);
      return null;
    }
    
    const tokenData = tokens.get(providerId);
    
    // If no token data found, account exists but has no valid tokens
    if (!tokenData || !tokenData.accessToken) {
      console.warn(`[DualModeRepo] Account exists for ${userId}/${providerId} but no valid tokens found. TokenData: ${JSON.stringify(tokenData)}`)
      return null;
    }
    
    console.log(`[DualModeRepo] Found valid token for ${userId}/${providerId}`)

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

  // Helper methods for ensuring data exists
  async ensureUser(userData: {
    id: string
    email?: string
    firstName?: string
    lastName?: string
    imageUrl?: string
  }): Promise<void> {
    return this.baseRepository.ensureUser(userData);
  }

  async ensureProvider(provider: { id: string; name: string; oauthConfig: string }): Promise<void> {
    return this.baseRepository.ensureProvider(provider);
  }

  /**
   * Get metrics from the dual-mode token service
   */
  getTokenServiceMetrics() {
    return this.tokenService.getMetricsSummary();
  }
}