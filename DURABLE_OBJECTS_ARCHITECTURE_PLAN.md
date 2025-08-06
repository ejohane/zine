# Durable Objects Architecture Migration Plan

## Progress Update
- **Phase 1: Durable Object Infrastructure** ✅ COMPLETED (2025-08-05)
  - Created UserSubscriptionManager Durable Object with full token management
  - Implemented token storage, refresh, validation, and error handling
  - Added alarm-based polling schedule with state persistence
  - Configured Durable Object bindings in wrangler.toml

- **Phase 2: Migration Tools** ✅ COMPLETED (2025-08-05)
  - **Phase 2.1: Data Migration**
    - Created comprehensive TokenToDOMigrator class with batch processing
    - Implemented database-backed migration status tracking
    - Added rollback capability with token export from DOs
    - Created migration CLI with status reporting and export functionality
    - Added migration HTTP endpoints for triggering via API
    - Added durableObjectId field to users table
    - Created tokenMigrationStatus table for tracking progress
  - **Phase 2.2: Dual-Mode Operation**
    - Implemented FeatureFlagService with percentage-based rollout
    - Created DualModeTokenService that checks DO first, falls back to D1
    - Built DualModeSubscriptionRepository wrapper for transparent token routing
    - Added metrics collection for operation comparison
    - Integrated feature flags into service initialization
    - Added migration metrics endpoint for monitoring
    - Implemented token synchronization verification in dual mode

- **Phase 3: Polling Logic Migration** ✅ COMPLETED (2025-08-05)
  - **Phase 3.1: Move Subscription Polling to DO** ✅ COMPLETED
    - Created SingleUserPollingService for individual user polling
    - Integrated polling logic into UserSubscriptionManager
    - Adapted polling for single-user context with direct API calls
    - Maintains per-user feed item creation and tracking
  - **Phase 3.2: Simplify Cron Job** ✅ COMPLETED
    - Rewrote cron handler to only send DO messages
    - Added feature flag check for gradual migration
    - Implemented batch processing for DO poll requests
    - Added comprehensive logging and metrics aggregation
    - Maintains backward compatibility with legacy polling
  - **Phase 3.3: Provider-Specific Processors** ✅ COMPLETED
    - Adapted Spotify and YouTube processing for single-user context
    - Removed batch processing complexity
    - Direct API calls per user subscription

- **Phase 4: Database Schema Updates** ✅ COMPLETED (2025-08-05)
  - **Phase 4.1: Remove Token Columns** ✅ COMPLETED
    - Created migration to remove accessToken and refreshToken columns
    - Updated schema to reflect token storage in DOs
    - Added isActive column to userAccounts table
    - Migration file ready for deployment after full DO rollout
  - **Phase 4.2: Add DO Tracking** ✅ COMPLETED
    - Created durableObjectStatus table for health monitoring
    - Created durableObjectMetrics table for performance tracking
    - Integrated status tracking into cron job
    - Added automatic status updates on each poll

## Overview

This document outlines a comprehensive plan to migrate from the current centralized cron job architecture to a distributed Durable Objects architecture for subscription polling and token management. The new architecture will isolate each user's data processing into individual Durable Object instances, removing the need for database-stored tokens and centralizing all user-specific operations.

## Current Architecture Problems

1. **Token Storage in Database**: OAuth tokens are stored in D1, creating unnecessary database load
2. **Centralized Cron Job**: Single cron job processes all users, creating a bottleneck
3. **Shared Token Pool**: Uses any valid token for API calls, complicating rate limiting
4. **Complex Batch Processing**: Required due to Cloudflare's subrequest limits
5. **Memory-based Caching**: Cache is ephemeral and recreated on each cron run

## New Architecture Benefits

1. **User Isolation**: Each user has their own Durable Object instance
2. **Persistent Token Storage**: Tokens stored in Durable Object state, not database
3. **Distributed Processing**: Each DO handles its own subscription polling
4. **Better Rate Limiting**: Per-user rate limits are naturally enforced
5. **Persistent State**: Cache and tokens persist between invocations
6. **Simplified Cron Job**: Only sends wake-up messages to DOs

## Architecture Design

### 1. Durable Object Structure

```typescript
// UserSubscriptionManager Durable Object
class UserSubscriptionManager {
  state: DurableObjectState;
  
  // Persistent state structure:
  // - OAuth tokens (access, refresh, expiry)
  // - User subscriptions cache
  // - Last poll timestamps
  // - Rate limit counters
  // - Polling configuration
}
```

