import { 
  SubscriptionRepository, 
  SubscriptionProvider, 
  UserAccount, 
  Subscription, 
  UserSubscription 
} from './subscription-repository'

export class MockSubscriptionRepository implements SubscriptionRepository {
  private providers: SubscriptionProvider[] = [
    {
      id: 'spotify',
      name: 'Spotify',
      oauthConfig: {
        clientId: 'mock-spotify-client-id',
        scopes: ['user-read-playback-position', 'user-library-read']
      },
      createdAt: new Date()
    },
    {
      id: 'youtube',
      name: 'YouTube',
      oauthConfig: {
        clientId: 'mock-youtube-client-id',
        scopes: ['https://www.googleapis.com/auth/youtube.readonly']
      },
      createdAt: new Date()
    }
  ]

  private userAccounts: UserAccount[] = []
  private subscriptions: Subscription[] = []
  private userSubscriptions: UserSubscription[] = []

  async getProviders(): Promise<SubscriptionProvider[]> {
    return this.providers
  }

  async getProvider(id: string): Promise<SubscriptionProvider | null> {
    return this.providers.find(p => p.id === id) || null
  }

  async createProvider(provider: Omit<SubscriptionProvider, 'createdAt'>): Promise<SubscriptionProvider> {
    const newProvider = {
      ...provider,
      createdAt: new Date()
    }
    this.providers.push(newProvider)
    return newProvider
  }

  async getUserAccount(userId: string, providerId: string): Promise<UserAccount | null> {
    return this.userAccounts.find(a => a.userId === userId && a.providerId === providerId) || null
  }

  async createUserAccount(account: Omit<UserAccount, 'createdAt' | 'updatedAt'>): Promise<UserAccount> {
    const newAccount: UserAccount = {
      ...account,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    this.userAccounts.push(newAccount)
    return newAccount
  }

  async updateUserAccount(id: string, updates: Partial<Pick<UserAccount, 'accessToken' | 'refreshToken' | 'expiresAt'>>): Promise<UserAccount> {
    const accountIndex = this.userAccounts.findIndex(a => a.id === id)
    if (accountIndex === -1) {
      throw new Error('UserAccount not found')
    }
    
    this.userAccounts[accountIndex] = {
      ...this.userAccounts[accountIndex],
      ...updates,
      updatedAt: new Date()
    }
    return this.userAccounts[accountIndex]
  }

  async deleteUserAccount(id: string): Promise<void> {
    const accountIndex = this.userAccounts.findIndex(a => a.id === id)
    if (accountIndex !== -1) {
      this.userAccounts.splice(accountIndex, 1)
    }
  }

  async getSubscription(id: string): Promise<Subscription | null> {
    return this.subscriptions.find(s => s.id === id) || null
  }

  async getSubscriptionsByProvider(providerId: string): Promise<Subscription[]> {
    return this.subscriptions.filter(s => s.providerId === providerId)
  }

  async createSubscription(subscription: Omit<Subscription, 'createdAt'>): Promise<Subscription> {
    const newSubscription: Subscription = {
      ...subscription,
      createdAt: new Date()
    }
    this.subscriptions.push(newSubscription)
    return newSubscription
  }

  async findOrCreateSubscription(subscription: Omit<Subscription, 'id' | 'createdAt'>): Promise<Subscription> {
    const existing = this.subscriptions.find(
      s => s.providerId === subscription.providerId && s.externalId === subscription.externalId
    )
    
    if (existing) {
      return existing
    }
    
    return this.createSubscription({
      ...subscription,
      id: `${subscription.providerId}-${subscription.externalId}-${Date.now()}`
    })
  }

  async getUserSubscriptions(userId: string): Promise<(UserSubscription & { subscription: Subscription })[]> {
    return this.userSubscriptions
      .filter(us => us.userId === userId)
      .map(us => {
        const subscription = this.subscriptions.find(s => s.id === us.subscriptionId)!
        return { ...us, subscription }
      })
  }

  async getUserSubscriptionsByProvider(userId: string, providerId: string): Promise<(UserSubscription & { subscription: Subscription })[]> {
    return this.userSubscriptions
      .filter(us => us.userId === userId)
      .map(us => {
        const subscription = this.subscriptions.find(s => s.id === us.subscriptionId)!
        return { ...us, subscription }
      })
      .filter(item => item.subscription.providerId === providerId)
  }

  async createUserSubscription(userSubscription: Omit<UserSubscription, 'createdAt' | 'updatedAt'>): Promise<UserSubscription> {
    const newUserSubscription: UserSubscription = {
      ...userSubscription,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    this.userSubscriptions.push(newUserSubscription)
    return newUserSubscription
  }

  async updateUserSubscription(id: string, updates: Partial<Pick<UserSubscription, 'isActive'>>): Promise<UserSubscription> {
    const userSubIndex = this.userSubscriptions.findIndex(us => us.id === id)
    if (userSubIndex === -1) {
      throw new Error('UserSubscription not found')
    }
    
    this.userSubscriptions[userSubIndex] = {
      ...this.userSubscriptions[userSubIndex],
      ...updates,
      updatedAt: new Date()
    }
    return this.userSubscriptions[userSubIndex]
  }

  async deleteUserSubscription(id: string): Promise<void> {
    const userSubIndex = this.userSubscriptions.findIndex(us => us.id === id)
    if (userSubIndex !== -1) {
      this.userSubscriptions.splice(userSubIndex, 1)
    }
  }
}