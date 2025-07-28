import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc } from 'drizzle-orm'
import * as schema from './schema'
import { 
  SubscriptionRepository,
  SubscriptionProvider,
  UserAccount,
  Subscription,
  UserSubscription
} from '@zine/shared'

export class D1SubscriptionRepository implements SubscriptionRepository {
  private db: ReturnType<typeof drizzle>

  constructor(d1Database: D1Database) {
    this.db = drizzle(d1Database, { schema })
  }

  async getProviders(): Promise<SubscriptionProvider[]> {
    const providers = await this.db.select().from(schema.subscriptionProviders)
    return providers.map(this.mapSubscriptionProvider)
  }

  async getProvider(id: string): Promise<SubscriptionProvider | null> {
    const providers = await this.db
      .select()
      .from(schema.subscriptionProviders)
      .where(eq(schema.subscriptionProviders.id, id))
      .limit(1)
    
    return providers.length > 0 ? this.mapSubscriptionProvider(providers[0]) : null
  }

  async createProvider(provider: Omit<SubscriptionProvider, 'createdAt'>): Promise<SubscriptionProvider> {
    const now = new Date()
    const newProvider = {
      id: provider.id,
      name: provider.name,
      oauthConfig: JSON.stringify(provider.oauthConfig),
      createdAt: now
    }

    await this.db.insert(schema.subscriptionProviders).values(newProvider)
    
    return {
      ...provider,
      createdAt: now
    }
  }

  async ensureProvider(provider: { id: string; name: string; oauthConfig: string }): Promise<void> {
    const existing = await this.getProvider(provider.id)
    if (!existing) {
      console.log(`Creating provider: ${provider.id}`)
      await this.createProvider({
        id: provider.id,
        name: provider.name,
        oauthConfig: JSON.parse(provider.oauthConfig)
      })
    } else {
      console.log(`Provider ${provider.id} already exists`)
    }
  }

  async ensureUser(userData: {
    id: string
    email?: string
    firstName?: string
    lastName?: string
    imageUrl?: string
  }): Promise<void> {
    try {
      const now = new Date()
      
      console.log('Running ensureUser for:', userData.id)
      await this.db.insert(schema.users).values({
        id: userData.id,
        email: userData.email || '',
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        imageUrl: userData.imageUrl || null,
        createdAt: now,
        updatedAt: now
      }).onConflictDoNothing()
      
      console.log('ensureUser completed for:', userData.id)
    } catch (error) {
      console.error('Error in ensureUser:', error)
      throw error
    }
  }

  async getUserAccount(userId: string, providerId: string): Promise<UserAccount | null> {
    const accounts = await this.db
      .select()
      .from(schema.userAccounts)
      .where(and(
        eq(schema.userAccounts.userId, userId),
        eq(schema.userAccounts.providerId, providerId)
      ))
      .limit(1)
    
    return accounts.length > 0 ? this.mapUserAccount(accounts[0]) : null
  }

  async createUserAccount(account: Omit<UserAccount, 'createdAt' | 'updatedAt'>): Promise<UserAccount> {
    const now = new Date()
    const newAccount = {
      id: account.id,
      userId: account.userId,
      providerId: account.providerId,
      externalAccountId: account.externalAccountId,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken || null,
      expiresAt: account.expiresAt || null,
      createdAt: now,
      updatedAt: now
    }

    await this.db.insert(schema.userAccounts).values(newAccount)
    
    return {
      ...account,
      createdAt: now,
      updatedAt: now
    }
  }

  async updateUserAccount(id: string, updates: Partial<Pick<UserAccount, 'accessToken' | 'refreshToken' | 'expiresAt'>>): Promise<UserAccount> {
    const now = new Date()
    const updateData: any = {
      updatedAt: now
    }

    if (updates.accessToken) updateData.accessToken = updates.accessToken
    if (updates.refreshToken !== undefined) updateData.refreshToken = updates.refreshToken
    if (updates.expiresAt !== undefined) {
      updateData.expiresAt = updates.expiresAt || null
    }

    await this.db
      .update(schema.userAccounts)
      .set(updateData)
      .where(eq(schema.userAccounts.id, id))

    // Fetch and return updated account
    const accounts = await this.db
      .select()
      .from(schema.userAccounts)
      .where(eq(schema.userAccounts.id, id))
      .limit(1)
    
    if (accounts.length === 0) {
      throw new Error('UserAccount not found')
    }

    return this.mapUserAccount(accounts[0])
  }

