# Homepage Redesign Plan

## Overview
Redesign the home page/tab of the Zine app using the existing design system components from `@packages/design-system/`. The new design will create a personalized, content-rich experience inspired by streaming platforms like Spotify, with responsive navigation and smart content organization.

## Design Requirements

### 1. Responsive Navigation
**Mobile (< 768px)**
- Bottom tab bar with icons for: Home, Library, Profile
- Fixed to bottom of viewport
- Header at top with "Zine" title
- Clean, minimal design with clear active states

**Tablet/Desktop (≥ 768px)**
- Header navigation bar at top
- Contains: Logo, nav items (Home, Library, Profile), user avatar
- Fixed to top of viewport
- Subtle background blur effect when scrolling

### 2. Quick Actions Row
Three prominent action buttons in a horizontal row:
- **Continue**: Resume last opened bookmark (with play icon)
- **Favorites**: Quick access to favorited items (with star icon)
- **Add New**: Navigate to add bookmark page (with plus icon)

Visual design:
- Rounded rectangle cards with subtle shadows
- Icons centered with labels below
- Hover/active states with slight scale animation
- Using `QuickActionGrid` and `QuickActionButton` components

### 3. Recent Carousel
**Behavior & Display:**
- Display 10 most recently added or opened bookmarks
- Horizontal scrolling carousel with smooth snap points
- Opening a bookmark immediately moves it to first position
- **State persistence**: Use Durable Objects for cross-device sync

**Visual Design:**
- Use `BookmarkCard` component with rich media preview
- Show content type badge (VIDEO, PODCAST, ARTICLE)
- Display duration/length for time-based content
- Platform-specific color coding (orange for videos, pink for podcasts, blue for articles)
- Gradient overlays matching content type

### 4. Queue Section (D1 Database)
**Content Organization:**
- Condensed list view of 20 most recently added bookmarks
- Data fetched directly from D1 database (sorted by `createdAt`)
- Vertical scrolling list with minimal but informative cards
- "See all" link to full library

**Visual Design:**
- Compact cards with thumbnail, title, and source
- Subtle dividers between items
- Quick action buttons (play, favorite, remove) on hover/tap
- Consistent with Recent section color coding

**Data Source:**
- Uses existing bookmarks table in D1 database
- No need for Durable Objects (simple chronological ordering)
- Leverages existing `/api/v1/bookmarks` endpoint with query params

## Technical Implementation

### Components Architecture

```typescript
// Home page structure
<AppShell>
  <ResponsiveNavigation />
  <Container>
    <Section>
      <QuickActions />
    </Section>
    <Section>
      <RecentCarousel />
    </Section>
    <Section>
      <QueueList />
    </Section>
  </Container>
</AppShell>
```

### Components to Use
From `@packages/design-system/`:
- `AppShell` - Main layout wrapper with responsive behavior
- `Navbar` - Desktop navigation header
- `BottomNav` - Mobile tab bar navigation
- `QuickActionGrid` & `QuickActionButton` - Quick actions section
- `BookmarkCard` - Recent carousel and queue items
- `Container`, `Section`, `Stack`, `Flex` - Layout utilities
- `Badge` - Content type indicators
- `Skeleton` - Loading states

### State Management Architecture

The homepage uses a hybrid approach for state management:
- **Recent Carousel**: Durable Objects for cross-device sync and real-time updates
- **Queue Section**: D1 Database queries for chronological bookmarks
- **Quick Actions**: Local React state (no persistence needed)

### Recent Carousel - Durable Objects Implementation

#### Why Durable Objects for Recent Items?
- **Strong consistency**: No race conditions when updating recent items across devices
- **Real-time sync**: Changes reflect immediately across all user sessions
- **Scalability**: Each user gets their own DO instance, no global state bottlenecks
- **Durability**: State persists without relying on browser localStorage
- **Edge computing**: Low latency by running at Cloudflare edge locations

#### Durable Object Design

