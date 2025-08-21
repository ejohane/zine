# Cross-Platform Subscription Deduplication Plan

## Problem Statement
Users often subscribe to the same publication/creator on multiple platforms (e.g., The Daily podcast on both Spotify and YouTube), resulting in duplicate content in their feed. This creates a poor user experience with redundant entries and inflated unread counts.

## Solution Overview: Publication Groups with Smart Matching

### 1. Database Schema Enhancement

#### New Tables

```sql
-- Groups related subscriptions across platforms
CREATE TABLE publication_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                    -- Canonical name for the group
  primary_subscription_id TEXT,          -- User's preferred platform subscription
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  FOREIGN KEY (primary_subscription_id) REFERENCES subscriptions(id)
);

-- Links subscriptions to publication groups
CREATE TABLE publication_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,             -- spotify, youtube, etc.
  match_confidence REAL NOT NULL,        -- 0.0 to 1.0 confidence score
  match_criteria TEXT,                   -- JSON: what matched (name, url, etc.)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP NOT NULL,
  FOREIGN KEY (group_id) REFERENCES publication_groups(id),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

-- User preferences for handling duplicates
CREATE TABLE user_deduplication_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  group_id TEXT,                         -- NULL for global preferences
  preferred_provider TEXT,                -- spotify, youtube, or NULL for auto
  show_duplicates BOOLEAN DEFAULT false,  -- Whether to show all or dedupe
  dedup_strategy TEXT DEFAULT 'newest',   -- newest, preferred_platform, highest_quality
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (group_id) REFERENCES publication_groups(id)
);
```

### 2. Automatic Matching System

#### Matching Service Architecture

```typescript
// packages/api/src/services/subscription-matching-service.ts
export class SubscriptionMatchingService {
  // Strategies for matching subscriptions across platforms
  private matchingStrategies = [
    new ExactNameMatcher(),        // Exact normalized name match
    new FuzzyNameMatcher(),         // Levenshtein distance < 0.15
    new CreatorHandleMatcher(),     // Same @handle across platforms
    new WebsiteDomainMatcher(),     // Same linked website
    new RSSFeedMatcher(),          // Same RSS feed URL
    new ContentPatternMatcher()     // Similar episode patterns
  ];

  async findMatches(
    subscription: Subscription,
    existingSubscriptions: Subscription[]
  ): Promise<MatchResult[]> {
    // Run all strategies and combine results
    // Weight different signals appropriately
    // Return matches with confidence scores
  }
}
```

#### Matching Strategies

1. **Exact Name Matching** (Confidence: 0.9)
   - Normalize names (remove "Official", "Podcast", etc.)
   - Case-insensitive comparison
   - Handle Unicode normalization

2. **Fuzzy Name Matching** (Confidence: 0.7-0.85)
   - Levenshtein distance calculation
   - Account for common variations:
     - "The Daily" vs "The Daily - The New York Times"
     - "NPR's Up First" vs "Up First from NPR"
   - Substring matching for nested names

3. **Creator Handle Matching** (Confidence: 0.95)
   - Match @handles across platforms
   - Already partially implemented in CreatorService

4. **Domain Matching** (Confidence: 0.8)
   - Extract and compare website URLs
   - Match canonical domains

5. **Content Pattern Matching** (Confidence: 0.6-0.8)
   - Compare recent episode titles
   - Match publication schedules
   - Duration patterns for podcasts/videos

### 3. Feed Item Deduplication

#### Deduplication Logic

```typescript
// packages/api/src/services/feed-deduplication-service.ts
export class FeedDeduplicationService {
  deduplicateFeedItems(
    items: FeedItem[],
    userPreferences: UserDeduplicationPreferences
  ): FeedItem[] {
    // Group items by publication group
    const grouped = this.groupByPublication(items);
    
    // Apply deduplication strategy
    return grouped.flatMap(group => {
      if (group.items.length === 1) return group.items;
      
      switch (userPreferences.dedupStrategy) {
        case 'newest':
          return [this.selectNewest(group.items)];
        case 'preferred_platform':
          return [this.selectPreferredPlatform(group.items, userPreferences)];
        case 'highest_quality':
          return [this.selectHighestQuality(group.items)];
        case 'show_all':
          return group.items;
      }
    });
  }

  private isDuplicate(item1: FeedItem, item2: FeedItem): boolean {
    // Title similarity (fuzzy match)
    if (this.titleSimilarity(item1.title, item2.title) > 0.85) {
      // Check publication date (within 24 hours)
      if (Math.abs(item1.publishedAt - item2.publishedAt) < 86400000) {
        // Check duration for audio/video (±10% tolerance)
        if (item1.duration && item2.duration) {
          const tolerance = 0.1;
          const diff = Math.abs(item1.duration - item2.duration) / item1.duration;
          return diff <= tolerance;
        }
        return true;
      }
    }
    return false;
  }
}
```

