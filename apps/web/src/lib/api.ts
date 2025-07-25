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