  async deleteUserAccount(id: string): Promise<void> {
    await this.db
      .delete(schema.userAccounts)
      .where(eq(schema.userAccounts.id, id))
  }

  async getUserAccountsByProvider(providerId: string): Promise<UserAccount[]> {
    const accounts = await this.db
      .select()
      .from(schema.userAccounts)
      .where(eq(schema.userAccounts.providerId, providerId))
    
    return accounts.map(this.mapUserAccount)
  }

  async getValidUserAccountForProvider(providerId: string): Promise<UserAccount | null> {
    // Get all accounts for this provider and find one with a valid (non-expired) token
    const accounts = await this.getUserAccountsByProvider(providerId)
    
    const now = new Date()
    for (const account of accounts) {
      // Check if token is not expired (or if expiresAt is null, assume it's valid)
      if (!account.expiresAt || account.expiresAt > now) {
        return account
      }
    }
    
    // If no valid tokens found, try to refresh one
    for (const account of accounts) {
      if (account.refreshToken) {
        // TODO: Implement token refresh logic
        console.log(`Could refresh token for account ${account.id}, but refresh logic not implemented yet`)
      }
    }
    
    return null
  }

  async getUsersForSubscription(subscriptionId: string): Promise<string[]> {
    const userSubscriptions = await this.db
      .select({
        userId: schema.userSubscriptions.userId
      })
      .from(schema.userSubscriptions)
      .where(and(
        eq(schema.userSubscriptions.subscriptionId, subscriptionId),
        eq(schema.userSubscriptions.isActive, true)
      ))
    
    return userSubscriptions.map(us => us.userId)
  }

