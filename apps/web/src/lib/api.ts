import type { Bookmark, CreateBookmark, UpdateBookmark } from '@zine/shared'

export type { Bookmark, CreateBookmark, UpdateBookmark }

const API_BASE_URL = '/api/v1'

export const fetchBookmarks = async (): Promise<Bookmark[]> => {
  const response = await fetch(`${API_BASE_URL}/bookmarks`)
  if (!response.ok) {
    throw new Error('Failed to fetch bookmarks')
  }
  return response.json()
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