### 2. Key Components

#### A. Token Management
- Store OAuth tokens in DO state, not D1
- Implement automatic token refresh within DO
- Handle token expiry and refresh errors gracefully
- Emit events for token status changes

#### B. Subscription Polling
- Each DO polls its user's subscriptions independently
- Maintains its own polling schedule and state
- Caches recent feed items in DO state
- Batch inserts new items to D1

#### C. Cron Job Simplification
- Cron job only fetches list of active user IDs
- Sends wake-up message to each user's DO
- DOs handle all actual processing

### 3. Data Flow

```
Cron Job (every 30 min)
    ↓
Get Active User IDs from D1
    ↓
Send Wake Message to Each User DO
    ↓
User DO Processes:
  - Check token validity
  - Refresh if needed
  - Poll subscriptions
  - Store new items in D1
  - Update last poll time
```

## Implementation Plan

### Phase 1: Durable Object Infrastructure (Week 1) ✅ COMPLETED

#### 1.1 Create Durable Object Classes
- [x] Create `UserSubscriptionManager` DO class
- [x] Define state structure for tokens and cache
- [x] Implement basic message handling
- [x] Add DO bindings to wrangler.toml

#### 1.2 Token Management in DO
- [x] Implement token storage methods
- [x] Create token refresh logic within DO
- [x] Add token validation methods
- [x] Implement error handling for token failures

#### 1.3 DO Lifecycle Management
- [x] Implement DO initialization from database
- [x] Create alarm-based polling schedule
- [x] Add graceful shutdown handling
- [x] Implement state persistence

### Phase 2: Migration Tools (Week 2)

#### 2.1 Data Migration Script
- [ ] Create script to migrate tokens from D1 to DOs
- [ ] Implement batch processing for large user bases
- [ ] Add rollback capability
- [ ] Create migration status tracking

#### 2.2 Dual-Mode Operation
- [ ] Modify existing services to check DO first, then D1
- [ ] Add feature flag for gradual rollout
- [ ] Implement metrics for comparison
- [ ] Create fallback mechanisms

### Phase 3: Polling Logic Migration (Week 3)

#### 3.1 Move Subscription Polling to DO
- [ ] Port `OptimizedFeedPollingService` logic to DO
- [ ] Adapt for single-user context
- [ ] Implement DO-specific caching
- [ ] Add progress tracking

#### 3.2 Simplify Cron Job
- [ ] Rewrite cron handler to only send DO messages
- [ ] Remove token refresh logic from cron
- [ ] Implement DO health monitoring
- [ ] Add retry logic for failed DO messages

#### 3.3 Provider-Specific Processors
- [ ] Adapt `SpotifyBatchProcessor` for single-user context
- [ ] Adapt `YouTubeBatchProcessor` for single-user context
- [ ] Remove batch optimizations (no longer needed)
- [ ] Implement per-user rate limiting

### Phase 4: Database Schema Updates (Week 4)

#### 4.1 Remove Token Columns
- [ ] Create migration to remove token columns from `userAccounts`
- [ ] Update ORM schemas
- [ ] Modify repository interfaces
- [ ] Update all token-related queries

#### 4.2 Add DO Tracking
- [ ] Add `durableObjectId` to users table
- [ ] Create DO status tracking table
- [ ] Add last poll timestamp columns
- [ ] Implement DO metrics collection

### Phase 5: Testing and Rollout (Week 5)

#### 5.1 Comprehensive Testing
- [ ] Unit tests for DO classes
- [ ] Integration tests for DO-API interaction
- [ ] Load testing with multiple DOs
- [ ] Error scenario testing

#### 5.2 Gradual Rollout
- [ ] Deploy to staging environment
- [ ] Enable for internal test users
- [ ] Roll out to 10% of users
- [ ] Monitor metrics and performance
- [ ] Full rollout

### Phase 6: Cleanup (Week 6)

#### 6.1 Remove Old Code
- [ ] Delete old cron job implementation
- [ ] Remove `TokenRefreshService`
- [ ] Delete batch processing logic
- [ ] Clean up unused database queries

#### 6.2 Documentation
- [ ] Update API documentation
- [ ] Create DO architecture diagrams
- [ ] Write troubleshooting guide
- [ ] Update deployment procedures

## Technical Implementation Details

### 1. Durable Object Class Structure

