import { Bookmark, CreateBookmark, UpdateBookmark, BookmarksResponse, BookmarkResponse } from './types'

// Mock data - in a real app, this would come from a database
const mockBookmarks: Bookmark[] = [
  { id: '1', title: 'GitHub - React', url: 'https://github.com/facebook/react' },
  { id: '2', title: 'TanStack Query Documentation', url: 'https://tanstack.com/query' },
  { id: '3', title: 'Vite Documentation', url: 'https://vitejs.dev' },
  { id: '4', title: 'Cloudflare Workers', url: 'https://workers.cloudflare.com' },
  { id: '5', title: 'TypeScript Handbook', url: 'https://www.typescriptlang.org/docs' },
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
      ...bookmark,
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

// Default service instance for convenience
export const bookmarkService = new BookmarkService(new InMemoryBookmarkRepository())