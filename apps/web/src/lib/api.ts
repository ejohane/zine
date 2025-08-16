import type { Bookmark, CreateBookmark, UpdateBookmark, SaveBookmark } from '@zine/shared'

export type { Bookmark, CreateBookmark, UpdateBookmark, SaveBookmark }

// Helper function to create authenticated headers
const createAuthHeaders = (token?: string | null): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }
  
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  
  return headers
}

// Environment-based API URL configuration
const getApiBaseUrl = (): string => {
  // Check if we're in development mode
  if (import.meta.env.DEV) {
    return '/api/v1' // Proxy to localhost:8787
  }
  
  // For production and preview environments
  const currentHost = window.location.hostname
  
  // Production environment
  if (currentHost === 'myzine.app') {
    return 'https://api.myzine.app/api/v1'
  }
  
  // Preview environment - replace web with api in hostname
  if (currentHost.includes('zine-web-')) {
    const apiHost = currentHost.replace('zine-web-', 'zine-api-')
    return `https://${apiHost}/api/v1`
  }
  
  // Fallback to relative URL
  return '/api/v1'
}

const API_BASE_URL = getApiBaseUrl()

export interface BookmarksResponse {
  data: Bookmark[]
  meta: {
    total: number
    userId: string
    status: string
    source?: string
    contentType?: string
  }
}

export const fetchBookmarks = async (
  token: string | null,
  params?: {
    status?: string
    source?: string
    contentType?: string
  }
): Promise<Bookmark[]> => {
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.set('status', params.status)
  if (params?.source) searchParams.set('source', params.source)
  if (params?.contentType) searchParams.set('contentType', params.contentType)
  
  const url = `${API_BASE_URL}/bookmarks${searchParams.toString() ? '?' + searchParams.toString() : ''}`
  const response = await fetch(url, {
    headers: createAuthHeaders(token),
  })
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('UNAUTHORIZED')
    }
    throw new Error('Failed to fetch bookmarks')
  }
  const result: BookmarksResponse = await response.json()
  return result.data
}

export const fetchBookmark = async (id: string, token: string | null): Promise<Bookmark | undefined> => {
  const response = await fetch(`${API_BASE_URL}/bookmarks/${id}`, {
    headers: createAuthHeaders(token),
  })
  if (!response.ok) {
    if (response.status === 404) {
      return undefined
    }
    throw new Error('Failed to fetch bookmark')
  }
  return response.json()
}

export const createNewBookmark = async (bookmark: CreateBookmark, token: string | null): Promise<Bookmark | undefined> => {
  const response = await fetch(`${API_BASE_URL}/bookmarks`, {
    method: 'POST',
    headers: createAuthHeaders(token),
    body: JSON.stringify(bookmark),
  })
  if (!response.ok) {
    throw new Error('Failed to create bookmark')
  }
  return response.json()
}

export const saveBookmark = async (bookmark: SaveBookmark, token: string | null): Promise<Bookmark> => {
  const response = await fetch(`${API_BASE_URL}/bookmarks/save`, {
    method: 'POST',
    headers: createAuthHeaders(token),
    body: JSON.stringify(bookmark),
  })
  
  const result = await response.json()
  
  if (!response.ok) {
    if (response.status === 409 && result.duplicate) {
      throw new Error(`Bookmark already exists: ${result.duplicate.title}`)
    }
    throw new Error(result.error || 'Failed to save bookmark')
  }
  
  return result.data
}

export const previewBookmark = async (url: string, token: string | null): Promise<Bookmark> => {
  const response = await fetch(`${API_BASE_URL}/bookmarks/preview`, {
    method: 'POST',
    headers: createAuthHeaders(token),
    body: JSON.stringify({ url }),
  })
  
  const result = await response.json()
  
  if (!response.ok) {
    throw new Error(result.error || 'Failed to preview bookmark')
  }
  
  return result.data
}

export const refreshBookmarkMetadata = async (id: string, token: string | null): Promise<Bookmark> => {
  const response = await fetch(`${API_BASE_URL}/bookmarks/${id}/refresh`, {
    method: 'PUT',
    headers: createAuthHeaders(token),
  })
  
  const result = await response.json()
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Bookmark not found')
    }
    throw new Error(result.error || 'Failed to refresh bookmark metadata')
  }
  
  return result.data
}

export const updateExistingBookmark = async (id: string, bookmark: UpdateBookmark, token: string | null): Promise<Bookmark | undefined> => {
  const response = await fetch(`${API_BASE_URL}/bookmarks/${id}`, {
    method: 'PUT',
    headers: createAuthHeaders(token),
    body: JSON.stringify(bookmark),
  })
  if (!response.ok) {
    if (response.status === 404) {
      return undefined
    }
    throw new Error('Failed to update bookmark')
  }
  return response.json()
}