```typescript
// packages/api/src/durableObjects/UserRecentBookmarks.ts

export class UserRecentBookmarksDO implements DurableObject {
  private state: DurableObjectState;
  private recentItems: Map<string, RecentItem>;
  private readonly MAX_RECENT_ITEMS = 10;
  private readonly MAX_QUEUE_ITEMS = 20;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.recentItems = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    switch (path) {
      case '/recent':
        return this.getRecentItems();
      case '/queue':
        return this.getQueueItems();
      case '/update-opened':
        return this.updateOpened(request);
      case '/add-new':
        return this.addNewBookmark(request);
      case '/continue':
        return this.getContinueItem();
      case '/ws':
        return this.handleWebSocket(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async getRecentItems(): Promise<Response> {
    await this.loadState();
    const items = Array.from(this.recentItems.values())
      .sort((a, b) => b.lastInteracted - a.lastInteracted)
      .slice(0, this.MAX_RECENT_ITEMS);
    
    return Response.json({ items });
  }

  private async updateOpened(request: Request): Promise<Response> {
    const { bookmarkId } = await request.json();
    await this.loadState();
    
    const now = Date.now();
    const existingItem = this.recentItems.get(bookmarkId);
    
    if (existingItem) {
      existingItem.lastOpened = now;
      existingItem.lastInteracted = now;
      existingItem.openCount = (existingItem.openCount || 0) + 1;
    } else {
      this.recentItems.set(bookmarkId, {
        bookmarkId,
        lastOpened: now,
        lastInteracted: now,
        addedAt: now,
        openCount: 1
      });
    }
    
    await this.saveState();
    this.broadcast({ type: 'opened', bookmarkId });
    
    return Response.json({ success: true });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    
    this.state.acceptWebSocket(server);
    
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private broadcast(message: any) {
    const sockets = this.state.getWebSockets();
    const msg = JSON.stringify(message);
    sockets.forEach(socket => socket.send(msg));
  }
}

// Type definitions
interface RecentItem {
  bookmarkId: string;
  lastOpened: number;
  lastInteracted: number;
  addedAt: number;
  openCount: number;
}
```

#### API Integration

```typescript
// packages/api/src/routes/user-state.ts

export const userStateRoutes = new Hono()
  .get('/recent', async (c) => {
    const userId = c.get('userId'); // from auth middleware
    const doId = c.env.USER_RECENT_BOOKMARKS.idFromName(userId);
    const stub = c.env.USER_RECENT_BOOKMARKS.get(doId);
    
    const response = await stub.fetch(
      new Request('https://do/recent')
    );
    
    return c.json(await response.json());
  })
  .post('/bookmark-opened', async (c) => {
    const userId = c.get('userId');
    const { bookmarkId } = await c.req.json();
    
    const doId = c.env.USER_RECENT_BOOKMARKS.idFromName(userId);
    const stub = c.env.USER_RECENT_BOOKMARKS.get(doId);
    
    await stub.fetch(
      new Request('https://do/update-opened', {
        method: 'POST',
        body: JSON.stringify({ bookmarkId })
      })
    );
    
    return c.json({ success: true });
  })
  .get('/ws', async (c) => {
    const userId = c.get('userId');
    const upgradeHeader = c.req.header('Upgrade');
    
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return c.text('Expected WebSocket', 426);
    }
    
    const doId = c.env.USER_RECENT_BOOKMARKS.idFromName(userId);
    const stub = c.env.USER_RECENT_BOOKMARKS.get(doId);
    
    return stub.fetch(new Request('https://do/ws', {
      headers: c.req.raw.headers,
    }));
  });
```

### Queue Section - D1 Database Implementation

