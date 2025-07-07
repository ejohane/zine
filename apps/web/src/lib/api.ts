import type { Bookmark, CreateBookmark, UpdateBookmark, SaveBookmark } from '@zine/shared'

export type { Bookmark, CreateBookmark, UpdateBookmark, SaveBookmark }

const API_BASE_URL = '/api/v1'

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

export const fetchBookmarks = async (params?: {
  userId?: string
  status?: string
  source?: string
  contentType?: string
}): Promise<Bookmark[]> => {
  const searchParams = new URLSearchParams()
  if (params?.userId) searchParams.set('userId', params.userId)
  if (params?.status) searchParams.set('status', params.status)
  if (params?.source) searchParams.set('source', params.source)
  if (params?.contentType) searchParams.set('contentType', params.contentType)
  
  const url = `${API_BASE_URL}/bookmarks${searchParams.toString() ? '?' + searchParams.toString() : ''}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to fetch bookmarks')
  }
  const result: BookmarksResponse = await response.json()
  return result.data
}

export const fetchBookmark = async (id: string): Promise<Bookmark | undefined> => {
  const response = await fetch(`${API_BASE_URL}/bookmarks/${id}`)
  if (!response.ok) {
    if (response.status === 404) {
      return undefined
    }
    throw new Error('Failed to fetch bookmark')
  }
  return response.json()
}

export const createNewBookmark = async (bookmark: CreateBookmark): Promise<Bookmark | undefined> => {
  const response = await fetch(`${API_BASE_URL}/bookmarks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bookmark),
  })
  if (!response.ok) {
    throw new Error('Failed to create bookmark')
  }
  return response.json()
}

export const saveBookmark = async (bookmark: SaveBookmark): Promise<Bookmark> => {
  const response = await fetch(`${API_BASE_URL}/bookmarks/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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

export const previewBookmark = async (url: string): Promise<Bookmark> => {
  const response = await fetch(`${API_BASE_URL}/bookmarks/preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  })
  
  const result = await response.json()
  
  if (!response.ok) {
    throw new Error(result.error || 'Failed to preview bookmark')
  }
  
  return result.data
}

export const refreshBookmarkMetadata = async (id: string): Promise<Bookmark> => {
  const response = await fetch(`${API_BASE_URL}/bookmarks/${id}/refresh`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
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

export const updateExistingBookmark = async (id: string, bookmark: UpdateBookmark): Promise<Bookmark | undefined> => {
  const response = await fetch(`${API_BASE_URL}/bookmarks/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
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

export const removeBookmark = async (id: string): Promise<{ success: boolean; message?: string }> => {
  const response = await fetch(`${API_BASE_URL}/bookmarks/${id}`, {
    method: 'DELETE',
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