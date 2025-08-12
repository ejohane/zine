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

// Define the environment bindings interface
interface EnvironmentBindings {
  SPOTIFY_CLIENT_ID: string
  SPOTIFY_CLIENT_SECRET: string
  YOUTUBE_CLIENT_ID: string
  YOUTUBE_CLIENT_SECRET: string
  API_BASE_URL: string
  USER_SUBSCRIPTION_MANAGER?: DurableObjectNamespace
}

export class D1SubscriptionRepository implements SubscriptionRepository {
  private db: ReturnType<typeof drizzle>
  private env: EnvironmentBindings

  constructor(d1Database: D1Database, env: EnvironmentBindings) {
    this.db = drizzle(d1Database, { schema })
    this.env = env
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
      
      // Check if user exists and has a valid DO ID
      const existingUser = await this.db.select()
        .from(schema.users)
        .where(eq(schema.users.id, userData.id))
        .get();
      
      let durableObjectIdString: string | null = null;
      let doId: DurableObjectId | null = null;
      
      if (this.env?.USER_SUBSCRIPTION_MANAGER) {
        // Check if existing user has a valid 64-char hex DO ID
        if (existingUser?.durableObjectId && existingUser.durableObjectId.length === 64) {
          // Use existing valid DO ID
          durableObjectIdString = existingUser.durableObjectId;
          doId = this.env.USER_SUBSCRIPTION_MANAGER.idFromString(durableObjectIdString);
        } else {
          // Generate new DO ID using idFromName
          doId = this.env.USER_SUBSCRIPTION_MANAGER.idFromName(userData.id);
          durableObjectIdString = doId.toString(); // Convert to 64-hex string for storage
        }
      }
      
      if (existingUser) {
        // Update existing user
        await this.db.update(schema.users)
          .set({
            email: userData.email || '',
            firstName: userData.firstName || null,
            lastName: userData.lastName || null,
            imageUrl: userData.imageUrl || null,
            durableObjectId: durableObjectIdString,
            updatedAt: now
          })
          .where(eq(schema.users.id, userData.id));
      } else {
        // Insert new user
        await this.db.insert(schema.users).values({
          id: userData.id,
          email: userData.email || '',
          firstName: userData.firstName || null,
          lastName: userData.lastName || null,
          imageUrl: userData.imageUrl || null,
          durableObjectId: durableObjectIdString,
          createdAt: now,
          updatedAt: now
        });
      }
      
      // Initialize the Durable Object if we have access to the namespace
      if (this.env?.USER_SUBSCRIPTION_MANAGER && doId) {
        try {
          const doStub = this.env.USER_SUBSCRIPTION_MANAGER.get(doId);
          
          // Initialize the DO with the user ID
          const response = await doStub.fetch(
            new Request('https://do.internal/init', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: userData.id })
            })
          );
          