  async getSubscription(id: string): Promise<Subscription | null> {
    const subscriptions = await this.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, id))
      .limit(1)
    
    return subscriptions.length > 0 ? this.mapSubscription(subscriptions[0]) : null
  }

  async getSubscriptionsByProvider(providerId: string): Promise<Subscription[]> {
    const subscriptions = await this.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.providerId, providerId))
    
    return subscriptions.map(this.mapSubscription)
  }

  async createSubscription(subscription: Omit<Subscription, 'createdAt'>): Promise<Subscription> {
    const now = new Date()
    const newSubscription = {
      id: subscription.id,
      providerId: subscription.providerId,
      externalId: subscription.externalId,
      title: subscription.title,
      creatorName: subscription.creatorName,
      description: subscription.description || null,
      thumbnailUrl: subscription.thumbnailUrl || null,
      subscriptionUrl: subscription.subscriptionUrl || null,
      createdAt: now
    }

    await this.db.insert(schema.subscriptions).values(newSubscription)
    
    return {
      ...subscription,
      createdAt: now
    }
  }

  async findOrCreateSubscription(subscription: Omit<Subscription, 'id' | 'createdAt'>): Promise<Subscription> {
    // Try to find existing subscription
    const existing = await this.db
      .select()
      .from(schema.subscriptions)
      .where(and(
        eq(schema.subscriptions.providerId, subscription.providerId),
        eq(schema.subscriptions.externalId, subscription.externalId)
      ))
      .limit(1)

    if (existing.length > 0) {
      return this.mapSubscription(existing[0])
    }

    // Create new subscription
    const id = `${subscription.providerId}-${subscription.externalId}-${Date.now()}`
    return this.createSubscription({ ...subscription, id })
  }

  async getUserSubscriptions(userId: string): Promise<(UserSubscription & { subscription: Subscription })[]> {
    const userSubs = await this.db
      .select({
        userSubscription: schema.userSubscriptions,
        subscription: schema.subscriptions
      })
      .from(schema.userSubscriptions)
      .innerJoin(schema.subscriptions, eq(schema.userSubscriptions.subscriptionId, schema.subscriptions.id))
      .where(eq(schema.userSubscriptions.userId, userId))
      .orderBy(desc(schema.userSubscriptions.updatedAt))

    return userSubs.map(row => ({
      ...this.mapUserSubscription(row.userSubscription),
      subscription: this.mapSubscription(row.subscription)
    }))
  }

  async getUserSubscriptionsByProvider(userId: string, providerId: string): Promise<(UserSubscription & { subscription: Subscription })[]> {
    const userSubs = await this.db
      .select({
        userSubscription: schema.userSubscriptions,
        subscription: schema.subscriptions
      })
      .from(schema.userSubscriptions)
      .innerJoin(schema.subscriptions, eq(schema.userSubscriptions.subscriptionId, schema.subscriptions.id))
      .where(and(
        eq(schema.userSubscriptions.userId, userId),
        eq(schema.subscriptions.providerId, providerId)
      ))
      .orderBy(desc(schema.userSubscriptions.updatedAt))

    return userSubs.map(row => ({
      ...this.mapUserSubscription(row.userSubscription),
      subscription: this.mapSubscription(row.subscription)
    }))
  }

  async createUserSubscription(userSubscription: Omit<UserSubscription, 'createdAt' | 'updatedAt'>): Promise<UserSubscription> {
    const now = new Date()
    const newUserSub = {
      id: userSubscription.id,
      userId: userSubscription.userId,
      subscriptionId: userSubscription.subscriptionId,
      isActive: userSubscription.isActive,
      createdAt: now,
      updatedAt: now
    }

    await this.db.insert(schema.userSubscriptions).values(newUserSub)
    
    return {
      ...userSubscription,
      createdAt: now,
      updatedAt: now
    }
  }

  async updateUserSubscription(id: string, updates: Partial<Pick<UserSubscription, 'isActive'>>): Promise<UserSubscription> {
    const now = new Date()
    const updateData: any = {
      updatedAt: now
    }

    if (updates.isActive !== undefined) {
      updateData.isActive = updates.isActive
    }

    await this.db
      .update(schema.userSubscriptions)
      .set(updateData)
      .where(eq(schema.userSubscriptions.id, id))

    // Fetch and return updated user subscription
    const userSubs = await this.db
      .select()
      .from(schema.userSubscriptions)
      .where(eq(schema.userSubscriptions.id, id))
      .limit(1)
    
    if (userSubs.length === 0) {
      throw new Error('UserSubscription not found')
    }

    return this.mapUserSubscription(userSubs[0])
  }

  async deleteUserSubscription(id: string): Promise<void> {
    await this.db
      .delete(schema.userSubscriptions)
      .where(eq(schema.userSubscriptions.id, id))
  }

  private mapSubscriptionProvider(row: any): SubscriptionProvider {
    return {
      id: row.id,
      name: row.name,
      oauthConfig: JSON.parse(row.oauthConfig),
      createdAt: new Date(row.createdAt)
    }
  }

  private mapUserAccount(row: any): UserAccount {
    return {
      id: row.id,
      userId: row.userId,
      providerId: row.providerId,
      externalAccountId: row.externalAccountId,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken || undefined,
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    }
  }

  private mapSubscription(row: any): Subscription {
    return {
      id: row.id,
      providerId: row.providerId,
      externalId: row.externalId,
      title: row.title,
      creatorName: row.creatorName,
      description: row.description || undefined,
      thumbnailUrl: row.thumbnailUrl || undefined,
      subscriptionUrl: row.subscriptionUrl || undefined,
      createdAt: new Date(row.createdAt)
    }
  }

  private mapUserSubscription(row: any): UserSubscription {
    return {
      id: row.id,
      userId: row.userId,
      subscriptionId: row.subscriptionId,
      isActive: Boolean(row.isActive),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    }
  }
}