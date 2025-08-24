import * as SecureStore from 'expo-secure-store'

// Secure storage keys
export enum SecureStorageKeys {
  AUTH_TOKEN = 'auth_token',
  REFRESH_TOKEN = 'refresh_token',
  CLERK_SESSION = 'clerk_session',
  SPOTIFY_TOKEN = 'spotify_token',
  SPOTIFY_REFRESH_TOKEN = 'spotify_refresh_token',
  YOUTUBE_TOKEN = 'youtube_token',
  YOUTUBE_REFRESH_TOKEN = 'youtube_refresh_token',
  USER_ID = 'user_id',
  USER_EMAIL = 'user_email',
}

// Secure storage wrapper with error handling
export const secureStorage = {
  // Get item from secure store
  getItem: async (key: SecureStorageKeys): Promise<string | null> => {
    try {
      const value = await SecureStore.getItemAsync(key)
      return value
    } catch (error) {
      console.error(`Error getting secure item ${key}:`, error)
      return null
    }
  },

  // Set item in secure store
  setItem: async (key: SecureStorageKeys, value: string): Promise<boolean> => {
    try {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      })
      return true
    } catch (error) {
      console.error(`Error setting secure item ${key}:`, error)
      return false
    }
  },

  // Delete item from secure store
  deleteItem: async (key: SecureStorageKeys): Promise<boolean> => {
    try {
      await SecureStore.deleteItemAsync(key)
      return true
    } catch (error) {
      console.error(`Error deleting secure item ${key}:`, error)
      return false
    }
  },

  // Check if secure storage is available
  isAvailable: async (): Promise<boolean> => {
    try {
      return await SecureStore.isAvailableAsync()
    } catch (error) {
      console.error('Error checking secure storage availability:', error)
      return false
    }
  },
}

// Auth token management
export const authStorage = {
  // Get auth tokens
  getTokens: async () => {
    const [authToken, refreshToken] = await Promise.all([
      secureStorage.getItem(SecureStorageKeys.AUTH_TOKEN),
      secureStorage.getItem(SecureStorageKeys.REFRESH_TOKEN),
    ])
    
    return {
      authToken,
      refreshToken,
    }
  },

  // Set auth tokens
  setTokens: async (authToken: string, refreshToken?: string) => {
    const results = await Promise.all([
      secureStorage.setItem(SecureStorageKeys.AUTH_TOKEN, authToken),
      refreshToken ? secureStorage.setItem(SecureStorageKeys.REFRESH_TOKEN, refreshToken) : Promise.resolve(true),
    ])
    
    return results.every(result => result)
  },

  // Clear auth tokens
  clearTokens: async () => {
    const results = await Promise.all([
      secureStorage.deleteItem(SecureStorageKeys.AUTH_TOKEN),
      secureStorage.deleteItem(SecureStorageKeys.REFRESH_TOKEN),
    ])
    
    return results.every(result => result)
  },

  // Get user info
  getUserInfo: async () => {
    const [userId, userEmail] = await Promise.all([
      secureStorage.getItem(SecureStorageKeys.USER_ID),
      secureStorage.getItem(SecureStorageKeys.USER_EMAIL),
    ])
    
    return {
      userId,
      userEmail,
    }
  },

  // Set user info
  setUserInfo: async (userId: string, userEmail: string) => {
    const results = await Promise.all([
      secureStorage.setItem(SecureStorageKeys.USER_ID, userId),
      secureStorage.setItem(SecureStorageKeys.USER_EMAIL, userEmail),
    ])
    
    return results.every(result => result)
  },

  // Clear all auth data
  clearAll: async () => {
    const keys = [
      SecureStorageKeys.AUTH_TOKEN,
      SecureStorageKeys.REFRESH_TOKEN,
      SecureStorageKeys.CLERK_SESSION,
      SecureStorageKeys.USER_ID,
      SecureStorageKeys.USER_EMAIL,
    ]
    
    const results = await Promise.all(
      keys.map(key => secureStorage.deleteItem(key))
    )
    
    return results.every(result => result)
  },
}

// OAuth token management
export const oauthStorage = {
  // Spotify tokens
  getSpotifyTokens: async () => {
    const [token, refreshToken] = await Promise.all([
      secureStorage.getItem(SecureStorageKeys.SPOTIFY_TOKEN),
      secureStorage.getItem(SecureStorageKeys.SPOTIFY_REFRESH_TOKEN),
    ])
    
    return { token, refreshToken }
  },

  setSpotifyTokens: async (token: string, refreshToken?: string) => {
    const results = await Promise.all([
      secureStorage.setItem(SecureStorageKeys.SPOTIFY_TOKEN, token),
      refreshToken ? secureStorage.setItem(SecureStorageKeys.SPOTIFY_REFRESH_TOKEN, refreshToken) : Promise.resolve(true),
    ])
    
    return results.every(result => result)
  },

  clearSpotifyTokens: async () => {
    const results = await Promise.all([
      secureStorage.deleteItem(SecureStorageKeys.SPOTIFY_TOKEN),
      secureStorage.deleteItem(SecureStorageKeys.SPOTIFY_REFRESH_TOKEN),
    ])
    
    return results.every(result => result)
  },

  // YouTube tokens
  getYouTubeTokens: async () => {
    const [token, refreshToken] = await Promise.all([
      secureStorage.getItem(SecureStorageKeys.YOUTUBE_TOKEN),
      secureStorage.getItem(SecureStorageKeys.YOUTUBE_REFRESH_TOKEN),
    ])
    
    return { token, refreshToken }
  },

  setYouTubeTokens: async (token: string, refreshToken?: string) => {
    const results = await Promise.all([
      secureStorage.setItem(SecureStorageKeys.YOUTUBE_TOKEN, token),
      refreshToken ? secureStorage.setItem(SecureStorageKeys.YOUTUBE_REFRESH_TOKEN, refreshToken) : Promise.resolve(true),
    ])
    
    return results.every(result => result)
  },

  clearYouTubeTokens: async () => {
    const results = await Promise.all([
      secureStorage.deleteItem(SecureStorageKeys.YOUTUBE_TOKEN),
      secureStorage.deleteItem(SecureStorageKeys.YOUTUBE_REFRESH_TOKEN),
    ])
    
    return results.every(result => result)
  },

  // Clear all OAuth tokens
  clearAll: async () => {
    const results = await Promise.all([
      oauthStorage.clearSpotifyTokens(),
      oauthStorage.clearYouTubeTokens(),
    ])
    
    return results.every(result => result)
  },
}

// Clerk session management
export const clerkStorage = {
  getSession: async (): Promise<string | null> => {
    return secureStorage.getItem(SecureStorageKeys.CLERK_SESSION)
  },

  setSession: async (session: string): Promise<boolean> => {
    return secureStorage.setItem(SecureStorageKeys.CLERK_SESSION, session)
  },

  clearSession: async (): Promise<boolean> => {
    return secureStorage.deleteItem(SecureStorageKeys.CLERK_SESSION)
  },
}