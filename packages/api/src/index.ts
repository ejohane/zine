import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { 
  CreateBookmarkSchema, 
  UpdateBookmarkSchema,
  SaveBookmarkSchema,
  BookmarkService,
  BookmarkSaveService
} from '@zine/shared'
import { D1BookmarkRepository } from './d1-repository'
import { authMiddleware, getAuthContext } from './middleware/auth'

type Bindings = {
  DB: D1Database
  CLERK_SECRET_KEY: string
}

const app = new Hono<{ Bindings: Bindings }>()

// Initialize services with D1 database
let bookmarkService: BookmarkService
let bookmarkSaveService: BookmarkSaveService

// Initialize services on first request
function initializeServices(db: D1Database) {
  if (!bookmarkService) {
    const d1Repository = new D1BookmarkRepository(db)
    bookmarkService = new BookmarkService(d1Repository)
    bookmarkSaveService = new BookmarkSaveService(d1Repository)
  }
  return { bookmarkService, bookmarkSaveService }
}

app.use('*', logger())
app.use('*', cors())

app.get('/', (c) => {
  return c.json({ message: 'Zine API is running' })
})

app.get('/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

// Apply authentication middleware to all /api/v1/bookmarks routes
app.use('/api/v1/bookmarks/*', authMiddleware)

// Bookmarks endpoints
app.get('/api/v1/bookmarks', async (c) => {
  const { bookmarkService } = initializeServices(c.env.DB)
  const auth = getAuthContext(c)
  
  try {
    // Get query parameters for filtering
    const status = c.req.query('status') || 'active'
    const source = c.req.query('source')
    const contentType = c.req.query('contentType')
    
    const result = await bookmarkService.getBookmarks()
    if (result.error) {
      return c.json({ error: result.error }, 500)
    }
    
    let bookmarks = result.data || []
    
    // Apply filters
    bookmarks = bookmarks.filter(bookmark => {
      // Filter by authenticated user ID
      if (bookmark.userId !== auth.userId) return false
      
      // Filter by status
      if (bookmark.status !== status) return false
      
      // Filter by source if specified
      if (source && bookmark.source !== source) return false
      
      // Filter by content type if specified
      if (contentType && bookmark.contentType !== contentType) return false
      
      return true
    })
    
    // Sort by created date (newest first)
    bookmarks.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return dateB - dateA
    })
    
    return c.json({
      data: bookmarks,
      meta: {
        total: bookmarks.length,
        userId: auth.userId,
        status,
        ...(source && { source }),
        ...(contentType && { contentType })
      }
    })
  } catch (error) {
    return c.json({ error: 'Failed to fetch bookmarks' }, 500)
  }
})

app.get('/api/v1/bookmarks/:id', async (c) => {
  const { bookmarkService } = initializeServices(c.env.DB)
  const auth = getAuthContext(c)
  const id = c.req.param('id')
  
  const result = await bookmarkService.getBookmark(id)
  if (result.error) {
    return c.json({ error: result.error }, result.error === 'Bookmark not found' ? 404 : 500)
  }
  
  // Ensure user can only access their own bookmarks
  if (result.data?.userId !== auth.userId) {
    return c.json({ error: 'Bookmark not found' }, 404)
  }
  
  return c.json(result.data)
})

app.post('/api/v1/bookmarks', async (c) => {
  const { bookmarkService } = initializeServices(c.env.DB)
  const auth = getAuthContext(c)
  
  try {
    const body = await c.req.json()
    const validatedData = CreateBookmarkSchema.parse(body)
    
    // Ensure user exists in database before creating bookmark
    const d1Repository = new D1BookmarkRepository(c.env.DB)
    await d1Repository.ensureUser({
      id: auth.userId
    })
    
    const result = await bookmarkService.createBookmark(validatedData, auth.userId)
    if (result.error) {
      return c.json({ error: result.error }, 500)
    }
    return c.json(result.data, 201)
  } catch (error) {
    return c.json({ error: 'Invalid request data' }, 400)
  }
})

