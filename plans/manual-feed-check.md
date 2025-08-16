# Manual Feed Refresh Implementation Plan

## Overview
Enable users to manually trigger feed subscription updates through the UI, using the same polling logic that currently runs via cron job. This feature will not modify existing Durable Object (DO) logic or cron job settings.

## Current Architecture Summary

### Existing Components
1. **Cron Job**: Runs every 5 minutes via `wrangler.toml` triggers
2. **Scheduled Handler**: In `packages/api/src/index.ts`, fetches all active users and sends `/poll` requests to their DOs
3. **UserSubscriptionManager DO**: Handles polling via `/poll` endpoint which calls `pollSubscriptions()`
4. **SingleUserPollingService**: Performs actual subscription fetching and item creation

### Key Flow
```
Cron Job → scheduled() handler → DO /poll endpoint → pollSubscriptions() → SingleUserPollingService
```

## Implementation Strategy

### Phase 1: Backend API Endpoint

#### 1.1 Create Manual Trigger Endpoint
**File**: `packages/api/src/index.ts`

Create a new authenticated endpoint that allows users to manually trigger their own feed refresh:

```typescript
app.post('/api/v1/subscriptions/refresh', async (c) => {
  // 1. Authenticate user
  // 2. Check rate limiting (prevent abuse)
  // 3. Get user's DO ID from database
  // 4. Send /poll request to user's DO
  // 5. Return status and results
})
```

#### 1.2 Rate Limiting Implementation
**New File**: `packages/api/src/services/rate-limiter.ts`

Implement rate limiting to prevent abuse:
- Use Cloudflare Durable Objects or KV for tracking
- Allow max 1 manual refresh per user every 5 minutes
- Return appropriate error messages when rate limited

#### 1.3 Response Handling
The endpoint should return:
- Success status
- Number of new items found
- Any errors encountered
- Next allowed refresh time (for rate limiting)

### Phase 2: Frontend UI Components

#### 2.1 Refresh Button Component
**New File**: `apps/web/src/components/subscriptions/RefreshButton.tsx`

Create a button component with:
- Loading state during refresh
- Success/error feedback
- Disabled state when rate limited
- Tooltip showing last refresh time

#### 2.2 API Integration
**File**: `apps/web/src/lib/api.ts`

Add new API function:
```typescript
export async function refreshSubscriptions(token: string | null): Promise<RefreshResult> {
  // POST to /api/v1/subscriptions/refresh
  // Handle response and errors
}
```

#### 2.3 React Query Hook
**File**: `apps/web/src/hooks/useSubscriptions.ts`

Add new mutation hook:
```typescript
export function useRefreshSubscriptions() {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async () => {
      const token = await getToken()
      return refreshSubscriptions(token)
    },
    onSuccess: () => {
      // Invalidate feed and subscription queries
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['user-subscriptions'] })
    }
  })
}
```

#### 2.4 Integration Points
Add the refresh button to:
1. **Subscriptions Page** (`/subscriptions`): Top-level action button
2. **Feed Page** (`/`): Optional refresh indicator/button
3. **Individual Subscription View**: Per-subscription refresh (Phase 2 enhancement)

### Phase 3: Enhanced Features

#### 3.1 Status Tracking
Store and display:
- Last manual refresh timestamp per user
- Success/failure status
- Items found count
- Next allowed refresh time

#### 3.2 User Feedback
Implement toast notifications showing:
- "Refreshing subscriptions..." (loading)
- "Found X new items!" (success)
- "No new items found" (empty result)
- "Please wait X minutes before refreshing again" (rate limited)
- Error messages with retry option

## Database Schema Updates

### Add Rate Limiting Table (if using D1)
```sql
CREATE TABLE manual_refresh_limits (
  userId TEXT PRIMARY KEY,
  lastRefresh INTEGER NOT NULL,
  refreshCount INTEGER DEFAULT 0,
  createdAt INTEGER DEFAULT (unixepoch()),
  updatedAt INTEGER DEFAULT (unixepoch())
);
```

## Implementation Steps

### Step 1: Backend Foundation
1. [ ] Create rate limiter service
2. [ ] Implement `/api/v1/subscriptions/refresh` endpoint
3. [ ] Add proper error handling and logging
4. [ ] Test with existing DO infrastructure

### Step 2: Frontend Integration
1. [ ] Create RefreshButton component
2. [ ] Add API function and React Query hook
3. [ ] Integrate button into Subscriptions page
4. [ ] Add loading and success states

### Step 3: User Experience
1. [ ] Implement toast notifications
2. [ ] Add rate limiting feedback
3. [ ] Display last refresh timestamp
4. [ ] Add refresh status indicators

### Step 4: Testing & Validation
1. [ ] Test rate limiting behavior
2. [ ] Verify DO polling works correctly
3. [ ] Test error scenarios
4. [ ] Validate UI feedback

### Step 5: Documentation
1. [ ] Update API documentation
2. [ ] Add user-facing help text
3. [ ] Document rate limiting policy
4. [ ] Update CLAUDE.md if needed

## Security Considerations

1. **Authentication**: Ensure user can only refresh their own subscriptions
2. **Rate Limiting**: Prevent abuse and excessive API calls
3. **DO Isolation**: Maintain DO boundaries - users can't trigger other users' DOs
4. **Error Handling**: Don't expose internal errors to users

## Performance Considerations

1. **Async Processing**: Use `waitUntil()` for long-running operations
2. **Response Time**: Return immediately with status, process in background
3. **Cache Invalidation**: Carefully invalidate only necessary queries
4. **DO Efficiency**: Reuse existing polling logic without modifications

## Notes

- This implementation preserves all existing DO logic
- Cron job continues to run on schedule
- Manual refresh uses identical polling mechanism
- Rate limiting prevents system abuse
- UI provides clear feedback on refresh status