```typescript
export class UserSubscriptionManager implements DurableObject {
  private state: DurableObjectState;
  private userId: string;
  private tokens: Map<string, OAuthTokens>;
  private subscriptions: Map<string, Subscription>;
  private lastPollTime: Map<string, Date>;
  private pollInterval: number = 30 * 60 * 1000; // 30 minutes

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      // Initialize from storage
      this.tokens = await this.state.storage.get("tokens") || new Map();
      this.subscriptions = await this.state.storage.get("subscriptions") || new Map();
      this.lastPollTime = await this.state.storage.get("lastPollTime") || new Map();
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    switch (url.pathname) {
      case "/poll":
        return this.handlePoll();
      case "/refresh-tokens":
        return this.handleTokenRefresh();
      case "/update-token":
        return this.handleTokenUpdate(request);
      default:
        return new Response("Not found", { status: 404 });
    }
  }

  async alarm(): Promise<void> {
    // Scheduled polling
    await this.pollSubscriptions();
    // Schedule next alarm
    await this.state.storage.setAlarm(Date.now() + this.pollInterval);
  }
}
```

### 2. Cron Job Simplification

```typescript
export async function scheduled(event: ScheduledEvent, env: Env): Promise<void> {
  const userIds = await env.DB.prepare(
    "SELECT id FROM users WHERE isActive = 1"
  ).all();

  const promises = userIds.results.map(async (user) => {
    const id = env.USER_SUBSCRIPTION_MANAGER.idFromString(user.id);
    const stub = env.USER_SUBSCRIPTION_MANAGER.get(id);
    
    try {
      await stub.fetch(new Request("https://do.internal/poll"));
    } catch (error) {
      console.error(`Failed to poll user ${user.id}:`, error);
    }
  });

  await Promise.allSettled(promises);
}
```

### 3. Token Storage Format

```typescript
interface DOTokenStorage {
  spotify?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    lastRefresh: Date;
  };
  youtube?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    lastRefresh: Date;
  };
}
```

### 4. Migration Script Outline

```typescript
async function migrateUserToDO(userId: string, env: Env): Promise<void> {
  // 1. Fetch user's tokens from D1
  const tokens = await fetchUserTokens(userId, env.DB);
  
  // 2. Get or create user's DO
  const id = env.USER_SUBSCRIPTION_MANAGER.idFromString(userId);
  const stub = env.USER_SUBSCRIPTION_MANAGER.get(id);
  
  // 3. Transfer tokens to DO
  for (const token of tokens) {
    await stub.fetch(new Request("https://do.internal/update-token", {
      method: "POST",
      body: JSON.stringify(token),
    }));
  }
  
  // 4. Mark user as migrated
  await env.DB.prepare(
    "UPDATE users SET durableObjectId = ? WHERE id = ?"
  ).bind(id.toString(), userId).run();
}
```

## Rollback Plan

1. **Feature Flags**: Keep old code behind feature flags
2. **Dual Storage**: Temporarily write to both DO and D1
3. **Quick Switch**: API can quickly switch between DO and D1 sources
4. **Data Export**: DOs can export their state back to D1 if needed

## Monitoring and Metrics

1. **DO Health Metrics**:
   - Active DO count
   - Average processing time per DO
   - Token refresh success rate
   - Polling success rate

2. **Performance Comparison**:
   - Old vs new architecture processing time
   - Database query reduction
   - API call distribution

3. **Error Tracking**:
   - DO initialization failures
   - Token refresh failures
   - Polling errors by provider

## Risk Mitigation

1. **Gradual Rollout**: Start with small percentage of users
2. **Monitoring**: Comprehensive metrics before full rollout
3. **Fallback**: Keep ability to revert to old architecture
4. **Testing**: Extensive testing in staging environment
5. **Documentation**: Clear runbooks for common issues

## Success Criteria

1. **Performance**: 50% reduction in cron job execution time
2. **Reliability**: 99.9% success rate for subscription polling
3. **Database Load**: 75% reduction in token-related queries
4. **Scalability**: Linear scaling with user growth
5. **Maintainability**: Simplified codebase with clear separation of concerns

## Timeline Summary

- **Week 1**: DO Infrastructure
- **Week 2**: Migration Tools
- **Week 3**: Polling Logic Migration
- **Week 4**: Database Updates
- **Week 5**: Testing and Rollout
- **Week 6**: Cleanup and Documentation

Total estimated time: 6 weeks for complete migration