### 4. User Controls

#### Manual Group Management
- UI to create/edit publication groups
- Drag-and-drop to group subscriptions
- Confidence indicators for automatic matches
- Ability to split incorrectly grouped items

#### Platform Preferences
- Global default platform preference
- Per-group platform override
- "Smart" mode that picks based on:
  - Which platform has the item first
  - Which has better quality (HD video vs SD)
  - Which the user interacts with more

### 5. UI Enhancements

#### Subscription List View
```tsx
// apps/web/src/components/subscriptions/GroupedSubscription.tsx
<Card>
  <CardHeader>
    <div className="flex items-center gap-2">
      <h3>{publicationGroup.name}</h3>
      <div className="flex gap-1">
        {publicationGroup.platforms.map(platform => (
          <PlatformBadge key={platform} platform={platform} />
        ))}
      </div>
    </div>
    <Badge>{totalUnreadCount} unread</Badge>
  </CardHeader>
  <CardContent>
    {showExpanded && (
      <div className="space-y-2">
        {publicationGroup.subscriptions.map(sub => (
          <SubscriptionItem 
            key={sub.id} 
            subscription={sub}
            isPrimary={sub.id === publicationGroup.primarySubscriptionId}
          />
        ))}
      </div>
    )}
  </CardContent>
</Card>
```

#### Feed View Enhancements
- Show platform icon on feed items
- "Also available on [platform]" tooltip
- Quick platform switcher for duplicates
- Unified "mark as read" across all platforms

### 6. Implementation Plan

#### Phase 1: Database & Core Logic (Week 1)
- [ ] Create database migrations for new tables
- [ ] Build SubscriptionMatchingService
- [ ] Implement matching strategies
- [ ] Add confidence scoring system

#### Phase 2: Automatic Detection (Week 2)
- [ ] Integrate matching into subscription discovery
- [ ] Run matching on existing subscriptions
- [ ] Create background job for periodic re-matching
- [ ] Build manual review queue for low-confidence matches

#### Phase 3: Feed Deduplication (Week 3)
- [ ] Implement FeedDeduplicationService
- [ ] Update feed polling to use deduplication
- [ ] Add user preference management
- [ ] Handle edge cases (deleted items, platform-exclusive content)

#### Phase 4: UI Implementation (Week 4)
- [ ] Build grouped subscription components
- [ ] Add manual grouping interface
- [ ] Implement preference controls
- [ ] Create onboarding flow for existing users

#### Phase 5: Optimization & Polish (Week 5)
- [ ] Performance optimization for large subscription lists
- [ ] Add analytics for matching accuracy
- [ ] Implement feedback mechanism for incorrect matches
- [ ] A/B test different default strategies

### 7. Technical Considerations

#### Performance
- Cache publication groups in memory
- Use database indexes on match_criteria fields
- Batch matching operations during discovery
- Implement incremental matching for new subscriptions

#### Data Migration
- Run one-time matching job on existing data
- Allow users to review and confirm matches
- Preserve existing user preferences
- Provide rollback mechanism

#### Edge Cases
- Platform-exclusive episodes/content
- Delayed releases across platforms
- Different episode numbering schemes
- Renamed shows/podcasts
- Content removed from one platform

### 8. Success Metrics

- **Deduplication Rate**: % of duplicate subscriptions correctly identified
- **False Positive Rate**: % of incorrect matches
- **User Engagement**: Reduction in "mark as read" actions
- **Feed Clarity**: Reduction in duplicate content shown
- **User Satisfaction**: Survey on feed organization improvement

### 9. Future Enhancements

- Machine learning model for improved matching
- Cross-platform playback position sync
- Intelligent platform selection based on user context (mobile vs desktop)
- Content quality comparison (audio bitrate, video resolution)
- Social features ("Your friends prefer this on Spotify")