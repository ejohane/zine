import { QueryClient } from '@tanstack/react-query'
import * as SecureStore from 'expo-secure-store'

// API Configuration
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.myzine.app'

// Create QueryClient with default options
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes (was cacheTime)
      retry: 2,
      refetchOnWindowFocus: false, // Disable for mobile
      refetchOnReconnect: 'always',
    },
    mutations: {
      retry: 1,
    },
  },
})

// Auth token management
async function getAuthToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync('auth_token')
  } catch (error) {
    console.error('Error getting auth token:', error)
    return null
  }
}

// Fetch wrapper with auth headers
export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = await getAuthToken()
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error || `Request failed with status ${response.status}`)
  }

  return response.json()
}

// API Endpoints
export const api = {
  // Bookmarks
  bookmarks: {
    getAll: () => fetchWithAuth('/api/v1/bookmarks'),
    getById: (id: string) => fetchWithAuth(`/api/v1/bookmarks/${id}`),
    create: (data: any) => 
      fetchWithAuth('/api/v1/bookmarks', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: any) =>
      fetchWithAuth(`/api/v1/bookmarks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchWithAuth(`/api/v1/bookmarks/${id}`, {
        method: 'DELETE',
      }),
  },

  // Feed Items
  feed: {
    getAll: (params?: { 
      page?: number
      limit?: number
      category?: string 
    }) => {
      const searchParams = new URLSearchParams()
      if (params?.page) searchParams.append('page', params.page.toString())
      if (params?.limit) searchParams.append('limit', params.limit.toString())
      if (params?.category) searchParams.append('category', params.category)
      
      const query = searchParams.toString()
      return fetchWithAuth(`/api/v1/feed${query ? `?${query}` : ''}`)
    },
    markAsRead: (id: string) =>
      fetchWithAuth(`/api/v1/feed/${id}/read`, {
        method: 'POST',
      }),
  },

  // Subscriptions
  subscriptions: {
    getAll: (params?: { 
      platform?: string
      search?: string 
    }) => {
      const searchParams = new URLSearchParams()
      if (params?.platform) searchParams.append('platform', params.platform)
      if (params?.search) searchParams.append('search', params.search)
      
      const query = searchParams.toString()
      return fetchWithAuth(`/api/v1/subscriptions${query ? `?${query}` : ''}`)
    },
    getById: (id: string) => fetchWithAuth(`/api/v1/subscriptions/${id}`),
    subscribe: (data: any) =>
      fetchWithAuth('/api/v1/subscriptions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    unsubscribe: (id: string) =>
      fetchWithAuth(`/api/v1/subscriptions/${id}`, {
        method: 'DELETE',
      }),
  },

  // User
  user: {
    getProfile: () => fetchWithAuth('/api/v1/user/profile'),
    updateProfile: (data: any) =>
      fetchWithAuth('/api/v1/user/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    getStats: () => fetchWithAuth('/api/v1/user/stats'),
  },

  // Auth
  auth: {
    signIn: (data: { email: string; password: string }) =>
      fetchWithAuth('/api/v1/auth/signin', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    signOut: () =>
      fetchWithAuth('/api/v1/auth/signout', {
        method: 'POST',
      }),
    refresh: () =>
      fetchWithAuth('/api/v1/auth/refresh', {
        method: 'POST',
      }),
  },
}

// Export types
export type BookmarkCreateInput = {
  title: string
  url: string
  description?: string
  tags?: string[]
}

export type BookmarkUpdateInput = Partial<BookmarkCreateInput>

export type FeedCategory = 'all' | 'podcasts' | 'videos' | 'articles'

export type Platform = 'spotify' | 'youtube' | 'rss' | 'apple' | 'google'