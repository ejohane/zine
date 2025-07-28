import { D1SubscriptionRepository } from './d1-subscription-repository'

export async function initializeProviders(db: D1Database) {
  // Note: This function is not currently used in the codebase
  // Using dummy environment for provider initialization only
  const dummyEnv = {
    SPOTIFY_CLIENT_ID: 'dummy',
    SPOTIFY_CLIENT_SECRET: 'dummy',
    YOUTUBE_CLIENT_ID: 'dummy',
    YOUTUBE_CLIENT_SECRET: 'dummy',
    API_BASE_URL: 'dummy'
  }
  const repository = new D1SubscriptionRepository(db, dummyEnv)
  
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