export const removeBookmark = async (id: string, token: string | null): Promise<{ success: boolean; message?: string }> => {
  const response = await fetch(`${API_BASE_URL}/bookmarks/${id}`, {
    method: 'DELETE',
    headers: createAuthHeaders(token),
  })
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Bookmark not found')
    }
    throw new Error('Failed to delete bookmark')
  }
  const result = await response.json()
  return { success: true, message: result.message }
}

// OAuth and Account Types
export interface Account {
  provider: {
    id: string
    name: string
  }
  connected: boolean
  connectedAt?: string
  externalAccountId?: string
}

export interface AccountsResponse {
  accounts: Account[]
}

export interface OAuthConnectResponse {
  authUrl: string
}

// OAuth and Account Management APIs
export const fetchAccounts = async (token: string | null): Promise<Account[]> => {
  const response = await fetch(`${API_BASE_URL}/accounts`, {
    headers: createAuthHeaders(token),
  })
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('UNAUTHORIZED')
    }
    throw new Error('Failed to fetch accounts')
  }
  
  const result: AccountsResponse = await response.json()
  return result.accounts
}

export const connectAccount = async (provider: string, token: string | null, redirectUrl?: string): Promise<string> => {
  const response = await fetch(`${API_BASE_URL}/auth/${provider}/connect`, {
    method: 'POST',
    headers: createAuthHeaders(token),
    body: JSON.stringify({ redirectUrl }),
  })
  
  if (!response.ok) {
    const result = await response.json()
    throw new Error(result.error || 'Failed to initiate OAuth flow')
  }
  
  const result: OAuthConnectResponse = await response.json()
  return result.authUrl
}

export const disconnectAccount = async (provider: string, token: string | null): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/auth/${provider}/disconnect`, {
    method: 'DELETE',
    headers: createAuthHeaders(token),
  })
  
  if (!response.ok) {
    const result = await response.json()
    throw new Error(result.error || 'Failed to disconnect account')
  }
}

// Subscription Discovery & Management Types
export interface DiscoveredSubscription {
  externalId: string
  title: string
  creatorName: string
  description?: string
  thumbnailUrl?: string
  subscriptionUrl?: string
  provider: 'spotify' | 'youtube'
  isUserSubscribed: boolean
}

export interface DiscoveryResult {
  provider: 'spotify' | 'youtube'
  subscriptions: DiscoveredSubscription[]
  totalFound: number
  errors?: string[]
}

export interface UserSubscription {
  id: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  subscription: {
    id: string
    providerId: string
    externalId: string
    title: string
    creatorName: string
    description?: string
    thumbnailUrl?: string
    subscriptionUrl?: string
  }
}

export interface SubscriptionsResponse {
  subscriptions: UserSubscription[]
  total: number
}

export interface SubscriptionUpdateRequest {
  externalId: string
  title: string
  creatorName: string
  description?: string
  thumbnailUrl?: string
  subscriptionUrl?: string
  selected: boolean
}

export interface SubscriptionUpdateResponse {
  message: string
  added: number
  removed: number
}

// Subscription Discovery & Management APIs
export const discoverSubscriptions = async (
  provider: 'spotify' | 'youtube', 
  token: string | null
): Promise<DiscoveryResult> => {
  const response = await fetch(`${API_BASE_URL}/subscriptions/discover/${provider}`, {
    headers: createAuthHeaders(token),
  })
  
  if (!response.ok) {
    const result = await response.json()
    throw new Error(result.error || 'Failed to discover subscriptions')
  }
  
  return response.json()
}

export const fetchUserSubscriptions = async (
  token: string | null,
  provider?: string
): Promise<UserSubscription[]> => {
  const params = new URLSearchParams()
  if (provider) params.set('provider', provider)
  
  const url = `${API_BASE_URL}/subscriptions${params.toString() ? '?' + params.toString() : ''}`
  const response = await fetch(url, {
    headers: createAuthHeaders(token),
  })
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('UNAUTHORIZED')
    }
    throw new Error('Failed to fetch subscriptions')
  }
  
  const result: SubscriptionsResponse = await response.json()
  return result.subscriptions
}

export const updateSubscriptions = async (
  provider: 'spotify' | 'youtube',
  subscriptions: SubscriptionUpdateRequest[],
  token: string | null
): Promise<SubscriptionUpdateResponse> => {
  const response = await fetch(`${API_BASE_URL}/subscriptions/${provider}/update`, {
    method: 'POST',
    headers: createAuthHeaders(token),
    body: JSON.stringify({ subscriptions }),
  })
  
  if (!response.ok) {
    const result = await response.json()
    throw new Error(result.error || 'Failed to update subscriptions')
  }
  
  return response.json()
}

// Feed Types
export interface FeedItem {
  id: string
  title: string
  description?: string
  thumbnailUrl?: string
  publishedAt: Date
  durationSeconds?: number
  externalUrl: string
  subscription: {
    id: string
    title: string
    creatorName: string
    thumbnailUrl?: string
    providerId: string
  }
}

export interface FeedItemWithState {
  id: string
  feedItem: FeedItem
  isRead: boolean
  readAt?: Date
  bookmarkId?: number
  createdAt: Date
}

export interface FeedResponse {
  feedItems: FeedItemWithState[]
  pagination: {
    limit: number
    offset: number
    hasMore: boolean
  }
}

export interface SubscriptionWithUnreadCount {
  id: string
  title: string
  creatorName: string
  thumbnailUrl?: string
  providerId: string
  unreadCount: number
  lastUpdated: Date
}

export interface SubscriptionsWithCountsResponse {
  subscriptions: SubscriptionWithUnreadCount[]
}

// Feed APIs
export const fetchFeed = async (
  token: string | null,
  params?: {
    unread?: boolean
    subscription?: string
    limit?: number
    offset?: number
  }
): Promise<FeedResponse> => {
  const searchParams = new URLSearchParams()
  if (params?.unread) searchParams.set('unread', 'true')
  if (params?.subscription) searchParams.set('subscription', params.subscription)
  if (params?.limit) searchParams.set('limit', params.limit.toString())
  if (params?.offset) searchParams.set('offset', params.offset.toString())
  
  const url = `${API_BASE_URL}/feed${searchParams.toString() ? '?' + searchParams.toString() : ''}`
  const response = await fetch(url, {
    headers: createAuthHeaders(token),
  })
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('UNAUTHORIZED')
    }
    throw new Error('Failed to fetch feed')
  }
  
  const result = await response.json()
  return {
    ...result,
    feedItems: result.feedItems.map((item: {
      id: string
      feedItem: FeedItem & { publishedAt: string }
      isRead: boolean
      readAt?: string
      bookmarkId?: number
      createdAt: string
    }) => ({
      ...item,
      feedItem: {
        ...item.feedItem,
        publishedAt: new Date(item.feedItem.publishedAt)
      },
      readAt: item.readAt ? new Date(item.readAt) : undefined,
      createdAt: new Date(item.createdAt)
    }))
  }
}

export const fetchSubscriptionsWithCounts = async (
  token: string | null
): Promise<SubscriptionWithUnreadCount[]> => {
  const response = await fetch(`${API_BASE_URL}/feed/subscriptions`, {
    headers: createAuthHeaders(token),
  })
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('UNAUTHORIZED')
    }
    throw new Error('Failed to fetch subscriptions with counts')
  }
  
  const result: SubscriptionsWithCountsResponse = await response.json()
  return result.subscriptions.map(sub => ({
    ...sub,
    lastUpdated: new Date(sub.lastUpdated)
  }))
}

export const markFeedItemAsRead = async (
  itemId: string,
  token: string | null
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/feed/${itemId}/read`, {
    method: 'PUT',
    headers: createAuthHeaders(token),
  })
  
  if (!response.ok) {
    throw new Error('Failed to mark item as read')
  }
}