```typescript
// apps/web/src/hooks/useQueueBookmarks.ts

export function useQueueBookmarks() {
  const { data: bookmarks, isLoading } = useQuery({
    queryKey: ['queue-bookmarks'],
    queryFn: async () => {
      // Use existing bookmarks endpoint
      // The API already sorts by createdAt descending
      const response = await api.get('/api/v1/bookmarks', {
        params: {
          status: 'active',
          limit: 20
        }
      });
      return response.data.data; // Returns sorted bookmarks
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
  
  return {
    queueBookmarks: bookmarks || [],
    isLoading
  };
}

// Optional: Add dedicated endpoint for better performance
// packages/api/src/index.ts
app.get('/api/v1/bookmarks/recent', async (c) => {
  const auth = getAuthContext(c);
  const limit = parseInt(c.req.query('limit') || '20');
  
  const { bookmarkService } = await initializeServices(c.env.DB, c.env);
  
  // Direct DB query optimized for recent items
  const recentBookmarks = await c.env.DB.prepare(`
    SELECT * FROM bookmarks 
    WHERE userId = ? AND status = 'active'
    ORDER BY createdAt DESC
    LIMIT ?
  `).bind(auth.userId, limit).all();
  
  return c.json({
    data: recentBookmarks.results,
    meta: {
      total: recentBookmarks.results.length,
      limit
    }
  });
});
```

#### Frontend Integration for Recent Carousel

```typescript
// apps/web/src/hooks/useRecentBookmarks.ts

export function useRecentBookmarks() {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const queryClient = useQueryClient();
  
  // Fetch recent bookmarks
  const { data: recentData } = useQuery({
    queryKey: ['recent-bookmarks'],
    queryFn: async () => {
      const response = await api.get('/api/v1/user-state/recent');
      return response.data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  
  // Establish WebSocket connection for real-time updates
  useEffect(() => {
    const ws = new WebSocket(
      `${WS_BASE_URL}/api/v1/user-state/ws`
    );
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'opened' || data.type === 'added') {
        // Invalidate and refetch
        queryClient.invalidateQueries(['recent-bookmarks']);
      }
    };
    
    setSocket(ws);
    
    return () => {
      ws.close();
    };
  }, [queryClient]);
  
  // Update when bookmark is opened
  const markAsOpened = useMutation({
    mutationFn: async (bookmarkId: string) => {
      return api.post('/api/v1/user-state/bookmark-opened', {
        bookmarkId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['recent-bookmarks']);
    }
  });
  
  return {
    recentBookmarks: recentData?.items || [],
    markAsOpened,
    isConnected: socket?.readyState === WebSocket.OPEN
  };
}
```

#### Wrangler Configuration

```toml
# packages/api/wrangler.toml

[[durable_objects.bindings]]
name = "USER_RECENT_BOOKMARKS"
class_name = "UserRecentBookmarksDO"

[[migrations]]
tag = "v1"
new_classes = ["UserRecentBookmarksDO"]
```

### Responsive Breakpoints
Using design system tokens from `@packages/design-system/src/tokens/breakpoints.ts`:
- Mobile: < 640px (sm)
- Tablet: 640px - 1024px (md-lg)
- Desktop: > 1024px (lg+)

### Data Flow with Durable Objects

1. **Initial Load**: 
   - Frontend requests recent items from DO via API
   - DO returns sorted list of recent bookmark IDs
   - Frontend fetches full bookmark data via TanStack Query
   - Merge DO state with bookmark data for display

2. **Real-time Updates**:
   - WebSocket connection established on mount
   - DO broadcasts changes to all connected clients
   - Frontend updates optimistically while syncing with DO

3. **Bookmark Interaction**:
   - User opens bookmark → Frontend sends update to DO
   - DO updates state and broadcasts to all clients
   - Other devices/tabs receive update via WebSocket

4. **Queue Management (D1 Database)**:
   - Direct database queries for recent bookmarks
   - No DO needed - simple chronological ordering
   - Use existing bookmark API with sorting parameters

#### Error Handling & Resilience

