import { Bookmark, CreateBookmark, UpdateBookmark, BookmarksResponse, BookmarkResponse } from './types'

// Mock data - in a real app, this would come from a database
const mockBookmarks: Bookmark[] = [
  { 
    id: '1', 
    userId: '1',
    title: 'GitHub - React', 
    url: 'https://github.com/facebook/react',
    originalUrl: 'https://github.com/facebook/react',
    status: 'active' as const,
    description: 'A declarative, efficient, and flexible JavaScript library for building user interfaces.',
    source: 'web' as const,
    contentType: 'link' as const,
    thumbnailUrl: 'https://opengraph.githubassets.com/1/facebook/react',
    faviconUrl: 'https://github.com/favicon.ico',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  },
  { 
    id: '2', 
    userId: '1',
    title: 'TanStack Query Documentation', 
    url: 'https://tanstack.com/query',
    originalUrl: 'https://tanstack.com/query',
    status: 'active' as const,
    description: 'Powerful data synchronization for React, Vue, Solid & Svelte.',
    source: 'web' as const,
    contentType: 'article' as const,
    thumbnailUrl: 'https://tanstack.com/images/query-og.png',
    faviconUrl: 'https://tanstack.com/favicon.ico',
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02')
  },
  { 
    id: '3', 
    userId: '1',
    title: 'Vite Documentation', 
    url: 'https://vitejs.dev',
    originalUrl: 'https://vitejs.dev',
    status: 'active' as const,
    description: 'Next Generation Frontend Tooling. Get ready for a development environment that can finally catch up with you.',
    source: 'web' as const,
    contentType: 'article' as const,
    thumbnailUrl: 'https://vitejs.dev/og-image.png',
    faviconUrl: 'https://vitejs.dev/favicon.ico',
    createdAt: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03')
  },
  { 
    id: '4', 
    userId: '1',
    title: 'Cloudflare Workers', 
    url: 'https://workers.cloudflare.com',
    originalUrl: 'https://workers.cloudflare.com',
    status: 'active' as const,
    description: 'Deploy serverless code instantly across the globe to give it exceptional performance, reliability, and scale.',
    source: 'web' as const,
    contentType: 'link' as const,
    thumbnailUrl: 'https://workers.cloudflare.com/resources/logo/logo.svg',
    faviconUrl: 'https://workers.cloudflare.com/favicon.ico',
    createdAt: new Date('2024-01-04'),
    updatedAt: new Date('2024-01-04')
  },
  { 
    id: '5', 
    userId: '1',
    title: 'TypeScript Handbook', 
    url: 'https://www.typescriptlang.org/docs',
    originalUrl: 'https://www.typescriptlang.org/docs',
    status: 'active' as const,
    description: 'The TypeScript Handbook is a comprehensive guide to the TypeScript language.',
    source: 'web' as const,
    contentType: 'article' as const,
    thumbnailUrl: 'https://www.typescriptlang.org/images/branding/ts-logo-512.png',
    faviconUrl: 'https://www.typescriptlang.org/favicon-32x32.png',
    language: 'en',
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-01-05')
  },
]

// Database interface that can be implemented by different storage backends
export interface BookmarkRepository {
  getAll(): Promise<Bookmark[]>
  getById(id: string): Promise<Bookmark | null>
  create(bookmark: CreateBookmark): Promise<Bookmark>
  update(id: string, bookmark: UpdateBookmark): Promise<Bookmark | null>
  delete(id: string): Promise<boolean>
}

// In-memory implementation for development/testing
export class InMemoryBookmarkRepository implements BookmarkRepository {
  private bookmarks: Bookmark[] = [...mockBookmarks]
  private nextId = 6

  async getAll(): Promise<Bookmark[]> {
    return this.bookmarks
  }

  async getById(id: string): Promise<Bookmark | null> {
    return this.bookmarks.find(b => b.id === id) || null
  }

  async create(bookmark: CreateBookmark): Promise<Bookmark> {
    const newBookmark: Bookmark = {
      id: String(this.nextId++),
      userId: '1',
      status: 'active',
      url: bookmark.url || '',
      originalUrl: bookmark.url || '',
      title: bookmark.title,
      description: bookmark.description,
      tags: bookmark.tags,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.bookmarks.push(newBookmark)
    return newBookmark
  }

  async update(id: string, bookmark: UpdateBookmark): Promise<Bookmark | null> {
    const index = this.bookmarks.findIndex(b => b.id === id)
    if (index === -1) return null
    
    this.bookmarks[index] = {
      ...this.bookmarks[index],
      ...bookmark,
      updatedAt: new Date(),
    }
    return this.bookmarks[index]
  }

  async delete(id: string): Promise<boolean> {
    const index = this.bookmarks.findIndex(b => b.id === id)
    if (index === -1) return false
    
    this.bookmarks.splice(index, 1)
    return true
  }
}

// Service class that implements the business logic
export class BookmarkService {
  constructor(private repository: BookmarkRepository) {}

  // Expose repository for other services
  getRepository(): BookmarkRepository {
    return this.repository
  }

  async getBookmarks(): Promise<BookmarksResponse> {
    try {
      const bookmarks = await this.repository.getAll()
      return { data: bookmarks }
    } catch (error) {
      return { error: 'Failed to fetch bookmarks' }
    }
  }

  async getBookmark(id: string): Promise<BookmarkResponse> {
    try {
      const bookmark = await this.repository.getById(id)
      if (!bookmark) {
        return { error: 'Bookmark not found' }
      }
      return { data: bookmark }
    } catch (error) {
      return { error: 'Failed to fetch bookmark' }
    }
  }

  async createBookmark(bookmark: CreateBookmark): Promise<BookmarkResponse> {
    try {
      const newBookmark = await this.repository.create(bookmark)
      return { data: newBookmark, message: 'Bookmark created successfully' }
    } catch (error) {
      return { error: 'Failed to create bookmark' }
    }
  }

  async updateBookmark(id: string, bookmark: UpdateBookmark): Promise<BookmarkResponse> {
    try {
      const updatedBookmark = await this.repository.update(id, bookmark)
      if (!updatedBookmark) {
        return { error: 'Bookmark not found' }
      }
      return { data: updatedBookmark, message: 'Bookmark updated successfully' }
    } catch (error) {
      return { error: 'Failed to update bookmark' }
    }
  }

  async deleteBookmark(id: string): Promise<BookmarkResponse> {
    try {
      const deleted = await this.repository.delete(id)
      if (!deleted) {
        return { error: 'Bookmark not found' }
      }
      return { message: 'Bookmark deleted successfully' }
    } catch (error) {
      return { error: 'Failed to delete bookmark' }
    }
  }
}

// Note: Default service instance removed - services now initialized with D1 database in API layer