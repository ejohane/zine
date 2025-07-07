import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { bookmarkService, CreateBookmarkSchema, UpdateBookmarkSchema } from '@zine/shared'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', logger())
app.use('*', cors())

app.get('/', (c) => {
  return c.json({ message: 'Zine API is running' })
})

app.get('/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

// Bookmarks endpoints
app.get('/api/v1/bookmarks', async (c) => {
  const result = await bookmarkService.getBookmarks()
  if (result.error) {
    return c.json({ error: result.error }, 500)
  }
  return c.json(result.data)
})

app.get('/api/v1/bookmarks/:id', async (c) => {
  const id = c.req.param('id')
  const result = await bookmarkService.getBookmark(id)
  if (result.error) {
    return c.json({ error: result.error }, result.error === 'Bookmark not found' ? 404 : 500)
  }
  return c.json(result.data)
})

app.post('/api/v1/bookmarks', async (c) => {
  try {
    const body = await c.req.json()
    const validatedData = CreateBookmarkSchema.parse(body)
    const result = await bookmarkService.createBookmark(validatedData)
    if (result.error) {
      return c.json({ error: result.error }, 500)
    }
    return c.json(result.data, 201)
  } catch (error) {
    return c.json({ error: 'Invalid request data' }, 400)
  }
})

app.put('/api/v1/bookmarks/:id', async (c) => {
  try {
    const id = c.req.param('id')
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
  const id = c.req.param('id')
  const result = await bookmarkService.deleteBookmark(id)
  if (result.error) {
    return c.json({ error: result.error }, result.error === 'Bookmark not found' ? 404 : 500)
  }
  return c.json({ message: result.message })
})

export default app