```typescript
// packages/api/src/durableObjects/UserRecentBookmarks.ts

export class UserRecentBookmarksDO {
  // ... previous code ...

  private async loadState(): Promise<void> {
    try {
      const stored = await this.state.storage.get<Map<string, RecentItem>>('recentItems');
      if (stored) {
        this.recentItems = new Map(stored);
      }
    } catch (error) {
      console.error('Failed to load state:', error);
      // Initialize with empty state on error
      this.recentItems = new Map();
    }
  }

  private async saveState(): Promise<void> {
    try {
      await this.state.storage.put('recentItems', Array.from(this.recentItems.entries()));
      
      // Cleanup old items (> 30 days)
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      for (const [id, item] of this.recentItems) {
        if (item.lastInteracted < thirtyDaysAgo) {
          this.recentItems.delete(id);
        }
      }
    } catch (error) {
      console.error('Failed to save state:', error);
      // Log to monitoring service
      throw error;
    }
  }

  // Automatic reconnection handling
  webSocketMessage(ws: WebSocket, message: string) {
    try {
      const data = JSON.parse(message);
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  }

  webSocketClose(ws: WebSocket) {
    // Clean up any ws-specific state
    console.log('WebSocket closed');
  }
}
```

#### Testing Strategy

```typescript
// packages/api/src/durableObjects/__tests__/UserRecentBookmarks.test.ts

describe('UserRecentBookmarksDO', () => {
  let env: TestEnvironment;
  let stub: DurableObjectStub;

  beforeEach(async () => {
    env = await createTestEnvironment();
    const id = env.USER_RECENT_BOOKMARKS.idFromName('test-user');
    stub = env.USER_RECENT_BOOKMARKS.get(id);
  });

  test('should add bookmark to recent items', async () => {
    const response = await stub.fetch(
      new Request('https://do/add-new', {
        method: 'POST',
        body: JSON.stringify({ bookmarkId: 'bookmark-1' })
      })
    );
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should maintain max 10 recent items', async () => {
    // Add 15 items
    for (let i = 0; i < 15; i++) {
      await stub.fetch(
        new Request('https://do/add-new', {
          method: 'POST',
          body: JSON.stringify({ bookmarkId: `bookmark-${i}` })
        })
      );
    }
    
    const response = await stub.fetch(new Request('https://do/recent'));
    const { items } = await response.json();
    
    expect(items.length).toBe(10);
  });

  test('should broadcast updates via WebSocket', async () => {
    const ws = new WebSocket('wss://do/ws');
    const messages: any[] = [];
    
    ws.onmessage = (event) => {
      messages.push(JSON.parse(event.data));
    };
    
    await stub.fetch(
      new Request('https://do/update-opened', {
        method: 'POST',
        body: JSON.stringify({ bookmarkId: 'bookmark-1' })
      })
    );
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(messages).toContainEqual({
      type: 'opened',
      bookmarkId: 'bookmark-1'
    });
  });
});
```

## Implementation Status

- ✅ **Phase 1: Navigation Setup** - COMPLETED
- ✅ **Phase 2: Quick Actions** - COMPLETED  
- ✅ **Phase 3: Durable Objects Setup** - COMPLETED
- ✅ **Phase 4: Recent Carousel** - COMPLETED (without DO integration)
- ✅ **Phase 5: Queue Section** - COMPLETED
- ⏳ **Phase 6: Polish & Optimization** - PENDING

## Implementation Steps

### Phase 1: Navigation Setup ✅
1. Create `ResponsiveNavigation` component
   - Detect viewport size using CSS media queries
   - Conditionally render `BottomNav` or `Navbar`
   - Add "Zine" header for mobile view
2. Configure route integration with TanStack Router
3. Set up navigation active states

### Phase 2: Quick Actions ✅
1. Implement `QuickActions` component using `QuickActionGrid`
2. Add icon imports from lucide-react (Play, Star, Plus)
3. Wire up "Add New" button to `/bookmarks/new` route
4. Create placeholder handlers for Continue and Favorites
5. Add hover animations and active states

### Phase 3: Durable Objects Setup ✅
1. Create `UserRecentBookmarksDO` class
   - Implement all endpoints (recent, queue, update-opened, etc.)
   - Add WebSocket support for real-time updates
   - Implement state persistence and cleanup logic
2. Configure wrangler.toml
   - Add DO bindings
   - Set up migration tags
