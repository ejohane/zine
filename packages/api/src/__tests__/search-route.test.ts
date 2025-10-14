import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Bookmark } from '@zine/shared'

const { searchByUserIdMock, contentSearchMock } = vi.hoisted(() => ({
  searchByUserIdMock: vi.fn(),
  contentSearchMock: vi.fn()
}))

vi.mock('../d1-repository', () => ({
  D1BookmarkRepository: vi.fn().mockImplementation(() => ({
    searchByUserId: searchByUserIdMock
  }))
}))

vi.mock('../repositories/content-repository', () => ({
  ContentRepository: vi.fn().mockImplementation(() => ({
    search: contentSearchMock
  }))
}))

vi.mock('../middleware/auth', () => ({
  authMiddleware: vi.fn(async (c: any, next: () => Promise<void>) => {
    c.set('auth', { userId: 'user-123', sessionId: 'session-123' })
    await next()
  }),
  getAuthContext: (c: any) => c.get('auth')
}))

const appModule = await import('../index')

const createEnv = () => ({
  DB: {} as any,
  CLERK_SECRET_KEY: 'sk_test',
  SPOTIFY_CLIENT_ID: '',
  SPOTIFY_CLIENT_SECRET: '',
  YOUTUBE_CLIENT_ID: '',
  YOUTUBE_CLIENT_SECRET: '',
  API_BASE_URL: '',
  USER_SUBSCRIPTION_MANAGER: {} as any,
  USER_RECENT_BOOKMARKS: {} as any
})

const createCtx = (): any => ({
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {}
})

const createBookmark = (overrides: Partial<Bookmark> = {}): Bookmark => ({
  id: 'bookmark-1',
  userId: 'user-123',
  url: 'https://example.com',
  originalUrl: 'https://example.com',
  title: 'Sample Bookmark',
  description: 'Description',
  source: 'web',
  contentType: 'article',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  faviconUrl: undefined,
  publishedAt: Date.now(),
  language: 'en',
  status: 'active',
  creatorId: 'creator-1',
  videoMetadata: undefined,
  podcastMetadata: undefined,
  articleMetadata: undefined,
  postMetadata: undefined,
  tags: undefined,
  notes: undefined,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  creator: {
    id: 'creator-1',
    name: 'Creator One',
    handle: undefined,
    avatarUrl: 'https://example.com/avatar.jpg',
    verified: undefined,
    subscriberCount: undefined,
    followerCount: undefined,
    platform: 'web',
    bio: undefined,
    url: undefined,
    platforms: undefined,
    externalLinks: undefined,
    createdAt: undefined,
    updatedAt: undefined
  },
  ...overrides
})

describe('GET /api/v1/search', () => {
  beforeEach(() => {
    searchByUserIdMock.mockReset()
    contentSearchMock.mockReset()
  })

  it('returns bookmark results by default with pagination metadata', async () => {
    searchByUserIdMock.mockResolvedValue({
      totalCount: 2,
      results: [
        createBookmark({ id: 'bookmark-1' }),
        createBookmark({ id: 'bookmark-2', title: 'Another' })
      ]
    })

    contentSearchMock.mockResolvedValue([])

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/search?q=bookmark'),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(200)

    const body = await response.json() as any

    expect(searchByUserIdMock).toHaveBeenCalledWith('user-123', {
      query: 'bookmark',
      limit: 20,
      offset: 0
    })

    expect(body.results).toHaveLength(2)
    expect(body.results[0].type).toBe('bookmark')
    expect(body.facets).toEqual({ bookmarks: 2, content: 0 })
    expect(body.pagination).toEqual({ limit: 20, offset: 0, hasMore: false })
  })

  it('combines bookmarks and content when type=all and slices based on pagination', async () => {
    searchByUserIdMock.mockResolvedValue({
      totalCount: 3,
      results: [
        createBookmark({ id: 'bookmark-1' }),
        createBookmark({ id: 'bookmark-2' }),
        createBookmark({ id: 'bookmark-3' })
      ]
    })

    contentSearchMock.mockResolvedValue([
      { id: 'content-1', title: 'Content 1', description: '', url: 'https://example.com/c1', thumbnailUrl: '', creatorName: 'Creator 1', creatorId: 'creator-1', contentType: 'article', publishedAt: Date.now() / 1000 },
      { id: 'content-2', title: 'Content 2', description: '', url: 'https://example.com/c2', thumbnailUrl: '', creatorName: 'Creator 2', creatorId: 'creator-2', contentType: 'article', publishedAt: Date.now() / 1000 }
    ])

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/search?q=bookmark&type=all&limit=2&offset=1'),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(200)

    expect(searchByUserIdMock).toHaveBeenCalledWith('user-123', {
      query: 'bookmark',
      limit: 3,
      offset: 0
    })

    expect(contentSearchMock).toHaveBeenCalledWith('bookmark', {
      limit: 4,
      offset: 0,
      orderBy: 'createdAt',
      orderDirection: 'desc'
    })

    const body = await response.json() as any

    expect(body.results).toHaveLength(2)
    expect(body.results.map((item: any) => item.id)).toEqual(['bookmark-2', 'bookmark-3'])
    expect(body.facets).toEqual({ bookmarks: 3, content: 2 })
    expect(body.pagination.hasMore).toBe(true)
  })

  it('only queries content when type=content and slices response', async () => {
    contentSearchMock.mockResolvedValue([
      { id: 'content-1', title: 'Content 1', description: '', url: 'https://example.com/c1', thumbnailUrl: '', creatorName: 'Creator 1', creatorId: 'creator-1', contentType: 'article', publishedAt: Date.now() / 1000 },
      { id: 'content-2', title: 'Content 2', description: '', url: 'https://example.com/c2', thumbnailUrl: '', creatorName: 'Creator 2', creatorId: 'creator-2', contentType: 'article', publishedAt: Date.now() / 1000 },
      { id: 'content-3', title: 'Content 3', description: '', url: 'https://example.com/c3', thumbnailUrl: '', creatorName: 'Creator 3', creatorId: 'creator-3', contentType: 'article', publishedAt: Date.now() / 1000 }
    ])

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/search?q=bookmark&type=content&limit=2&offset=1'),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(200)
    expect(searchByUserIdMock).not.toHaveBeenCalled()
    expect(contentSearchMock).toHaveBeenCalledWith('bookmark', {
      limit: 3,
      offset: 0,
      orderBy: 'createdAt',
      orderDirection: 'desc'
    })

    const body = await response.json() as any
    expect(body.results).toHaveLength(2)
    expect(body.facets).toEqual({ bookmarks: 0, content: 3 })
    expect(body.pagination).toEqual({ limit: 2, offset: 1, hasMore: false })
  })
})
