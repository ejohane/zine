import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

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

app.get('/bookmarks', async (c) => {
  return c.json({ bookmarks: [] })
})

app.post('/bookmarks', async (c) => {
  const body = await c.req.json()
  return c.json({ message: 'Bookmark created', data: body }, 201)
})

export default app