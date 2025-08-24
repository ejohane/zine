import AsyncStorage from '@react-native-async-storage/async-storage'

// Storage keys enum for type safety
export enum StorageKeys {
  // User preferences
  THEME = 'theme',
  LOCALE = 'locale',
  NOTIFICATIONS_ENABLED = 'notifications_enabled',
  
  // App state
  ONBOARDING_COMPLETED = 'onboarding_completed',
  LAST_SYNC_TIME = 'last_sync_time',
  
  // Cache keys
  BOOKMARKS_CACHE = 'bookmarks_cache',
  FEED_CACHE = 'feed_cache',
  SUBSCRIPTIONS_CACHE = 'subscriptions_cache',
  
  // Queue
  OFFLINE_QUEUE = 'offline_queue',
  PLAYBACK_QUEUE = 'playback_queue',
  
  // Settings
  DEFAULT_FEED_CATEGORY = 'default_feed_category',
  BOOKMARK_SORT_ORDER = 'bookmark_sort_order',
  AUTO_MARK_AS_READ = 'auto_mark_as_read',
}

// Type-safe storage helpers (now async)
export const storageHelpers = {
  // String operations
  getString: async (key: StorageKeys): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(key)
    } catch (error) {
      console.error(`Error getting string for key ${key}:`, error)
      return null
    }
  },
  
  setString: async (key: StorageKeys, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, value)
    } catch (error) {
      console.error(`Error setting string for key ${key}:`, error)
    }
  },
  
  // Boolean operations
  getBoolean: async (key: StorageKeys): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(key)
      return value === 'true'
    } catch (error) {
      console.error(`Error getting boolean for key ${key}:`, error)
      return false
    }
  },
  
  setBoolean: async (key: StorageKeys, value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, String(value))
    } catch (error) {
      console.error(`Error setting boolean for key ${key}:`, error)
    }
  },
  
  // Number operations
  getNumber: async (key: StorageKeys): Promise<number | null> => {
    try {
      const value = await AsyncStorage.getItem(key)
      return value ? Number(value) : null
    } catch (error) {
      console.error(`Error getting number for key ${key}:`, error)
      return null
    }
  },
  
  setNumber: async (key: StorageKeys, value: number): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, String(value))
    } catch (error) {
      console.error(`Error setting number for key ${key}:`, error)
    }
  },
  
  // JSON operations
  getJSON: async <T>(key: StorageKeys): Promise<T | null> => {
    try {
      const value = await AsyncStorage.getItem(key)
      return value ? JSON.parse(value) : null
    } catch (error) {
      console.error(`Error parsing JSON for key ${key}:`, error)
      return null
    }
  },
  
  setJSON: async <T>(key: StorageKeys, value: T): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.error(`Error stringifying JSON for key ${key}:`, error)
    }
  },
  
  // Delete operation
  remove: async (key: StorageKeys): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key)
    } catch (error) {
      console.error(`Error removing key ${key}:`, error)
    }
  },
  
  // Check if key exists
  has: async (key: StorageKeys): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(key)
      return value !== null
    } catch (error) {
      console.error(`Error checking key ${key}:`, error)
      return false
    }
  },
  
  // Clear all storage
  clearAll: async (): Promise<void> => {
    try {
      await AsyncStorage.clear()
    } catch (error) {
      console.error('Error clearing storage:', error)
    }
  },
  
  // Get all keys
  getAllKeys: async (): Promise<string[]> => {
    try {
      const keys = await AsyncStorage.getAllKeys()
      return [...keys] // Convert readonly to mutable array
    } catch (error) {
      console.error('Error getting all keys:', error)
      return []
    }
  },
}