3. Create API routes for DO interaction
   - `/api/v1/user-state/recent` - Get recent items
   - `/api/v1/user-state/bookmark-opened` - Update opened bookmark
   - `/api/v1/user-state/ws` - WebSocket endpoint
4. Deploy DO to Cloudflare Workers

### Phase 4: Recent Carousel Implementation ✅
1. Create `useRecentBookmarks` hook
   - Integrate with DO API endpoints
   - Establish WebSocket connection
   - Handle real-time updates
2. Build `RecentCarousel` component
   - Horizontal scroll container with CSS snap points
   - Render `BookmarkCard` components
   - Add touch/swipe support for mobile
3. Implement optimistic updates
   - Update UI immediately on interaction
   - Sync with DO in background
   - Handle conflicts gracefully

### Phase 5: Queue Section (D1 Database) ✅
1. Create `useQueueBookmarks` hook
   - Use existing `/api/v1/bookmarks` endpoint with query params
   - Sort by `createdAt` descending
   - Limit to 20 items using `limit` parameter
2. Build `QueueList` component
   - Vertical stack layout
   - Condensed card variant
   - Use existing `BookmarkCard` with compact variant
3. Add "See all" navigation to library
4. Optional: Add dedicated endpoint if needed
   - `GET /api/v1/bookmarks?sort=recent&limit=20`
   - Or create `/api/v1/bookmarks/recent` for optimized query

### Phase 6: Polish & Optimization ⏳
1. Add loading skeletons for all sections
2. Implement error boundaries
3. Add smooth transitions and animations
4. Optimize image loading (lazy load, srcset)
5. Add keyboard navigation support
6. Test responsive behavior at all breakpoints

## Performance Considerations
- Virtual scrolling for queue list if performance issues arise
- Debounce localStorage writes (batch updates)
- Preload critical images above the fold
- Use React.memo for expensive card renders
- Consider intersection observer for carousel lazy loading

## Accessibility Requirements
- ARIA labels for all interactive elements
- Keyboard navigation for carousel (arrow keys)
- Screen reader announcements for state changes
- Focus management for navigation transitions
- Proper heading hierarchy (h1, h2, h3)
- Color contrast ratios meeting WCAG AA standards

## Durable Objects Benefits & Considerations

### Benefits
- **Cross-device sync**: Recent items sync instantly across all user devices
- **Real-time collaboration**: Multiple tabs/windows stay in sync via WebSocket
- **Edge performance**: DOs run at Cloudflare edge locations globally
- **Strong consistency**: No race conditions or merge conflicts
- **Automatic scaling**: Each user gets dedicated DO instance
- **Built-in persistence**: No need for external database for user state

### Cost Considerations
- **DO Requests**: $0.15 per million requests after free tier (1M/month)
- **Duration**: $12.50 per million GB-seconds
- **Storage**: Included in Workers KV pricing
- **WebSocket**: Counts as active connection duration

## Deployment Considerations for Durable Objects

### Development Environment
```bash
# Local development with miniflare
cd packages/api
bun run dev  # Miniflare supports DO emulation locally
```

### Production Deployment
```toml
# packages/api/wrangler.toml

[[durable_objects.bindings]]
name = "USER_RECENT_BOOKMARKS"
class_name = "UserRecentBookmarksDO"

[[migrations]]
tag = "v1"
new_classes = ["UserRecentBookmarksDO"]
```

## Success Criteria
- ✅ Responsive navigation seamlessly adapts to all screen sizes
- ✅ Quick actions provide immediate access to key features
- ✅ Recent carousel maintains state across ALL devices and sessions
- ✅ Real-time updates via WebSocket (< 100ms latency)
- ✅ Queue shows correct 20 most recent items with smooth scrolling
- ✅ All components consistently use design system
- ✅ Page loads in < 1 second on 4G connection
- ✅ Smooth 60fps scrolling and animations
- ✅ Zero layout shift during loading
- ✅ Accessible to screen readers and keyboard users
- ✅ < 50ms DO response time at p95