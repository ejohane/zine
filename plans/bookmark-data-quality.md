# Bookmark Data Quality Enhancement Plan

## Executive Summary

This plan outlines the implementation of a unified content model that consolidates metadata storage for both bookmarks and feed items. By creating a single `content` table as the source of truth, we eliminate data duplication, ensure consistent data quality, and make the system more maintainable as we expand the fields we capture from external content.

**Important Note**: Since we don't have any production data or users yet, we will directly replace existing tables rather than creating versioned tables (e.g., `bookmarks_v2`). This simplifies the migration significantly.

## Problem Statement

### Current Issues

1. **Data Quality Gap**: Feed items capture 40+ metadata fields while bookmarks capture only 10-15 basic fields
2. **Duplication**: Same content can exist as both bookmark and feed item with different metadata quality
3. **Inconsistency**: No connection between bookmarked YouTube/Spotify content and the same content in feeds
4. **Maintenance Burden**: Adding new fields requires updating multiple tables and schemas
5. **Missed Opportunities**: Can't leverage rich engagement metrics for bookmarked content

### Data Quality Comparison

#### Feed Items Currently Capture

- **Engagement**: viewCount, likeCount, commentCount, popularityScore, engagementRate, trendingScore
- **Creator**: creatorId, creatorName, creatorThumbnail, creatorVerified, creatorSubscriberCount
- **Series**: seriesId, seriesName, episodeNumber, seasonNumber, totalEpisodesInSeries
- **Technical**: hasCaptions, hasHd, videoQuality, hasTranscript, audioLanguages, audioQuality
- **Classification**: language, isExplicit, contentType, category, tags
- **Cross-platform**: contentFingerprint, publisherCanonicalId, normalizedTitle, episodeIdentifier

#### Bookmarks Currently Capture