// Cache utilities (now async)
export const cacheUtils = {
  // Save data with timestamp
  saveWithTimestamp: async <T>(key: StorageKeys, data: T): Promise<void> => {
    const cacheData = {
      data,
      timestamp: Date.now(),
    }
    await storageHelpers.setJSON(key, cacheData)
  },
  
  // Get data if not expired
  getWithExpiry: async <T>(key: StorageKeys, maxAge: number): Promise<T | null> => {
    const cached = await storageHelpers.getJSON<{ data: T; timestamp: number }>(key)
    
    if (!cached) return null
    
    const age = Date.now() - cached.timestamp
    if (age > maxAge) {
      await storageHelpers.remove(key)
      return null
    }
    
    return cached.data
  },
  
  // Clear all cache keys
  clearCache: async (): Promise<void> => {
    const cacheKeys = [
      StorageKeys.BOOKMARKS_CACHE,
      StorageKeys.FEED_CACHE,
      StorageKeys.SUBSCRIPTIONS_CACHE,
    ]
    
    await Promise.all(cacheKeys.map(key => storageHelpers.remove(key)))
  },
}

// Offline queue utilities (now async)
export const offlineQueue = {
  // Add item to queue
  add: async (item: any): Promise<void> => {
    const queue = await storageHelpers.getJSON<any[]>(StorageKeys.OFFLINE_QUEUE) || []
    queue.push({
      ...item,
      timestamp: Date.now(),
      id: `${Date.now()}-${Math.random()}`,
    })
    await storageHelpers.setJSON(StorageKeys.OFFLINE_QUEUE, queue)
  },
  
  // Get all queue items
  getAll: async (): Promise<any[]> => {
    return await storageHelpers.getJSON<any[]>(StorageKeys.OFFLINE_QUEUE) || []
  },
  
  // Remove item from queue
  remove: async (id: string): Promise<void> => {
    const queue = await storageHelpers.getJSON<any[]>(StorageKeys.OFFLINE_QUEUE) || []
    const filtered = queue.filter(item => item.id !== id)
    await storageHelpers.setJSON(StorageKeys.OFFLINE_QUEUE, filtered)
  },
  
  // Clear queue
  clear: async (): Promise<void> => {
    await storageHelpers.remove(StorageKeys.OFFLINE_QUEUE)
  },
}

// User preferences (now async)
export const userPreferences = {
  // Theme
  getTheme: async (): Promise<'light' | 'dark' | 'system'> => {
    const theme = await storageHelpers.getString(StorageKeys.THEME)
    return (theme as 'light' | 'dark' | 'system') || 'system'
  },
  
  setTheme: async (theme: 'light' | 'dark' | 'system'): Promise<void> => {
    await storageHelpers.setString(StorageKeys.THEME, theme)
  },
  
  // Notifications
  getNotificationsEnabled: async (): Promise<boolean> => {
    return await storageHelpers.getBoolean(StorageKeys.NOTIFICATIONS_ENABLED)
  },
  
  setNotificationsEnabled: async (enabled: boolean): Promise<void> => {
    await storageHelpers.setBoolean(StorageKeys.NOTIFICATIONS_ENABLED, enabled)
  },
  
  // Onboarding
  isOnboardingCompleted: async (): Promise<boolean> => {
    return await storageHelpers.getBoolean(StorageKeys.ONBOARDING_COMPLETED)
  },
  
  setOnboardingCompleted: async (completed: boolean): Promise<void> => {
    await storageHelpers.setBoolean(StorageKeys.ONBOARDING_COMPLETED, completed)
  },
  
  // Feed preferences
  getDefaultFeedCategory: async (): Promise<string> => {
    const category = await storageHelpers.getString(StorageKeys.DEFAULT_FEED_CATEGORY)
    return category || 'all'
  },
  
  setDefaultFeedCategory: async (category: string): Promise<void> => {
    await storageHelpers.setString(StorageKeys.DEFAULT_FEED_CATEGORY, category)
  },
  
  // Bookmark preferences
  getBookmarkSortOrder: async (): Promise<string> => {
    const order = await storageHelpers.getString(StorageKeys.BOOKMARK_SORT_ORDER)
    return order || 'date'
  },
  
  setBookmarkSortOrder: async (order: string): Promise<void> => {
    await storageHelpers.setString(StorageKeys.BOOKMARK_SORT_ORDER, order)
  },
}