          if (!response.ok) {
            console.error(`Failed to initialize DO for user ${userData.id}: ${await response.text()}`);
          } else {
            console.log(`Successfully initialized DO for user ${userData.id}`);
          }
        } catch (doError) {
          console.error(`Error initializing DO for user ${userData.id}:`, doError);
          // Don't fail the user creation if DO initialization fails
        }
      }
      
      console.log('ensureUser completed for:', userData.id)
    } catch (error) {
      console.error('Error in ensureUser:', error)
      throw error
    }
  }

  async getUserAccount(userId: string, providerId: string): Promise<UserAccount | null> {
    try {
      const accounts = await this.db
        .select()
        .from(schema.userAccounts)
        .where(and(
          eq(schema.userAccounts.userId, userId),
          eq(schema.userAccounts.providerId, providerId)
        ))
        .limit(1)
      
      return accounts.length > 0 ? this.mapUserAccount(accounts[0]) : null
    } catch (error) {
      // If table doesn't exist, return null instead of throwing
      if (error instanceof Error && error.message.includes('no such table')) {
        console.warn(`Table user_accounts does not exist. Returning null for getUserAccount(${userId}, ${providerId})`)
        return null
      }
      throw error
    }
  }

  async createUserAccount(account: Omit<UserAccount, 'createdAt' | 'updatedAt'>): Promise<UserAccount> {
    const now = new Date()
    const newAccount = {
      id: account.id,
      userId: account.userId,
      providerId: account.providerId,
      externalAccountId: account.externalAccountId,
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

  async updateUserAccount(id: string, _updates: Partial<Pick<UserAccount, 'accessToken' | 'refreshToken' | 'expiresAt'>>): Promise<UserAccount> {
    const now = new Date()
    // Since tokens are stored in Durable Objects, we only update the timestamp
    const updateData = {
      updatedAt: now
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
    // Since tokens are stored in Durable Objects, we can't check validity here
    // Just return the first active account for the provider
    const accounts = await this.getUserAccountsByProvider(providerId)
    
    // Return the first account if any exist
    // Note: isActive column doesn't exist in user_accounts table
    if (accounts.length > 0) {
      return accounts[0]
    }
    
    // Log warning if this method is called
    console.warn('[D1SubscriptionRepository] getValidUserAccountForProvider called but tokens are in DOs');
    
    return null
  }

  async getValidUserAccount(userId: string, providerId: string): Promise<UserAccount | null> {
    // Since tokens are stored in Durable Objects, we can't check validity here
    // Just return the account if it exists and is active
    const userAccount = await this.getUserAccount(userId, providerId)
    
    if (!userAccount) {
      return null
    }

    // Account exists, return it
    // Note: isActive column doesn't exist in user_accounts table

    // Log warning if this method is called
    console.warn('[D1SubscriptionRepository] getValidUserAccount called but tokens are in DOs');
    
    return userAccount
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
      totalEpisodes: subscription.totalEpisodes || null,
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

  async updateSubscription(id: string, updates: Partial<Pick<Subscription, 'totalEpisodes'>>): Promise<Subscription> {
    await this.db
      .update(schema.subscriptions)
      .set(updates)
      .where(eq(schema.subscriptions.id, id))
    
    const updated = await this.getSubscription(id)
    if (!updated) {
      throw new Error(`Subscription ${id} not found after update`)
    }
    
    return updated
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
      userId: row.user_id || row.userId,
      providerId: row.provider_id || row.providerId,
      externalAccountId: row.external_account_id || row.externalAccountId,
      // Tokens are stored in Durable Objects, not in D1
      // Return empty values to satisfy the interface
      accessToken: '',
      refreshToken: undefined,
      expiresAt: undefined,
      isActive: row.isActive === 1,
      createdAt: new Date(row.created_at || row.createdAt),
      updatedAt: new Date(row.updated_at || row.updatedAt)
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

  // Batch update methods for better performance
  async batchUpdateUserSubscriptions(
    updates: Array<{ id: string; isActive: boolean }>
  ): Promise<void> {
    if (updates.length === 0) return

    const now = new Date()
    const BATCH_SIZE = 50 // Process in smaller batches to avoid SQL limits

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE)
      
      // Build batch update SQL
      const promises = batch.map(update => 
        this.db
          .update(schema.userSubscriptions)
          .set({ 
            isActive: update.isActive,
            updatedAt: now 
          })
          .where(eq(schema.userSubscriptions.id, update.id))
      )
      
      // Execute batch in parallel
      await Promise.all(promises)
    }
  }

  async batchCreateUserSubscriptions(
    userSubscriptions: Array<Omit<UserSubscription, 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    if (userSubscriptions.length === 0) return

    const now = new Date()
    const BATCH_SIZE = 50

    for (let i = 0; i < userSubscriptions.length; i += BATCH_SIZE) {
      const batch = userSubscriptions.slice(i, i + BATCH_SIZE)
      
      const values = batch.map(sub => ({
        id: sub.id,
        userId: sub.userId,
        subscriptionId: sub.subscriptionId,
        isActive: sub.isActive,
        createdAt: now,
        updatedAt: now
      }))
      
      await this.db.insert(schema.userSubscriptions).values(values)
    }
  }
}