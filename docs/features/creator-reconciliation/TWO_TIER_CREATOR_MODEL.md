# Two-Tier Creator Model - Technical Design Document

## Executive Summary

This document proposes a fundamental architectural change to how we model creators and content sources in Zine. The current single-tier model treats YouTube channels and Spotify shows as equivalent "creators," but this is semantically incorrect and leads to reconciliation problems.

**The Problem**: YouTube channels and Spotify shows are fundamentally different entity types:
- **YouTube Channel**: A creator's content container (e.g., "@joerogan" channel that hosts podcast episodes, clips, vlogs, etc.)
- **Spotify Show**: A specific podcast series (e.g., "The Joe Rogan Experience" podcast)

**The Solution**: A two-tier model that separates:
1. **Content Sources** (what users subscribe to): Channels, Shows, Playlists
2. **Creators** (the people/brands behind them): Joe Rogan, MKBHD, The New York Times

This enables proper cross-platform creator reconciliation while respecting platform semantics.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Proposed Architecture](#proposed-architecture)
3. [Data Model](#data-model)
4. [Migration Strategy](#migration-strategy)
5. [Implementation Plan](#implementation-plan)
6. [API Changes](#api-changes)
7. [Database Schema](#database-schema)
8. [Reconciliation Logic](#reconciliation-logic)
9. [User Experience](#user-experience)
10. [Rollout Plan](#rollout-plan)
11. [Future Enhancements](#future-enhancements)

---

## Problem Statement

### Current State

The existing `creators` table conflates two distinct concepts:

```typescript
// Current model treats these as equivalent "creators":
{
  id: "youtube:UCzQUP1qoWDoEbmsQxvdjxgQ",  // Joe Rogan's YouTube channel
  name: "PowerfulJRE",
  type: "channel" // implicit
}

{
  id: "spotify:4rOoJ6Egrf8K2IrywzwOMk",     // Joe Rogan's Spotify show
  name: "The Joe Rogan Experience",
  type: "show" // implicit
}
```

**Issues with this approach:**

1. **Semantic Mismatch**: A YouTube channel is not the same as a Spotify show
2. **Failed Reconciliation**: Name-based matching fails because "PowerfulJRE" ≠ "The Joe Rogan Experience"
3. **Duplicate Creators**: User sees two separate "creators" for the same person
4. **Incorrect Grouping**: Cannot group all content by actual creator (Joe Rogan the person)
5. **Platform Confusion**: Mixing platform-specific content sources with actual creators

### Real-World Examples

**Example 1: Joe Rogan**
- YouTube Channel: "@PowerfulJRE" (hosts podcast clips + other content)
- Spotify Show: "The Joe Rogan Experience" (podcast only)
- **Actual Creator**: Joe Rogan (the person)

**Example 2: MKBHD**
- YouTube Channel: "@mkbhd" (tech reviews, studio tours, auto content)
- Spotify Show: "Waveform: The MKBHD Podcast" (tech discussions)
- **Actual Creator**: Marques Brownlee (the person)

**Example 3: The New York Times**
- YouTube Channel: "The New York Times" (news videos, explainers)
- Spotify Shows: "The Daily", "Hard Fork", "The Ezra Klein Show" (multiple podcasts)
- **Actual Creator**: The New York Times (the organization)

### Why This Matters

Users think in terms of **creators** (people/brands they follow), not platform-specific IDs. They want to:
- See all content from Joe Rogan, regardless of platform
- Filter their feed by creator
- Discover that the same creator they follow on YouTube also has a Spotify podcast
- Understand the relationship between channels and shows

---

## Proposed Architecture

### Two-Tier Model

```
┌─────────────────────────────────────────────────────────────┐
│                         User                                 │
│                           ↓                                  │
│                    Subscriptions                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
              ┌─────────────┴─────────────┐
              ↓                           ↓
┌──────────────────────┐      ┌──────────────────────┐
│   Content Sources    │      │   Content Sources    │
│   (What You Follow)  │      │   (What You Follow)  │
├──────────────────────┤      ├──────────────────────┤
│ YouTube Channel      │      │ Spotify Show         │
│ "@PowerfulJRE"       │      │ "The Joe Rogan       │
│                      │      │  Experience"         │
│ Type: channel        │      │ Type: show           │
│ Platform: youtube    │      │ Platform: spotify    │
└──────────────────────┘      └──────────────────────┘
              ↓                           ↓
              └─────────────┬─────────────┘
                            ↓
              ┌──────────────────────────┐
              │        Creator           │
              │  (Who Creates Content)   │
              ├──────────────────────────┤
              │ Joe Rogan                │
              │                          │
              │ Handle: @joerogan        │
              │ Platforms: [youtube,     │
              │            spotify]      │
              └──────────────────────────┘
                            ↓
              ┌──────────────────────────┐
              │     Content Items        │
              │ (Videos, Episodes, etc.) │
              └──────────────────────────┘
```

### Key Principles

1. **Content Sources** represent what users subscribe to (platform-specific)
2. **Creators** represent who creates the content (cross-platform)
3. **Content Items** reference both the source they came from AND the creator
4. **Reconciliation** happens at the creator level, not the content source level
5. **User subscriptions** are to content sources, not creators (initially)

---

## Data Model

### Core Entities

#### 1. Content Source (New)

Represents a platform-specific content container that users can subscribe to.

```typescript
interface ContentSource {
  // Identity
  id: string                    // Format: "{platform}:{external_id}"
                                 // e.g., "youtube:UCzQUP1qoWDoEbmsQxvdjxgQ"
                                 //       "spotify:4rOoJ6Egrf8K2IrywzwOMk"
  
  externalId: string             // Platform's ID for this source
  platform: 'youtube' | 'spotify' | 'rss'
  
  // Type classification
  sourceType: 'channel' | 'show' | 'playlist' | 'series'
  
  // Metadata
  title: string                  // "PowerfulJRE" or "The Joe Rogan Experience"
  description?: string
  thumbnailUrl?: string
  url: string                    // Canonical URL
  
  // Platform-specific data
  subscriberCount?: number       // YouTube subscribers
  totalEpisodes?: number         // Spotify episode count
  isVerified?: boolean
  videoCount?: number            // YouTube video count
  
  // Creator relationship
  creatorId?: string             // Links to Creator entity
  creatorName?: string           // Display name from platform
  
  // Polling metadata
  lastPolledAt?: Date
  etag?: string
  uploadsPlaylistId?: string     // YouTube specific
  
  // Additional metadata
  metadata?: Record<string, any> // Platform-specific JSON
  
  // Timestamps
  createdAt: Date
  updatedAt: Date
}
```

#### 2. Creator (Enhanced)

Represents the actual person or brand creating content, potentially across multiple platforms.

```typescript
interface Creator {
  // Identity
  id: string                     // Canonical creator ID
                                  // Format: "creator:{uuid}" or first-seen ID
  
  // Core metadata
  name: string                   // Canonical name: "Joe Rogan"
  handle?: string                // Primary handle: "@joerogan"
  avatarUrl?: string
  bio?: string
  
  // Cross-platform presence
  platforms: string[]            // ["youtube", "spotify", "twitter"]
  contentSources: string[]       // IDs of associated ContentSources
  
  // Verification & metrics
  verified: boolean              // Verified on any platform
  primaryPlatform?: string       // Where they're most active
  totalSubscribers?: number      // Aggregated across platforms
  
  // Alternative identities
  alternativeNames: string[]     // ["PowerfulJRE", "Joe Rogan", "JRE"]
  platformHandles: Record<string, string> // {youtube: "@PowerfulJRE", twitter: "@joerogan"}
  
  // Links
  url?: string                   // Primary website/profile
  externalLinks?: Array<{
    title: string
    url: string
    platform?: string
  }>
  
  // Reconciliation metadata
  reconciliationConfidence?: number  // 0-1 confidence in creator matches
  manuallyVerified?: boolean         // Human confirmed the matches
  
  // Timestamps
  createdAt: Date
  updatedAt: Date
}
```

#### 3. Content Item (Updated)

Now references both the content source AND the creator.

```typescript
interface ContentItem {
  id: string                     // "{platform}-{external_id}"
  
  // Source relationships
  contentSourceId: string        // Where it came from (channel/show)
  creatorId?: string             // Who created it (person/brand)
  
  // Core metadata
  title: string
  url: string
  publishedAt?: Date
  
  // ... existing fields ...
}
```

### Relationship Mapping

```
User
  ↓ (has many)
UserSubscriptions
  ↓ (references)
Subscriptions
  ↓ (references - NEW)
ContentSources ──┐
  ↓              │ (belongs to)
  │              ↓
  │           Creator
  │              ↑
  ↓ (produces)   │ (creates)
ContentItems ────┘
  ↑
  │ (references)
FeedItems
  ↑
  │ (belongs to user)
UserFeedItems
```

---

## Database Schema

### New Table: content_sources

```sql
CREATE TABLE content_sources (
  -- Identity
  id TEXT PRIMARY KEY,                    -- {platform}:{external_id}
  external_id TEXT NOT NULL,
  platform TEXT NOT NULL,                 -- 'youtube', 'spotify', 'rss'
  source_type TEXT NOT NULL,              -- 'channel', 'show', 'playlist'
  
  -- Metadata
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  url TEXT NOT NULL,
  
  -- Creator relationship
  creator_id TEXT REFERENCES creators(id),
  creator_name TEXT,                      -- Display name from platform
  
  -- Platform-specific metrics
  subscriber_count INTEGER,
  total_episodes INTEGER,
  video_count INTEGER,
  is_verified INTEGER DEFAULT 0,          -- boolean
  
  -- Polling data
  last_polled_at INTEGER,                 -- timestamp
  etag TEXT,
  uploads_playlist_id TEXT,               -- YouTube specific
  
  -- Flexible metadata
  metadata TEXT,                          -- JSON
  
  -- Timestamps
  created_at INTEGER NOT NULL,            -- timestamp
  updated_at INTEGER NOT NULL,            -- timestamp
  
  -- Indexes
  UNIQUE(platform, external_id)
);

CREATE INDEX idx_content_sources_platform ON content_sources(platform);
CREATE INDEX idx_content_sources_creator_id ON content_sources(creator_id);
CREATE INDEX idx_content_sources_source_type ON content_sources(source_type);
```

### Updated Table: creators

```sql
-- Add new fields to existing creators table
ALTER TABLE creators ADD COLUMN alternative_names TEXT;  -- JSON array
ALTER TABLE creators ADD COLUMN platform_handles TEXT;   -- JSON object
ALTER TABLE creators ADD COLUMN content_source_ids TEXT; -- JSON array
ALTER TABLE creators ADD COLUMN primary_platform TEXT;
ALTER TABLE creators ADD COLUMN total_subscribers INTEGER;
ALTER TABLE creators ADD COLUMN reconciliation_confidence REAL;
ALTER TABLE creators ADD COLUMN manually_verified INTEGER DEFAULT 0;
```

### Updated Table: subscriptions

```sql
-- Link subscriptions to content sources instead of creators directly
ALTER TABLE subscriptions ADD COLUMN content_source_id TEXT REFERENCES content_sources(id);

-- Migration: Populate content_source_id from existing subscription data
```

### Updated Table: content

```sql
-- Add content_source_id to link content to its source
ALTER TABLE content ADD COLUMN content_source_id TEXT REFERENCES content_sources(id);

-- creator_id already exists, now it truly represents the creator (person/brand)
```

---

## Migration Strategy

### Phase 1: Schema Migration (Backward Compatible)

**Goal**: Add new tables and columns without breaking existing functionality.

```typescript
// Migration 001: Create content_sources table
export async function up(db: D1Database) {
  await db.exec(`
    CREATE TABLE content_sources (
      id TEXT PRIMARY KEY,
      external_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      source_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      thumbnail_url TEXT,
      url TEXT NOT NULL,
      creator_id TEXT,
      creator_name TEXT,
      subscriber_count INTEGER,
      total_episodes INTEGER,
      video_count INTEGER,
      is_verified INTEGER DEFAULT 0,
      last_polled_at INTEGER,
      etag TEXT,
      uploads_playlist_id TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(platform, external_id)
    );
    
    CREATE INDEX idx_content_sources_platform ON content_sources(platform);
    CREATE INDEX idx_content_sources_creator_id ON content_sources(creator_id);
    CREATE INDEX idx_content_sources_source_type ON content_sources(source_type);
  `);
}
```

```typescript
// Migration 002: Enhance creators table
export async function up(db: D1Database) {
  await db.exec(`
    ALTER TABLE creators ADD COLUMN alternative_names TEXT;
    ALTER TABLE creators ADD COLUMN platform_handles TEXT;
    ALTER TABLE creators ADD COLUMN content_source_ids TEXT;
    ALTER TABLE creators ADD COLUMN primary_platform TEXT;
    ALTER TABLE creators ADD COLUMN total_subscribers INTEGER;
    ALTER TABLE creators ADD COLUMN reconciliation_confidence REAL;
    ALTER TABLE creators ADD COLUMN manually_verified INTEGER DEFAULT 0;
  `);
}
```

```typescript
// Migration 003: Add relationships
export async function up(db: D1Database) {
  await db.exec(`
    ALTER TABLE subscriptions ADD COLUMN content_source_id TEXT;
    ALTER TABLE content ADD COLUMN content_source_id TEXT;
  `);
}
```

### Phase 2: Data Migration

**Goal**: Populate content_sources from existing subscriptions and creators.

```typescript
async function migrateExistingData(db: D1Database) {
  // Step 1: Create ContentSource for each subscription
  const subscriptions = await db.prepare(`
    SELECT * FROM subscriptions
  `).all();
  
  for (const sub of subscriptions.results) {
    const sourceType = sub.provider_id === 'youtube' ? 'channel' : 'show';
    const contentSourceId = `${sub.provider_id}:${sub.external_id}`;
    
    await db.prepare(`
      INSERT INTO content_sources (
        id, external_id, platform, source_type, title, description,
        thumbnail_url, url, creator_name, subscriber_count, total_episodes,
        is_verified, last_polled_at, etag, uploads_playlist_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      contentSourceId,
      sub.external_id,
      sub.provider_id,
      sourceType,
      sub.title,
      sub.description,
      sub.thumbnail_url,
      sub.subscription_url,
      sub.creator_name,
      sub.subscriber_count,
      sub.total_episodes,
      sub.is_verified,
      sub.last_polled_at,
      sub.etag,
      sub.uploads_playlist_id,
      sub.created_at,
      Date.now()
    ).run();
    
    // Link subscription to content source
    await db.prepare(`
      UPDATE subscriptions 
      SET content_source_id = ?
      WHERE id = ?
    `).bind(contentSourceId, sub.id).run();
  }
  
  // Step 2: Link existing creators to content sources
  // (This requires creator reconciliation logic - see next section)
}
```

### Phase 3: Creator Reconciliation

**Goal**: Link content sources to creators and consolidate duplicates.

This is the complex part - we need to:
1. Extract creator information from content sources
2. Apply fuzzy matching to find duplicate creators
3. Consolidate and create canonical creator records
4. Link content sources to creators

See [Reconciliation Logic](#reconciliation-logic) section for details.

### Phase 4: Code Migration

**Goal**: Update application code to use new model.

1. Update `single-user-polling-service.ts` to create ContentSources
2. Update feed queries to join through content_sources
3. Update UI to display creator groupings
4. Deprecate direct creator references from subscriptions

---

## Implementation Plan

### Stage 1: Foundation (Week 1)

**Goal**: Add new tables without breaking existing functionality.

- [ ] Create database migration for `content_sources` table
- [ ] Create database migration to enhance `creators` table
- [ ] Create `ContentSourceRepository` class
- [ ] Create TypeScript types for `ContentSource`
- [ ] Write unit tests for repository methods

**Deliverables**:
- Migration files
- `ContentSourceRepository` with CRUD operations
- Type definitions
- Unit tests

### Stage 2: Data Migration (Week 1-2)

**Goal**: Populate content_sources from existing data.

- [ ] Write migration script to create ContentSources from subscriptions
- [ ] Create ContentSource for each subscription
- [ ] Link subscriptions to content_sources via `content_source_id`
- [ ] Verify data integrity
- [ ] Run on staging environment

**Deliverables**:
- Data migration script
- Verification queries
- Migration report

### Stage 3: Creator Extraction (Week 2)

**Goal**: Extract creator information from content sources.

- [ ] Create `CreatorExtractionService`
- [ ] Implement YouTube creator extraction (from channel data)
- [ ] Implement Spotify creator extraction (from show publisher)
- [ ] Handle edge cases (missing data, multiple creators)
- [ ] Write tests

**Deliverables**:
- `CreatorExtractionService`
- Platform-specific extractors
- Test coverage

### Stage 4: Creator Reconciliation (Week 2-3)

**Goal**: Match and consolidate duplicate creators.

- [ ] Enhance `CreatorReconciliationService` for two-tier model
- [ ] Implement name normalization
- [ ] Implement fuzzy matching
- [ ] Implement handle matching
- [ ] Implement domain matching
- [ ] Create consolidation logic
- [ ] Write comprehensive tests

**Deliverables**:
- Enhanced `CreatorReconciliationService`
- Matching algorithms
- Consolidation logic
- Test suite

### Stage 5: Integration (Week 3-4)

**Goal**: Update feed polling to use new model.

- [ ] Update `single-user-polling-service.ts` to create ContentSources
- [ ] Update feed item creation to reference content_source_id
- [ ] Update creator assignment to use reconciled creator
- [ ] Test with real YouTube and Spotify data
- [ ] Monitor for errors and edge cases

**Deliverables**:
- Updated polling service
- Integration tests
- Monitoring dashboards

### Stage 6: API Updates (Week 4)

**Goal**: Expose new model through API.

- [ ] Add `/api/content-sources` endpoints
- [ ] Add `/api/creators` endpoints with enhanced data
- [ ] Update feed endpoints to include creator grouping
- [ ] Update bookmark endpoints
- [ ] Add creator discovery endpoints
- [ ] Update API documentation

**Deliverables**:
- New API endpoints
- Updated documentation
- Postman collection

### Stage 7: UI Updates (Week 5-6)

**Goal**: Show creator grouping in user interface.

Mobile:
- [ ] Update feed to show creator grouping option
- [ ] Add creator filter to feed
- [ ] Show "Also available on" badges for cross-platform content
- [ ] Update creator profile view
- [ ] Add creator discovery feature

Web:
- [ ] Update feed to show creator grouping
- [ ] Add creator filter
- [ ] Update UI components

**Deliverables**:
- Updated mobile UI
- Updated web UI
- User testing results

### Stage 8: Cleanup (Week 6-7)

**Goal**: Remove deprecated code and optimize.

- [ ] Remove old creator-only code paths
- [ ] Optimize queries with new indexes
- [ ] Add database constraints
- [ ] Performance testing
- [ ] Documentation updates

**Deliverables**:
- Cleaned codebase
- Performance report
- Updated documentation

---

## API Changes

### New: ContentSource Endpoints

#### Get Content Source

```http
GET /api/content-sources/:id
```

**Response:**
```json
{
  "id": "youtube:UCzQUP1qoWDoEbmsQxvdjxgQ",
  "externalId": "UCzQUP1qoWDoEbmsQxvdjxgQ",
  "platform": "youtube",
  "sourceType": "channel",
  "title": "PowerfulJRE",
  "description": "The official podcast of comedian Joe Rogan",
  "thumbnailUrl": "https://...",
  "url": "https://youtube.com/@PowerfulJRE",
  "creatorId": "creator:joe-rogan",
  "creatorName": "Joe Rogan",
  "subscriberCount": 17500000,
  "isVerified": true,
  "metadata": {
    "customUrl": "@PowerfulJRE",
    "country": "US"
  },
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

#### List User's Content Sources

```http
GET /api/users/:userId/content-sources
```

**Query params:**
- `platform` (optional): Filter by platform
- `sourceType` (optional): Filter by type
- `creatorId` (optional): Filter by creator

**Response:**
```json
{
  "contentSources": [
    {
      "id": "youtube:UCzQUP1qoWDoEbmsQxvdjxgQ",
      "platform": "youtube",
      "sourceType": "channel",
      "title": "PowerfulJRE",
      "creator": {
        "id": "creator:joe-rogan",
        "name": "Joe Rogan"
      }
    },
    {
      "id": "spotify:4rOoJ6Egrf8K2IrywzwOMk",
      "platform": "spotify",
      "sourceType": "show",
      "title": "The Joe Rogan Experience",
      "creator": {
        "id": "creator:joe-rogan",
        "name": "Joe Rogan"
      }
    }
  ]
}
```

### Enhanced: Creator Endpoints

#### Get Creator (with content sources)

```http
GET /api/creators/:id?include=content_sources
```

**Response:**
```json
{
  "id": "creator:joe-rogan",
  "name": "Joe Rogan",
  "handle": "@joerogan",
  "avatarUrl": "https://...",
  "bio": "Comedian, podcast host, UFC commentator",
  "platforms": ["youtube", "spotify"],
  "verified": true,
  "primaryPlatform": "spotify",
  "totalSubscribers": 20000000,
  "alternativeNames": ["PowerfulJRE", "Joe Rogan", "JRE"],
  "platformHandles": {
    "youtube": "@PowerfulJRE",
    "twitter": "@joerogan"
  },
  "contentSources": [
    {
      "id": "youtube:UCzQUP1qoWDoEbmsQxvdjxgQ",
      "platform": "youtube",
      "sourceType": "channel",
      "title": "PowerfulJRE",
      "subscriberCount": 17500000
    },
    {
      "id": "spotify:4rOoJ6Egrf8K2IrywzwOMk",
      "platform": "spotify",
      "sourceType": "show",
      "title": "The Joe Rogan Experience",
      "totalEpisodes": 2000
    }
  ],
  "externalLinks": [
    {
      "title": "Website",
      "url": "https://www.joerogan.com"
    }
  ],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### Updated: Feed Endpoints

#### Get User Feed (with creator grouping)

```http
GET /api/users/:userId/feed?groupBy=creator
```

**Response:**
```json
{
  "items": [
    {
      "creator": {
        "id": "creator:joe-rogan",
        "name": "Joe Rogan",
        "avatarUrl": "https://..."
      },
      "contentSources": [
        {
          "id": "youtube:UCzQUP1qoWDoEbmsQxvdjxgQ",
          "platform": "youtube",
          "sourceType": "channel",
          "title": "PowerfulJRE"
        },
        {
          "id": "spotify:4rOoJ6Egrf8K2IrywzwOMk",
          "platform": "spotify",
          "sourceType": "show",
          "title": "The Joe Rogan Experience"
        }
      ],
      "contentItems": [
        {
          "id": "youtube-video123",
          "title": "JRE #2000 - Elon Musk",
          "contentSourceId": "youtube:UCzQUP1qoWDoEbmsQxvdjxgQ",
          "publishedAt": "2024-01-15T10:00:00Z"
        },
        {
          "id": "spotify-episode456",
          "title": "JRE #2000 - Elon Musk (Full Episode)",
          "contentSourceId": "spotify:4rOoJ6Egrf8K2IrywzwOMk",
          "publishedAt": "2024-01-15T10:00:00Z"
        }
      ]
    }
  ]
}
```

---

## Reconciliation Logic

### Creator Extraction from Content Sources

#### YouTube Channels → Creators

```typescript
async function extractCreatorFromYouTubeChannel(
  channel: YouTubeChannel,
  youtubeApi: YouTubeAPI
): Promise<CreatorCandidate> {
  return {
    name: channel.snippet.title,
    handle: channel.snippet.customUrl || await extractHandleFromChannelId(channel.id, youtubeApi),
    avatarUrl: channel.snippet.thumbnails.high.url,
    bio: channel.snippet.description,
    url: `https://youtube.com/${channel.snippet.customUrl || `channel/${channel.id}`}`,
    platform: 'youtube',
    verified: channel.status?.isLinked || false,
    subscriberCount: channel.statistics.subscriberCount,
    platformHandles: {
      youtube: channel.snippet.customUrl || `@${channel.id}`
    }
  }
}
```

#### Spotify Shows → Creators

```typescript
async function extractCreatorFromSpotifyShow(
  show: SpotifyShow
): Promise<CreatorCandidate> {
  return {
    name: show.publisher,  // "Joe Rogan" or "The Joe Rogan Experience"
    avatarUrl: show.images[0]?.url,
    bio: show.description,
    url: show.external_urls.spotify,
    platform: 'spotify',
    verified: false,  // Spotify doesn't have show-level verification
    // Note: No handle for Spotify shows
    platformHandles: {
      spotify: show.id
    }
  }
}
```

### Creator Matching Algorithm

```typescript
interface CreatorMatchResult {
  matched: boolean
  confidence: number  // 0-1
  matchMethod: 'exact_id' | 'handle' | 'name_high' | 'name_medium' | 'name_low' | 'none'
  matchedCreator?: Creator
}

async function findMatchingCreator(
  candidate: CreatorCandidate,
  db: D1Database
): Promise<CreatorMatchResult> {
  
  // Tier 1: Exact ID match (same creator already exists)
  const exactMatch = await db.prepare(`
    SELECT * FROM creators WHERE id = ?
  `).bind(candidate.id).first();
  
  if (exactMatch) {
    return {
      matched: true,
      confidence: 1.0,
      matchMethod: 'exact_id',
      matchedCreator: exactMatch
    };
  }
  
  // Tier 2: Handle match (cross-platform)
  if (candidate.handle) {
    const handleMatch = await db.prepare(`
      SELECT * FROM creators WHERE handle = ? OR platform_handles LIKE ?
    `).bind(candidate.handle, `%${candidate.handle}%`).first();
    
    if (handleMatch) {
      return {
        matched: true,
        confidence: 0.95,
        matchMethod: 'handle',
        matchedCreator: handleMatch
      };
    }
  }
  
  // Tier 3: Name fuzzy matching
  const normalizedName = normalizeCreatorName(candidate.name);
  
  // Get all creators to check against (limited by platform if available)
  const potentialMatches = await db.prepare(`
    SELECT * FROM creators 
    WHERE platforms LIKE ? OR platforms IS NULL
    LIMIT 100
  `).bind(`%${candidate.platform}%`).all();
  
  let bestMatch: Creator | null = null;
  let bestSimilarity = 0;
  
  for (const creator of potentialMatches.results) {
    // Check primary name
    const similarity = calculateNameSimilarity(normalizedName, normalizeCreatorName(creator.name));
    
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = creator;
    }
    
    // Check alternative names
    if (creator.alternative_names) {
      const altNames = JSON.parse(creator.alternative_names);
      for (const altName of altNames) {
        const altSimilarity = calculateNameSimilarity(normalizedName, normalizeCreatorName(altName));
        if (altSimilarity > bestSimilarity) {
          bestSimilarity = altSimilarity;
          bestMatch = creator;
        }
      }
    }
  }
  
  // Thresholds
  if (bestSimilarity > 0.95) {
    return {
      matched: true,
      confidence: bestSimilarity,
      matchMethod: 'name_high',
      matchedCreator: bestMatch
    };
  } else if (bestSimilarity > 0.85) {
    return {
      matched: true,
      confidence: bestSimilarity,
      matchMethod: 'name_medium',
      matchedCreator: bestMatch
    };
  } else if (bestSimilarity > 0.75) {
    // Low confidence - require manual verification
    return {
      matched: true,
      confidence: bestSimilarity,
      matchMethod: 'name_low',
      matchedCreator: bestMatch
    };
  }
  
  return {
    matched: false,
    confidence: 0,
    matchMethod: 'none'
  };
}
```

### Name Normalization

```typescript
function normalizeCreatorName(name: string): string {
  let normalized = name.toLowerCase().trim();
  
  // Remove common prefixes/suffixes
  normalized = normalized.replace(/^@/, '');
  normalized = normalized.replace(/\s+(official|channel|music|podcast|show)$/i, '');
  normalized = normalized.replace(/^the\s+/i, '');
  
  // Remove special characters
  normalized = normalized.replace(/[^a-z0-9\s]/g, '');
  
  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}
```

### Creator Consolidation

```typescript
async function consolidateCreators(
  existingCreator: Creator,
  newCandidate: CreatorCandidate,
  contentSource: ContentSource
): Promise<Creator> {
  
  // Merge platforms
  const platforms = new Set([
    ...JSON.parse(existingCreator.platforms || '[]'),
    newCandidate.platform
  ]);
  
  // Merge content sources
  const contentSources = new Set([
    ...JSON.parse(existingCreator.content_source_ids || '[]'),
    contentSource.id
  ]);
  
  // Merge alternative names
  const altNames = new Set([
    ...JSON.parse(existingCreator.alternative_names || '[]'),
    newCandidate.name,
    contentSource.title
  ]);
  
  // Merge platform handles
  const platformHandles = {
    ...JSON.parse(existingCreator.platform_handles || '{}'),
    ...newCandidate.platformHandles
  };
  
  // Prefer more complete data
  const updated: Partial<Creator> = {
    name: existingCreator.name, // Keep existing canonical name
    handle: existingCreator.handle || newCandidate.handle,
    avatarUrl: existingCreator.avatarUrl || newCandidate.avatarUrl,
    bio: existingCreator.bio || newCandidate.bio,
    url: existingCreator.url || newCandidate.url,
    verified: existingCreator.verified || newCandidate.verified,
    platforms: JSON.stringify(Array.from(platforms)),
    content_source_ids: JSON.stringify(Array.from(contentSources)),
    alternative_names: JSON.stringify(Array.from(altNames)),
    platform_handles: JSON.stringify(platformHandles),
    total_subscribers: Math.max(
      existingCreator.total_subscribers || 0,
      newCandidate.subscriberCount || 0
    ),
    updatedAt: new Date()
  };
  
  return updated as Creator;
}
```

---

## User Experience

### Feed Grouping by Creator

**Before (current)**:
```
Feed Items:
  - JRE #2000 - Elon Musk (from YouTube channel "PowerfulJRE")
  - JRE #1999 - Neil deGrasse Tyson (from Spotify show "The Joe Rogan Experience")
  - Video Review (from YouTube channel "MKBHD")
```

**After (two-tier model)**:
```
Feed Items (Grouped by Creator):
  
  Joe Rogan
    Sources: YouTube Channel, Spotify Podcast
    - JRE #2000 - Elon Musk (YouTube) • 2h ago
    - JRE #2000 - Elon Musk (Spotify) • 2h ago  [Also on YouTube]
    - JRE #1999 - Neil deGrasse Tyson (Spotify) • 1d ago
  
  Marques Brownlee (MKBHD)
    Sources: YouTube Channel, Spotify Podcast
    - iPhone 16 Review (YouTube) • 5h ago
```

### Creator Discovery

```
"You follow Joe Rogan's YouTube channel"
  
  Did you know?
  • Also available on Spotify (The Joe Rogan Experience)
  • 2,000+ episodes
  
  [Subscribe on Spotify]
```

### Cross-Platform Badges

```
┌─────────────────────────────────────┐
│ JRE #2000 - Elon Musk               │
│                                     │
│ Joe Rogan • 2h ago                  │
│ YouTube • 2:15:30                   │
│                                     │
│ [🎧 Also on Spotify]                │
└─────────────────────────────────────┘
```

---

## Rollout Plan

### Phase 1: Silent Migration (Week 1-2)

- Deploy schema changes
- Run data migration in background
- Monitor for errors
- No user-facing changes yet

**Success Criteria**:
- All subscriptions have content_sources
- All content_sources linked to creators
- No data loss

### Phase 2: Backend Integration (Week 3-4)

- Update feed polling to use content_sources
- Update API endpoints
- Add monitoring and logging
- Still use old UI

**Success Criteria**:
- New content uses new model
- API responds correctly
- No performance degradation

### Phase 3: API Release (Week 4)

- Release new API endpoints
- Update documentation
- Notify API consumers
- Keep old endpoints for backward compatibility

**Success Criteria**:
- New endpoints available
- Documentation complete
- No breaking changes for existing clients

### Phase 4: UI Beta (Week 5-6)

- Release creator grouping as opt-in feature
- A/B test with 10% of users
- Gather feedback
- Monitor engagement metrics

**Success Criteria**:
- Feature accessible to beta users
- Positive user feedback
- No major bugs

### Phase 5: Full Rollout (Week 7)

- Enable creator grouping for all users
- Add cross-platform discovery features
- Promote new features
- Monitor adoption

**Success Criteria**:
- 100% rollout complete
- User adoption growing
- Positive feedback

### Phase 6: Deprecation (Week 8+)

- Deprecate old creator-only endpoints
- Remove backward compatibility code
- Clean up database

**Success Criteria**:
- Old code removed
- Database optimized
- Documentation updated

---

## Future Enhancements

### 1. Creator-Level Subscriptions

Allow users to subscribe to creators across all platforms:

```typescript
interface CreatorSubscription {
  userId: string
  creatorId: string
  platforms: string[]  // Which platforms to include
  autoSubscribe: boolean  // Auto-subscribe to new content sources
}
```

**UX**: "Follow Joe Rogan on all platforms" → automatically subscribes to new shows/channels

### 2. Content Deduplication

Identify when the same content appears on multiple platforms:

```typescript
interface ContentDuplication {
  primaryContentId: string
  duplicateContentIds: string[]
  confidence: number
}
```

**UX**: Show single item with "Available on YouTube, Spotify" instead of duplicates

### 3. Creator Analytics

Show aggregated stats across all content sources:

```typescript
interface CreatorAnalytics {
  creatorId: string
  totalContent: number
  totalViews: number
  avgEngagement: number
  platformBreakdown: {
    [platform: string]: {
      contentCount: number
      subscribers: number
    }
  }
}
```

### 4. Smart Recommendations

"Based on your interest in Joe Rogan, you might like..."
- Use creator relationships
- Cross-platform discovery
- Topic analysis

### 5. Creator Verification

Manual review system for low-confidence matches:

```typescript
interface CreatorMergeRequest {
  id: string
  sourceCreatorId: string
  targetCreatorId: string
  confidence: number
  reason: string
  status: 'pending' | 'approved' | 'rejected'
}
```

**Admin UX**: Review and approve/reject creator consolidations

---

## Testing Strategy

### Unit Tests

- [ ] ContentSource CRUD operations
- [ ] Creator extraction from YouTube channels
- [ ] Creator extraction from Spotify shows
- [ ] Name normalization
- [ ] Fuzzy name matching
- [ ] Creator consolidation logic
- [ ] ContentSourceRepository methods
- [ ] Enhanced CreatorRepository methods

### Integration Tests

- [ ] End-to-end subscription flow with content source creation
- [ ] Feed polling creates content sources and links to creators
- [ ] Creator reconciliation across platforms
- [ ] API endpoints return correct data
- [ ] Database constraints enforced
- [ ] Migration scripts run successfully

### Manual Testing Scenarios

1. **YouTube Channel + Spotify Show (Same Creator)**
   - Subscribe to @PowerfulJRE on YouTube
   - Subscribe to "The Joe Rogan Experience" on Spotify
   - Verify single creator created with both sources
   - Verify feed shows content grouped by creator

2. **Creator with Multiple Shows**
   - Subscribe to "The Daily" (NYT) on Spotify
   - Subscribe to "The Ezra Klein Show" (NYT) on Spotify
   - Subscribe to NYT YouTube channel
   - Verify all linked to "The New York Times" creator

3. **Name Variations**
   - Subscribe to channel with different naming: "MKBHD", "Marques Brownlee"
   - Verify fuzzy matching consolidates

4. **Low Confidence Match**
   - Subscribe to channels with similar but not identical names
   - Verify low-confidence matches flagged for review

### Performance Tests

- [ ] Query performance with 1000+ subscriptions
- [ ] Creator reconciliation under 200ms
- [ ] Feed loading with creator grouping
- [ ] Database index effectiveness

---

## Risk Analysis

### High Risk

**Risk**: Data loss during migration
**Mitigation**: 
- Backup database before migration
- Run migration on staging first
- Implement rollback scripts
- Validate data at each step

**Risk**: Incorrect creator matching
**Mitigation**:
- Conservative matching thresholds
- Manual review for low-confidence matches
- User feedback mechanism
- Ability to split incorrectly merged creators

### Medium Risk

**Risk**: Performance degradation
**Mitigation**:
- Proper indexing
- Query optimization
- Caching strategy
- Load testing

**Risk**: API breaking changes
**Mitigation**:
- Versioned endpoints
- Backward compatibility period
- Clear deprecation timeline
- Migration guide for API consumers

### Low Risk

**Risk**: User confusion with new grouping
**Mitigation**:
- Clear UI design
- Optional feature initially
- User education
- Feedback collection

---

## Success Metrics

### Technical Metrics

- [ ] 95%+ of subscriptions have linked content sources
- [ ] 90%+ of content sources linked to creators
- [ ] Creator reconciliation accuracy > 95%
- [ ] API response time < 200ms
- [ ] Zero data loss during migration

### Business Metrics

- [ ] User engagement with grouped feed increases by 15%
- [ ] Cross-platform discovery leads to 10% more subscriptions
- [ ] User satisfaction score improves
- [ ] Support tickets related to duplicate creators decrease

### User Experience Metrics

- [ ] 80%+ users understand creator grouping
- [ ] 70%+ users find cross-platform discovery valuable
- [ ] Time to find content decreases
- [ ] User retention improves

---

## Open Questions

1. **Creator ID Format**: Use UUID or first-seen platform ID?
   - **Recommendation**: First-seen for backward compatibility, but prefix with `creator:` for clarity

2. **Multiple Creators per Content**: How to handle collaborations?
   - **Recommendation**: Phase 2 - add `content_creators` junction table

3. **Creator Merge/Split UI**: Should users be able to manually merge/split creators?
   - **Recommendation**: Admin-only initially, user requests via support

4. **Retroactive Matching**: Re-run matching on existing creators periodically?
   - **Recommendation**: Yes, weekly batch job with manual review queue

5. **Platform Priority**: Which platform's data takes precedence when conflicting?
   - **Recommendation**: Primary platform (most subscribers), or first-seen

---

## Appendix

### Example Subscriptions

#### Joe Rogan

```json
// Content Source 1: YouTube Channel
{
  "id": "youtube:UCzQUP1qoWDoEbmsQxvdjxgQ",
  "platform": "youtube",
  "sourceType": "channel",
  "title": "PowerfulJRE",
  "creatorId": "creator:joe-rogan",
  "subscriberCount": 17500000
}

// Content Source 2: Spotify Show
{
  "id": "spotify:4rOoJ6Egrf8K2IrywzwOMk",
  "platform": "spotify",
  "sourceType": "show",
  "title": "The Joe Rogan Experience",
  "creatorId": "creator:joe-rogan",
  "totalEpisodes": 2000
}

// Creator (consolidated)
{
  "id": "creator:joe-rogan",
  "name": "Joe Rogan",
  "handle": "@joerogan",
  "platforms": ["youtube", "spotify"],
  "contentSources": [
    "youtube:UCzQUP1qoWDoEbmsQxvdjxgQ",
    "spotify:4rOoJ6Egrf8K2IrywzwOMk"
  ],
  "alternativeNames": ["PowerfulJRE", "The Joe Rogan Experience", "JRE"],
  "totalSubscribers": 20000000
}
```

#### The New York Times

```json
// Content Source 1: YouTube Channel
{
  "id": "youtube:UCqnbDFdCpuN8CMEg0VuEBqA",
  "platform": "youtube",
  "sourceType": "channel",
  "title": "The New York Times",
  "creatorId": "creator:nyt"
}

// Content Source 2: Spotify Show "The Daily"
{
  "id": "spotify:1234567890",
  "platform": "spotify",
  "sourceType": "show",
  "title": "The Daily",
  "creatorId": "creator:nyt"
}

// Content Source 3: Spotify Show "Hard Fork"
{
  "id": "spotify:9876543210",
  "platform": "spotify",
  "sourceType": "show",
  "title": "Hard Fork",
  "creatorId": "creator:nyt"
}

// Creator (consolidated)
{
  "id": "creator:nyt",
  "name": "The New York Times",
  "platforms": ["youtube", "spotify"],
  "contentSources": [
    "youtube:UCqnbDFdCpuN8CMEg0VuEBqA",
    "spotify:1234567890",
    "spotify:9876543210"
  ],
  "alternativeNames": ["NYT", "The Daily", "Hard Fork"]
}
```

---

## Conclusion

The two-tier creator model addresses fundamental architectural limitations in the current single-tier approach. By separating content sources (platform-specific containers) from creators (people/brands), we enable:

1. **Accurate Representation**: YouTube channels ≠ Spotify shows ≠ Creators
2. **Cross-Platform Discovery**: Users discover the same creator on multiple platforms
3. **Better Reconciliation**: Match creators, not content sources
4. **Scalability**: Support new platforms and content types
5. **User Value**: "Follow creators, not just channels"

This is a significant architectural change, but the benefits justify the complexity. The phased implementation plan ensures we can migrate safely without disrupting existing functionality.

**Next Steps**: Review this design, gather feedback, and proceed with Stage 1 implementation.