app.put('/api/v1/bookmarks/:id', async (c) => {
  const { bookmarkService } = initializeServices(c.env.DB)
  const auth = getAuthContext(c)
  
  try {
    const id = c.req.param('id')
    
    // First check if bookmark exists and belongs to user
    const existingResult = await bookmarkService.getBookmark(id)
    if (existingResult.error) {
      return c.json({ error: existingResult.error }, existingResult.error === 'Bookmark not found' ? 404 : 500)
    }
    
    if (existingResult.data?.userId !== auth.userId) {
      return c.json({ error: 'Bookmark not found' }, 404)
    }
    
    const body = await c.req.json()
    const validatedData = UpdateBookmarkSchema.parse(body)
    const result = await bookmarkService.updateBookmark(id, validatedData)
    if (result.error) {
      return c.json({ error: result.error }, result.error === 'Bookmark not found' ? 404 : 500)
    }
    return c.json(result.data)
  } catch (error) {
    return c.json({ error: 'Invalid request data' }, 400)
  }
})

app.delete('/api/v1/bookmarks/:id', async (c) => {
  const { bookmarkService } = initializeServices(c.env.DB)
  const auth = getAuthContext(c)
  const id = c.req.param('id')
  
  // First check if bookmark exists and belongs to user
  const existingResult = await bookmarkService.getBookmark(id)
  if (existingResult.error) {
    return c.json({ error: existingResult.error }, existingResult.error === 'Bookmark not found' ? 404 : 500)
  }
  
  if (existingResult.data?.userId !== auth.userId) {
    return c.json({ error: 'Bookmark not found' }, 404)
  }
  
  const result = await bookmarkService.deleteBookmark(id)
  if (result.error) {
    return c.json({ error: result.error }, result.error === 'Bookmark not found' ? 404 : 500)
  }
  return c.json({ message: result.message })
})

// New save endpoint
app.post('/api/v1/bookmarks/save', async (c) => {
  const { bookmarkSaveService } = initializeServices(c.env.DB)
  const auth = getAuthContext(c)
  
  try {
    const body = await c.req.json()
    const validatedData = SaveBookmarkSchema.parse(body)
    
    // Ensure user exists in database before creating bookmark
    const d1Repository = new D1BookmarkRepository(c.env.DB)
    await d1Repository.ensureUser({
      id: auth.userId
    })
    
    // Ensure userId is set to authenticated user
    const saveData = {
      ...validatedData,
      userId: auth.userId
    }
    
    const result = await bookmarkSaveService.saveBookmark(saveData)
    
    if (!result.success) {
      if (result.duplicate) {
        return c.json({ 
          error: result.message,
          duplicate: result.duplicate 
        }, 409) // Conflict
      }
      console.error('Error creating bookmark with metadata:', result.error)
      return c.json({ error: result.error }, 500)
    }
    
    return c.json({ 
      data: result.bookmark,
      message: result.message 
    }, 201)
  } catch (error) {
    console.error('Error creating bookmark with metadata:', error)
    return c.json({ error: 'Invalid request data' }, 400)
  }
})

// Metadata preview endpoint
app.post('/api/v1/bookmarks/preview', async (c) => {
  const { bookmarkSaveService } = initializeServices(c.env.DB)
  try {
    const body = await c.req.json()
    const { url } = body
    
    if (!url || typeof url !== 'string') {
      return c.json({ error: 'URL is required' }, 400)
    }
    
    const result = await bookmarkSaveService.previewMetadata(url)
    
    if (!result.success) {
      return c.json({ error: result.error }, 500)
    }
    
    return c.json({ 
      data: result.bookmark,
      message: result.message 
    })
  } catch (error) {
    return c.json({ error: 'Invalid request data' }, 400)
  }
})

// Refresh metadata endpoint
app.put('/api/v1/bookmarks/:id/refresh', async (c) => {
  const { bookmarkSaveService } = initializeServices(c.env.DB)
  const auth = getAuthContext(c)
  
  try {
    const id = c.req.param('id')
    
    // First check if bookmark exists and belongs to user
    const { bookmarkService } = initializeServices(c.env.DB)
    const existingResult = await bookmarkService.getBookmark(id)
    if (existingResult.error) {
      return c.json({ error: existingResult.error }, existingResult.error === 'Bookmark not found' ? 404 : 500)
    }
    
    if (existingResult.data?.userId !== auth.userId) {
      return c.json({ error: 'Bookmark not found' }, 404)
    }
    
    const result = await bookmarkSaveService.refreshMetadata(id)
    
    if (!result.success) {
      return c.json({ error: result.error }, result.error === 'Bookmark not found' ? 404 : 500)
    }
    
    return c.json({ 
      data: result.bookmark,
      message: result.message 
    })
  } catch (error) {
    return c.json({ error: 'Failed to refresh metadata' }, 500)
  }
})

export default app