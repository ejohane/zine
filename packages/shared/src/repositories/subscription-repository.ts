export interface SubscriptionProvider {
  id: string
  name: string
  oauthConfig: object
  createdAt: Date
}

export interface UserAccount {
  id: string
  userId: string
  providerId: string
  externalAccountId: string
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface Subscription {
  id: string
  providerId: string
  externalId: string
  title: string
  creatorName: string
  description?: string
  thumbnailUrl?: string
  subscriptionUrl?: string
  createdAt: Date
}

export interface UserSubscription {
  id: string
  userId: string
  subscriptionId: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface SubscriptionRepository {
  // Provider operations
  getProviders(): Promise<SubscriptionProvider[]>
  getProvider(id: string): Promise<SubscriptionProvider | null>
  createProvider(provider: Omit<SubscriptionProvider, 'createdAt'>): Promise<SubscriptionProvider>

  // User account operations
  getUserAccount(userId: string, providerId: string): Promise<UserAccount | null>
  getUserAccountsByProvider(providerId: string): Promise<UserAccount[]>
  getValidUserAccountForProvider(providerId: string): Promise<UserAccount | null>
  getValidUserAccount(userId: string, providerId: string): Promise<UserAccount | null>
  createUserAccount(account: Omit<UserAccount, 'createdAt' | 'updatedAt'>): Promise<UserAccount>
  updateUserAccount(id: string, updates: Partial<Pick<UserAccount, 'accessToken' | 'refreshToken' | 'expiresAt'>>): Promise<UserAccount>
  deleteUserAccount(id: string): Promise<void>

  // Subscription operations
  getSubscription(id: string): Promise<Subscription | null>
  getSubscriptionsByProvider(providerId: string): Promise<Subscription[]>
  createSubscription(subscription: Omit<Subscription, 'createdAt'>): Promise<Subscription>
  findOrCreateSubscription(subscription: Omit<Subscription, 'id' | 'createdAt'>): Promise<Subscription>

  // User subscription operations
  getUserSubscriptions(userId: string): Promise<(UserSubscription & { subscription: Subscription })[]>
  getUserSubscriptionsByProvider(userId: string, providerId: string): Promise<(UserSubscription & { subscription: Subscription })[]>
  getUsersForSubscription(subscriptionId: string): Promise<string[]>
  createUserSubscription(userSubscription: Omit<UserSubscription, 'createdAt' | 'updatedAt'>): Promise<UserSubscription>
  updateUserSubscription(id: string, updates: Partial<Pick<UserSubscription, 'isActive'>>): Promise<UserSubscription>
  deleteUserSubscription(id: string): Promise<void>
}