- **Basic**: title, description, thumbnailUrl, url
- **Limited metadata**: videoMetadata (duration, viewCount), podcastMetadata (episodeTitle, episodeNumber)
- **User data**: notes, tags (user's personal)
- **No engagement metrics**, **No creator enrichment**, **No series context**, **No technical details**

## Proposed Solution: Unified Content Model

### Core Architecture

```
┌─────────────────────────────────────────────────────┐
│                   CONTENT TABLE                      │
│  Single source of truth for all content metadata     │
│  (YouTube videos, Spotify episodes, articles, etc.)  │
└─────────────────┬───────────────────────────────────┘
                  │
        ┌─────────┴─────────┬─────────────┐
        ▼                   ▼             ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  BOOKMARKS   │   │  FEED_ITEMS  │   │ USER_FEED    │
│              │   │              │   │    ITEMS     │
│ References   │   │ References   │   │              │
│ content via  │   │ content via  │   │ User-specific│
│ content_id   │   │ content_id   │   │ interactions │
└──────────────┘   └──────────────┘   └──────────────┘
```

### Database Schema

#### 1. Core Content Table

```sql
CREATE TABLE content (
  -- Primary identification
  id TEXT PRIMARY KEY, -- Format: "{provider}-{external_id}"
  external_id TEXT NOT NULL,
  provider TEXT NOT NULL, -- 'youtube', 'spotify', 'twitter', 'web'

  -- Core metadata
  url TEXT NOT NULL,
  canonical_url TEXT, -- Normalized URL
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  favicon_url TEXT,
  published_at TIMESTAMP,
  duration_seconds INTEGER,

  -- Engagement metrics (Phase 1 fields)
  view_count INTEGER,
  like_count INTEGER,
  comment_count INTEGER,
  share_count INTEGER,
  save_count INTEGER,
  popularity_score INTEGER, -- 0-100 normalized
  engagement_rate REAL, -- Decimal 0-1
  trending_score INTEGER, -- 0-100

  -- Creator/Publisher information (Phase 2 fields)
  creator_id TEXT,
  creator_name TEXT,
  creator_handle TEXT,
  creator_thumbnail TEXT,
  creator_verified BOOLEAN DEFAULT FALSE,
  creator_subscriber_count INTEGER,
  creator_follower_count INTEGER,

  -- Series/Episode context (Phase 2 fields)
  series_id TEXT,
  series_name TEXT,
  episode_number INTEGER,
  season_number INTEGER,
  total_episodes_in_series INTEGER,
  is_latest_episode BOOLEAN,
  series_metadata TEXT, -- JSON for additional series data

  -- Content classification (Phase 1 fields)
  content_type TEXT, -- 'video', 'podcast', 'article', 'post', 'short', 'live'
  category TEXT,
  subcategory TEXT,
  language TEXT, -- ISO 639-1 code
  is_explicit BOOLEAN DEFAULT FALSE,
  age_restriction TEXT,
  tags TEXT, -- JSON array of content tags
  topics TEXT, -- JSON array of detected topics

  -- Technical metadata (Phase 3 fields)
  has_captions BOOLEAN,
  has_transcript BOOLEAN,
  has_hd BOOLEAN,
  has_4k BOOLEAN,
  video_quality TEXT, -- '480p', '720p', '1080p', '4K'
  audio_quality TEXT, -- 'low', 'medium', 'high', 'lossless'
  audio_languages TEXT, -- JSON array of ISO 639-1 codes
  caption_languages TEXT, -- JSON array of ISO 639-1 codes

  -- Cross-platform matching (Phase 4 fields)
  content_fingerprint TEXT, -- SHA-256 hash for matching
  publisher_canonical_id TEXT, -- Unified publisher ID
  normalized_title TEXT, -- For fuzzy matching
  episode_identifier TEXT, -- Standardized episode ID
  cross_platform_matches TEXT, -- JSON array of matches

  -- Aggregated metadata objects for flexibility
  statistics_metadata TEXT, -- JSON: platform-specific stats
  technical_metadata TEXT, -- JSON: platform-specific technical details
  enrichment_metadata TEXT, -- JSON: API response data
  extended_metadata TEXT, -- JSON: future expansion fields

  -- Tracking
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_enriched_at TIMESTAMP,
  enrichment_version INTEGER DEFAULT 1,
  enrichment_source TEXT, -- 'api', 'oembed', 'opengraph', 'manual'

  -- Indexes
  UNIQUE(provider, external_id),
  INDEX idx_url (url),
  INDEX idx_canonical_url (canonical_url),
  INDEX idx_fingerprint (content_fingerprint),
  INDEX idx_publisher (publisher_canonical_id),
  INDEX idx_creator (creator_id),
  INDEX idx_series (series_id),
  INDEX idx_updated (updated_at),
  INDEX idx_content_type (content_type, provider)
);
```

#### 2. Simplified Bookmarks Table

```sql
-- Drop existing table and create new one
DROP TABLE IF EXISTS bookmarks;
CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content_id TEXT NOT NULL,

  -- User-specific data only
  notes TEXT,
  user_tags TEXT, -- JSON array of user's personal tags
  collections TEXT, -- JSON array of collection IDs
  status TEXT DEFAULT 'active', -- 'active', 'archived', 'deleted'
  is_favorite BOOLEAN DEFAULT FALSE,
  read_progress INTEGER, -- Percentage for articles/videos

  -- User timestamps
  bookmarked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP,
  archived_at TIMESTAMP,

  -- Foreign keys and indexes
  FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
  UNIQUE(user_id, content_id),
  INDEX idx_user_bookmarks (user_id, status, bookmarked_at DESC),
  INDEX idx_user_favorites (user_id, is_favorite, bookmarked_at DESC)
);
```

#### 3. Simplified Feed Items Table

```sql
-- Drop existing table and create new one
DROP TABLE IF EXISTS feed_items;
CREATE TABLE feed_items (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  content_id TEXT NOT NULL,

  -- Feed-specific data only
  added_to_feed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  position_in_feed INTEGER, -- For maintaining feed order

  -- Foreign keys and indexes
  FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
  UNIQUE(subscription_id, content_id),
  INDEX idx_subscription_feed (subscription_id, added_to_feed_at DESC)
);
```

#### 4. User Feed Interactions Table

```sql
-- Drop existing table if it exists and create new one
DROP TABLE IF EXISTS user_feed_items;
CREATE TABLE user_feed_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  feed_item_id TEXT NOT NULL,

  -- Interaction tracking
  is_read BOOLEAN DEFAULT FALSE,
  is_saved BOOLEAN DEFAULT FALSE,
  is_hidden BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  saved_at TIMESTAMP,
  engagement_time INTEGER, -- Seconds spent

  -- Connection to bookmark if saved
  bookmark_id TEXT,

  -- Foreign keys and indexes
  FOREIGN KEY (feed_item_id) REFERENCES feed_items(id) ON DELETE CASCADE,
  FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE SET NULL,
  UNIQUE(user_id, feed_item_id),
  INDEX idx_user_unread (user_id, is_read, feed_item_id)
);
```

### Service Architecture

#### Content Enrichment Service

```typescript
interface ContentEnrichmentService {
  // Main enrichment method
  enrichContent(url: string, options?: EnrichmentOptions): Promise<Content>;

  // Batch enrichment for efficiency
  enrichBatch(urls: string[], options?: EnrichmentOptions): Promise<Content[]>;

  // Update existing content
  refreshContent(contentId: string, force?: boolean): Promise<Content>;

  // Check if content needs refresh
  needsEnrichment(content: Content): boolean;
}

interface EnrichmentOptions {
  forceRefresh?: boolean;
  includeEngagement?: boolean; // Fetch latest engagement metrics
  includeCreator?: boolean; // Fetch creator details
  includeTechnical?: boolean; // Fetch technical metadata
  maxAge?: number; // Max age in seconds before refresh
}
```

#### Unified Content Repository

```typescript
interface ContentRepository {
  // CRUD operations
  findById(id: string): Promise<Content | null>;
  findByUrl(url: string): Promise<Content | null>;
  findByFingerprint(fingerprint: string): Promise<Content[]>;
  upsert(content: Partial<Content>): Promise<Content>;

  // Batch operations
  findByIds(ids: string[]): Promise<Content[]>;
  upsertBatch(contents: Partial<Content>[]): Promise<Content[]>;

  // Deduplication
  findDuplicates(content: Content): Promise<Content[]>;
  mergeDuplicates(primaryId: string, duplicateIds: string[]): Promise<void>;
}
```

## Implementation Phases

### Phase 1: Database Migration (Week 1-2)

#### Tasks

1. **Create new schema**
   - [ ] Drop existing tables (bookmarks, feed_items, user_feed_items)
   - [ ] Create content table with all fields
   - [ ] Create new bookmarks table
   - [ ] Create new feed_items table
   - [ ] Create user_feed_items table
   - [ ] Add all necessary indexes

2. **No data migration needed**
   - [ ] Since we have no production data, we start fresh
   - [ ] Document the new schema clearly
   - [ ] Set up proper seed data for testing

3. **Schema validation**
   - [ ] Verify all tables created correctly
   - [ ] Check foreign key constraints
   - [ ] Test with sample data

#### Clean Slate Strategy

```sql
-- Step 1: Drop all existing tables
DROP TABLE IF EXISTS bookmarks;
DROP TABLE IF EXISTS feed_items;
DROP TABLE IF EXISTS user_feed_items;

-- Step 2: Create new schema with proper structure
-- (Create all tables as defined above)

-- Step 3: No data migration needed - starting fresh
-- This eliminates any migration complexity and data corruption risks
```

### Phase 2: Service Layer Updates (Week 2-3)

#### Tasks

1. **Create ContentEnrichmentService**
   - [ ] Implement enrichContent method
   - [ ] Add provider-specific enrichment logic
   - [ ] Implement caching strategy
   - [ ] Add retry logic for API failures

2. **Update BookmarkService**
   - [ ] Modify to use ContentEnrichmentService
   - [ ] Update save logic to use content table
   - [ ] Implement deduplication checks

3. **Update FeedService**
   - [ ] Modify batch processors to use content table
   - [ ] Update polling logic
   - [ ] Implement incremental updates

4. **Create ContentRepository**
   - [ ] Implement all CRUD operations
   - [ ] Add deduplication methods
   - [ ] Implement efficient batch operations

### Phase 3: API Integration Enhancement (Week 3-4)

#### Tasks

1. **Extend metadata extractors**
   - [ ] Add YouTube API integration to bookmark saves
   - [ ] Add Spotify API integration to bookmark saves
   - [ ] Implement oEmbed fallbacks
   - [ ] Add OpenGraph parsing improvements

2. **Implement smart enrichment**
   - [ ] Check OAuth token availability
   - [ ] Fall back gracefully when APIs unavailable
   - [ ] Implement rate limit handling
   - [ ] Add quota management

## Appendix

### A. Sample Content Record

```json
{
  "id": "youtube-dQw4w9WgXcQ",
  "external_id": "dQw4w9WgXcQ",
  "provider": "youtube",
  "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up",
  "description": "Official music video...",
  "thumbnail_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  "published_at": "2009-10-25T06:57:33Z",
  "duration_seconds": 213,
  "view_count": 1400000000,
  "like_count": 15000000,
  "comment_count": 2000000,
  "popularity_score": 100,
  "engagement_rate": 0.0125,
  "creator_id": "UCuAXFkgsw1L7xaCfnd5JJOw",
  "creator_name": "Rick Astley",
  "creator_verified": true,
  "creator_subscriber_count": 3500000,
  "content_type": "video",
  "category": "Music",
  "has_captions": true,
  "has_hd": true,
  "video_quality": "1080p",
  "content_fingerprint": "a1b2c3d4e5f6...",
  "normalized_title": "rick astley never gonna give you up"
}
```
