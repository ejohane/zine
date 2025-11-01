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

describe('PUT /api/v1/feed/:itemId/hide', () => {
  beforeEach(() => {
    mockDBPrepare.mockReset()
    mockDBRun.mockReset()
    mockDBAll.mockReset()
  })

  it('successfully hides a feed item with feedItemId', async () => {
    // Mock ensureUser
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{ id: 'user-123' }]
        })
      })
    })

    // Mock hideItem - check if userFeedItem exists
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: []
        })
      })
    })

    // Mock getFeedItem - check if feed item exists
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{
            id: 'feed-item-123',
            subscription_id: 'sub-123',
            external_id: 'ext-123',
            title: 'Test Item'
          }]
        })
      })
    })

    // Mock hideItem - create new userFeedItem
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({
          meta: { changes: 1 }
        })
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/feed/feed-item-123/hide', {
        method: 'PUT'
      }),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.message).toBe('Item hidden from feed')
  })

  it('successfully hides a feed item with userFeedItemId format', async () => {
    // Mock ensureUser
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{ id: 'user-123' }]
        })
      })
    })

    // Mock hideItem - check if userFeedItem exists
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: []
        })
      })
    })

    // Mock getFeedItem - check if feed item exists
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{
            id: 'feed-item-123',
            subscription_id: 'sub-123',
            external_id: 'ext-123',
            title: 'Test Item'
          }]
        })
      })
    })

    // Mock hideItem - create new userFeedItem
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({
          meta: { changes: 1 }
        })
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/feed/user-123-feed-item-123-1234567890/hide', {
        method: 'PUT'
      }),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.message).toBe('Item hidden from feed')
  })

  it('updates existing userFeedItem when hiding', async () => {
    // Mock ensureUser
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{ id: 'user-123' }]
        })
      })
    })

    // Mock hideItem - check if userFeedItem exists (returns existing)
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{
            id: 'user-123-feed-item-123-1234567890',
            user_id: 'user-123',
            feed_item_id: 'feed-item-123',
            is_read: false,
            is_hidden: false,
            is_bookmarked: false
          }]
        })
      })
    })

    // Mock hideItem - update existing userFeedItem
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({
          meta: { changes: 1 }
        })
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/feed/feed-item-123/hide', {
        method: 'PUT'
      }),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.message).toBe('Item hidden from feed')
  })

  it('returns 500 when feed item does not exist', async () => {
    // Mock ensureUser
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{ id: 'user-123' }]
        })
      })
    })

    // Mock hideItem - check if userFeedItem exists (doesn't exist)
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: []
        })
      })
    })

    // Mock getFeedItem - feed item not found
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: []
        })
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/feed/nonexistent-item/hide', {
        method: 'PUT'
      }),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(500)
    const body = await response.json() as any
    expect(body.error).toBe('Failed to hide feed item')
  })

  it('handles database errors gracefully', async () => {
    // Mock ensureUser to fail
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockRejectedValue(new Error('Database error'))
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/feed/feed-item-123/hide', {
        method: 'PUT'
      }),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(500)
    const body = await response.json() as any
    expect(body.error).toBe('Failed to hide feed item')
  })

  it('handles complex feedItemId with multiple dashes in userFeedItemId', async () => {
    // Mock ensureUser
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{ id: 'user-123' }]
        })
      })
    })

    // Mock hideItem - check if userFeedItem exists
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: []
        })
      })
    })

    // Mock getFeedItem - check if feed item exists
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{
            id: 'feed-item-with-dashes-123',
            subscription_id: 'sub-123',
            external_id: 'ext-123',
            title: 'Test Item'
          }]
        })
      })
    })

    // Mock hideItem - create new userFeedItem
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({
          meta: { changes: 1 }
        })
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/feed/user-123-feed-item-with-dashes-123-1234567890/hide', {
        method: 'PUT'
      }),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.message).toBe('Item hidden from feed')
  })
})

describe('PUT /api/v1/feed/:itemId/unhide', () => {
  beforeEach(() => {
    mockDBPrepare.mockReset()
    mockDBRun.mockReset()
    mockDBAll.mockReset()
  })

  it('successfully unhides a feed item when userFeedItem exists', async () => {
    // Mock ensureUser
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{ id: 'user-123' }]
        })
      })
    })

    // Mock unhideItem - check if userFeedItem exists (returns hidden item)
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{
            id: 'user-123-feed-item-123-1234567890',
            user_id: 'user-123',
            feed_item_id: 'feed-item-123',
            is_read: false,
            is_hidden: true,
            is_bookmarked: false
          }]
        })
      })
    })

    // Mock unhideItem - update existing userFeedItem
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({
          meta: { changes: 1 }
        })
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/feed/feed-item-123/unhide', {
        method: 'PUT'
      }),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.message).toBe('Item unhidden from feed')
  })

  it('successfully unhides a feed item with userFeedItemId format', async () => {
    // Mock ensureUser
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{ id: 'user-123' }]
        })
      })
    })

    // Mock unhideItem - check if userFeedItem exists
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: []
        })
      })
    })

    // Mock getFeedItem - check if feed item exists
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{
            id: 'feed-item-123',
            subscription_id: 'sub-123',
            external_id: 'ext-123',
            title: 'Test Item'
          }]
        })
      })
    })

    // Mock unhideItem - create new userFeedItem with isHidden = false
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({
          meta: { changes: 1 }
        })
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/feed/user-123-feed-item-123-1234567890/unhide', {
        method: 'PUT'
      }),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(200)
    const body = await response.json() as any
    expect(body.message).toBe('Item unhidden from feed')
  })

  it('returns 500 when feed item does not exist', async () => {
    // Mock ensureUser
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [{ id: 'user-123' }]
        })
      })
    })

    // Mock unhideItem - check if userFeedItem exists (doesn't exist)
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: []
        })
      })
    })

    // Mock getFeedItem - feed item not found
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: []
        })
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/feed/nonexistent-item/unhide', {
        method: 'PUT'
      }),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(500)
    const body = await response.json() as any
    expect(body.error).toBe('Failed to unhide feed item')
  })

  it('handles database errors gracefully', async () => {
    // Mock ensureUser to fail
    mockDBPrepare.mockReturnValueOnce({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockRejectedValue(new Error('Database error'))
      })
    })

    const response = await appModule.default.fetch(
      new Request('https://example.com/api/v1/feed/feed-item-123/unhide', {
        method: 'PUT'
      }),
      createEnv(),
      createCtx()
    )

    expect(response.status).toBe(500)
    const body = await response.json() as any
    expect(body.error).toBe('Failed to unhide feed item')
  })
})
