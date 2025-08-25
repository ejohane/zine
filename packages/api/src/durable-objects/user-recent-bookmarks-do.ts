export interface RecentItem {
  bookmarkId: string
  lastOpened: number
  lastInteracted: number
  addedAt: number
  openCount: number
}

export class UserRecentBookmarksDO implements DurableObject {
  private state: DurableObjectState
  private recentItems: Map<string, RecentItem>
  private readonly MAX_RECENT_ITEMS = 10
  private readonly MAX_QUEUE_ITEMS = 20

  constructor(state: DurableObjectState) {
    this.state = state
    this.recentItems = new Map()
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    switch (path) {
      case '/recent':
        return this.getRecentItems()
      case '/queue':
        return this.getQueueItems()
      case '/update-opened':
        return this.updateOpened(request)
      case '/add-new':
        return this.addNewBookmark(request)
      case '/continue':
        return this.getContinueItem()
      case '/ws':
        return this.handleWebSocket(request)
      default:
        return new Response('Not found', { status: 404 })
    }
  }

  private async getRecentItems(): Promise<Response> {
    await this.loadState()
    const items = Array.from(this.recentItems.values())
      .sort((a, b) => b.lastInteracted - a.lastInteracted)
      .slice(0, this.MAX_RECENT_ITEMS)
    
    return Response.json({ items })
  }

  private async getQueueItems(): Promise<Response> {
    await this.loadState()
    const items = Array.from(this.recentItems.values())
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, this.MAX_QUEUE_ITEMS)
    
    return Response.json({ items })
  }

  private async getContinueItem(): Promise<Response> {
    await this.loadState()
    const items = Array.from(this.recentItems.values())
      .sort((a, b) => b.lastOpened - a.lastOpened)
    
    const continueItem = items[0] || null
    return Response.json({ item: continueItem })
  }

  private async updateOpened(request: Request): Promise<Response> {
    const { bookmarkId } = await request.json() as { bookmarkId: string }
    await this.loadState()
    
    const now = Date.now()
    const existingItem = this.recentItems.get(bookmarkId)
    
    if (existingItem) {
      existingItem.lastOpened = now
      existingItem.lastInteracted = now
      existingItem.openCount = (existingItem.openCount || 0) + 1
    } else {
      this.recentItems.set(bookmarkId, {
        bookmarkId,
        lastOpened: now,
        lastInteracted: now,
        addedAt: now,
        openCount: 1
      })
    }
    
    await this.saveState()
    this.broadcast({ type: 'opened', bookmarkId })
    
    return Response.json({ success: true })
  }

  private async addNewBookmark(request: Request): Promise<Response> {
    const { bookmarkId } = await request.json() as { bookmarkId: string }
    await this.loadState()
    
    const now = Date.now()
    const existingItem = this.recentItems.get(bookmarkId)
    
    if (existingItem) {
      // Update existing item
      existingItem.lastInteracted = now
    } else {
      // Add new item
      this.recentItems.set(bookmarkId, {
        bookmarkId,
        lastOpened: 0,
        lastInteracted: now,
        addedAt: now,
        openCount: 0
      })
    }
    
    await this.saveState()
    this.broadcast({ type: 'added', bookmarkId })
    
    return Response.json({ success: true })
  }

  private async handleWebSocket(_request: Request): Promise<Response> {
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    
    this.state.acceptWebSocket(server)
    
    // Send initial ping to keep connection alive
    server.addEventListener('open', () => {
      server.send(JSON.stringify({ type: 'connected' }))
    })
    
    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  private broadcast(message: any) {
    const sockets = this.state.getWebSockets()
    const msg = JSON.stringify(message)
    sockets.forEach(socket => {
      try {
        socket.send(msg)
      } catch (error) {
        console.error('Failed to send message to socket:', error)
      }
    })
  }

  private async loadState(): Promise<void> {
    try {
      const stored = await this.state.storage.get<[string, RecentItem][]>('recentItems')
      if (stored) {
        this.recentItems = new Map(stored)
      }
    } catch (error) {
      console.error('Failed to load state:', error)
      // Initialize with empty state on error
      this.recentItems = new Map()
    }
  }

  private async saveState(): Promise<void> {
    try {
      // Clean up old items (> 30 days)
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
      for (const [id, item] of this.recentItems) {
        if (item.lastInteracted < thirtyDaysAgo) {
          this.recentItems.delete(id)
        }
      }
      
      // Save state
      await this.state.storage.put('recentItems', Array.from(this.recentItems.entries()))
    } catch (error) {
      console.error('Failed to save state:', error)
      throw error
    }
  }

  // WebSocket event handlers
  async webSocketMessage(ws: WebSocket, message: string) {
    try {
      const data = JSON.parse(message)
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }))
      }
    } catch (error) {
      console.error('WebSocket message error:', error)
    }
  }

  async webSocketClose(_ws: WebSocket) {
    // Clean up any ws-specific state
    console.log('WebSocket closed')
  }

  async webSocketError(_ws: WebSocket, error: any) {
    console.error('WebSocket error:', error)
  }
}