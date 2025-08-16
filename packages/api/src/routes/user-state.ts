import { Hono } from 'hono'
import type { Env } from '../types'
import { getAuthContext } from '../middleware/auth'

type Variables = {
  userId?: string
}

export const userStateRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get('/recent', async (c) => {
    const auth = getAuthContext(c)
    
    const doId = c.env.USER_RECENT_BOOKMARKS.idFromName(auth.userId)
    const stub = c.env.USER_RECENT_BOOKMARKS.get(doId)
    
    const response = await stub.fetch(
      new Request('https://do/recent')
    )
    
    const data = await response.json() as any
    return c.json(data)
  })
  .get('/continue', async (c) => {
    const auth = getAuthContext(c)
    
    const doId = c.env.USER_RECENT_BOOKMARKS.idFromName(auth.userId)
    const stub = c.env.USER_RECENT_BOOKMARKS.get(doId)
    
    const response = await stub.fetch(
      new Request('https://do/continue')
    )
    
    const data = await response.json() as any
    return c.json(data)
  })
  .post('/bookmark-opened', async (c) => {
    const auth = getAuthContext(c)
    const { bookmarkId } = await c.req.json()
    
    if (!bookmarkId) {
      return c.json({ error: 'bookmarkId is required' }, 400)
    }
    
    const doId = c.env.USER_RECENT_BOOKMARKS.idFromName(auth.userId)
    const stub = c.env.USER_RECENT_BOOKMARKS.get(doId)
    
    await stub.fetch(
      new Request('https://do/update-opened', {
        method: 'POST',
        body: JSON.stringify({ bookmarkId })
      })
    )
    
    return c.json({ success: true })
  })
  .post('/bookmark-added', async (c) => {
    const auth = getAuthContext(c)
    const { bookmarkId } = await c.req.json()
    
    if (!bookmarkId) {
      return c.json({ error: 'bookmarkId is required' }, 400)
    }
    
    const doId = c.env.USER_RECENT_BOOKMARKS.idFromName(auth.userId)
    const stub = c.env.USER_RECENT_BOOKMARKS.get(doId)
    
    await stub.fetch(
      new Request('https://do/add-new', {
        method: 'POST',
        body: JSON.stringify({ bookmarkId })
      })
    )
    
    return c.json({ success: true })
  })
  .get('/ws', async (c) => {
    const auth = getAuthContext(c)
    const upgradeHeader = c.req.header('Upgrade')
    
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return c.text('Expected WebSocket', 426)
    }
    
    const doId = c.env.USER_RECENT_BOOKMARKS.idFromName(auth.userId)
    const stub = c.env.USER_RECENT_BOOKMARKS.get(doId)
    
    return stub.fetch(new Request('https://do/ws', {
      headers: c.req.raw.headers,
    }))
  })