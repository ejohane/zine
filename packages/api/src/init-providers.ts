import { D1SubscriptionRepository } from './d1-subscription-repository'

export async function initializeProviders(db: D1Database) {
  const repository = new D1SubscriptionRepository(db)
  
  try {
    // Check if providers already exist
    const existingProviders = await repository.getProviders()
    
    if (existingProviders.length === 0) {
      // Create initial providers
      await repository.createProvider({
        id: 'spotify',
        name: 'Spotify',
        oauthConfig: {
          scopes: ['user-read-playback-position', 'user-library-read'],
          description: 'Access to your Spotify podcast subscriptions'
        }
      })
      
      await repository.createProvider({
        id: 'youtube', 
        name: 'YouTube',
        oauthConfig: {
          scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
          description: 'Access to your YouTube channel subscriptions'
        }
      })
      
      console.log('Subscription providers initialized')
    } else {
      console.log('Subscription providers already exist, skipping initialization')
    }
  } catch (error) {
    console.error('Failed to initialize subscription providers:', error)
    // Don't re-throw the error to avoid breaking the application
  }
}