export const markFeedItemAsUnread = async (
  itemId: string,
  token: string | null
): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/feed/${itemId}/unread`, {
    method: 'PUT',
    headers: createAuthHeaders(token),
  })
  
  if (!response.ok) {
    throw new Error('Failed to mark item as unread')
  }
}

// Manual subscription refresh
export interface RefreshSubscriptionsResult {
  success: boolean
  message: string
  newItemsCount: number
  details?: Array<{
    provider: string
    subscriptionsPolled: number
    newItemsFound: number
  }>
  nextAllowedTime: string
  rateLimitSeconds: number
}

export interface RefreshSubscriptionsError {
  error: string
  message: string
  retryAfter?: number
  nextAllowedTime?: string
  details?: string[]
}

export const refreshSubscriptions = async (
  token: string | null
): Promise<RefreshSubscriptionsResult> => {
  const response = await fetch(`${API_BASE_URL}/subscriptions/refresh`, {
    method: 'POST',
    headers: createAuthHeaders(token),
  })
  
  if (!response.ok) {
    const errorData: RefreshSubscriptionsError = await response.json()
    
    if (response.status === 429) {
      // Rate limited - throw a specific error
      interface RateLimitError extends Error {
        isRateLimited: boolean
        retryAfter?: number
        nextAllowedTime?: string
      }
      const error = new Error(errorData.message || 'Rate limited') as RateLimitError
      error.isRateLimited = true
      error.retryAfter = errorData.retryAfter
      error.nextAllowedTime = errorData.nextAllowedTime
      throw error
    }
    
    if (response.status === 401) {
      throw new Error('UNAUTHORIZED')
    }
    
    throw new Error(errorData.message || 'Failed to refresh subscriptions')
  }
  
  return response.json()
}