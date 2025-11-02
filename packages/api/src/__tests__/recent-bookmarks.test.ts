import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockDBPrepare = vi.fn()
const mockDBRun = vi.fn()
const mockDBAll = vi.fn()

vi.mock('../middleware/auth', () => ({
  authMiddleware: vi.fn(async (c: any, next: () => Promise<void>) => {
    c.set('auth', { userId: 'user-123', sessionId: 'session-123' })
    await next()
  }),
  getAuthContext: (c: any) => c.get('auth')
}))

const appModule = await import('../index')

const createEnv = () => ({
  DB: {
    prepare: mockDBPrepare
  } as any,
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

describe('GET /api/v1/bookmarks/recent', () => {
  beforeEach(() => {
    mockDBPrepare.mockReset()
    mockDBAll.mockReset()
  })

  it('returns recent bookmarks ordered by bookmarked_at DESC', async () => {
    const mockBookmarks = [
      {
        id: 'bookmark-1',
        user_id: 'user-123',
        notes: 'Note 1',
        bookmarked_at: Date.now() - 10000,
        last_accessed_at: Date.now() - 1000,
        status: 'active',
        url: 'https://youtube.com/watch?v=abc',
        title: 'Video 1',
        description: 'Description 1',
        thumbnail_url: 'https://example.com/thumb1.jpg',
        content_type: 'video',
        creator_name: 'Creator 1'
      },
      {
        id: 'bookmark-2',
        user_id: 'user-123',
        notes: 'Note 2',
        bookmarked_at: Date.now() - 20000,
        last_accessed_at: Date.now() - 5000,
        status: 'active',
        url: 'https://youtube.com/watch?v=def',
        title: 'Video 2',
        description: 'Description 2',
        thumbnail_url: 'https://example.com/thumb2.jpg',
        content_type: 'video',
        creator_name: 'Creator 2'
      }
    ]

    mockDBPrepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: mockBookmarks
        })
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/bookmarks/recent'),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(200)

    const body = await response.json() as any
    expect(body.data).toHaveLength(2)
    expect(body.data[0].id).toBe('bookmark-1')
    expect(body.data[0].lastAccessedAt).toBeDefined()
    expect(body.data[1].id).toBe('bookmark-2')
  })

  it('returns empty array when no recent bookmarks exist', async () => {
    mockDBPrepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: []
        })
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/bookmarks/recent'),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(200)

    const body = await response.json() as any
    expect(body.data).toEqual([])
  })

  it('respects limit parameter with default of 4', async () => {
    mockDBPrepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: []
        })
      })
    })

    await appModule.default.fetch(
      new Request('https://example.com/api/v1/bookmarks/recent'),
      createEnv(),
      createCtx()
    )

    const bindCall = mockDBPrepare.mock.results[0].value.bind
    expect(bindCall).toHaveBeenCalledWith('user-123', 4)
  })

  it('respects custom limit parameter', async () => {
    mockDBPrepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: []
        })
      })
    })

    await appModule.default.fetch(
      new Request('https://example.com/api/v1/bookmarks/recent?limit=10'),
      createEnv(),
      createCtx()
    )

    const bindCall = mockDBPrepare.mock.results[0].value.bind
    expect(bindCall).toHaveBeenCalledWith('user-123', 10)
  })

  it('enforces maximum limit of 20', async () => {
    mockDBPrepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: []
        })
      })
    })

    await appModule.default.fetch(
      new Request('https://example.com/api/v1/bookmarks/recent?limit=100'),
      createEnv(),
      createCtx()
    )

    const bindCall = mockDBPrepare.mock.results[0].value.bind
    expect(bindCall).toHaveBeenCalledWith('user-123', 20)
  })

  it('enforces minimum limit of 1', async () => {
    mockDBPrepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: []
        })
      })
    })

    await appModule.default.fetch(
      new Request('https://example.com/api/v1/bookmarks/recent?limit=0'),
      createEnv(),
      createCtx()
    )

    const bindCall = mockDBPrepare.mock.results[0].value.bind
    expect(bindCall).toHaveBeenCalledWith('user-123', 1)
  })

  it('handles database errors gracefully', async () => {
    mockDBPrepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockRejectedValue(new Error('Database error'))
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/bookmarks/recent'),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(500)

    const body = await response.json() as any
    expect(body.error).toBe('Failed to fetch recent bookmarks')
  })

  it('handles null results gracefully', async () => {
    mockDBPrepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: null
        })
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/bookmarks/recent'),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(200)

    const body = await response.json() as any
    expect(body.data).toEqual([])
  })
})

describe('PATCH /api/v1/bookmarks/:id/accessed', () => {
  beforeEach(() => {
    mockDBPrepare.mockReset()
    mockDBRun.mockReset()
  })

  it('updates last_accessed_at timestamp for existing bookmark', async () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)

    mockDBPrepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({
          meta: { changes: 1 }
        })
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/bookmarks/bookmark-123/accessed', {
        method: 'PATCH'
      }),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(200)

    const body = await response.json() as any
    expect(body.success).toBe(true)
    expect(body.bookmarkId).toBe('bookmark-123')
    expect(body.lastAccessedAt).toBe(now)

    const bindCall = mockDBPrepare.mock.results[0].value.bind
    expect(bindCall).toHaveBeenCalledWith(now, 'bookmark-123', 'user-123')

    vi.restoreAllMocks()
  })

  it('returns 404 when bookmark not found', async () => {
    mockDBPrepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({
          meta: { changes: 0 }
        })
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/bookmarks/nonexistent/accessed', {
        method: 'PATCH'
      }),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(404)

    const body = await response.json() as any
    expect(body.error).toBe('Bookmark not found')
  })

  it('returns 404 when bookmark belongs to another user', async () => {
    mockDBPrepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({
          meta: { changes: 0 }
        })
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/bookmarks/other-user-bookmark/accessed', {
        method: 'PATCH'
      }),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(404)

    const body = await response.json() as any
    expect(body.error).toBe('Bookmark not found')
  })

  it('handles database errors gracefully', async () => {
    mockDBPrepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockRejectedValue(new Error('Database error'))
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/bookmarks/bookmark-123/accessed', {
        method: 'PATCH'
      }),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(500)

    const body = await response.json() as any
    expect(body.error).toBe('Failed to track bookmark access')
  })

  it('handles concurrent updates without conflicts', async () => {
    mockDBPrepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({
          meta: { changes: 1 }
        })
      })
    })

    const response1 = await appModule.default.fetch(
      new Request('https://example.com/api/v1/bookmarks/bookmark-123/accessed', {
        method: 'PATCH'
      }),
      createEnv(),
      createCtx()
    )

    const response2 = await appModule.default.fetch(
      new Request('https://example.com/api/v1/bookmarks/bookmark-123/accessed', {
        method: 'PATCH'
      }),
      createEnv(),
      createCtx()
    )

    expect(response1.status).toBe(200)
    expect(response2.status).toBe(200)

    const body1 = await response1.json() as any
    const body2 = await response2.json() as any

    expect(body1.success).toBe(true)
    expect(body2.success).toBe(true)
    expect(body1.bookmarkId).toBe('bookmark-123')
    expect(body2.bookmarkId).toBe('bookmark-123')
    expect(body1.lastAccessedAt).toBeTypeOf('number')
    expect(body2.lastAccessedAt).toBeTypeOf('number')
  })
})
