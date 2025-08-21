# Feed Database Enhancement Plan

## Overview

This document outlines a comprehensive plan to expand the data we capture from Spotify and YouTube APIs, creating a richer and more unified content metadata schema that better serves user needs while maintaining platform-specific nuances.

## Current State

### Currently Captured Data
- **Basic metadata**: id, title, description, thumbnailUrl
- **Temporal data**: publishedAt, createdAt
- **Media info**: durationSeconds, externalUrl
- **Subscription info**: subscriptionId, provider

### Limitations
- No engagement metrics (views, likes, comments)
- Limited creator/channel information
- No content classification (categories, tags, language)
- Missing series/episode context for podcasts
- No technical metadata (HD availability, captions)
- No cross-platform content matching (same content on multiple platforms)

## Proposed Unified Content Schema

### 1. Core Content Fields (Existing)
```typescript
interface CoreContent {
  id: string
  externalId: string
  title: string
  description: string
  thumbnailUrl: string
  publishedAt: Date
  durationSeconds: number
  externalUrl: string
  createdAt: Date
}
```

### 2. Content Statistics & Engagement (New)
```typescript
interface ContentStatistics {
  // YouTube specific
  viewCount?: number
  likeCount?: number
  commentCount?: number
  
  // Spotify specific (when available)
  playCount?: number
  savedCount?: number
  
  // Common metrics
  popularity?: number // 0-100 score
  engagementRate?: number // calculated: (likes + comments) / views
}
```

### 3. Creator/Channel Information (New)
```typescript
interface CreatorMetadata {
  creatorId: string
  creatorName: string
  creatorThumbnail?: string
  creatorVerified?: boolean
  creatorSubscriberCount?: number // YouTube
  creatorFollowerCount?: number // Spotify
}
```

### 4. Content Classification (New)
```typescript
interface ContentClassification {
  category?: string // video category or podcast genre
  tags?: string[] // keywords/topics
  language?: string // ISO 639-1 code
  isExplicit?: boolean // explicit content flag
  ageRestriction?: string // rating/age guidance
  contentType: 'video' | 'podcast' | 'short' | 'live' | 'music'
}
```

### 5. Media Quality & Technical Details (New)
```typescript
interface MediaDetails {
  hasHD?: boolean // HD availability
  hasCaptions?: boolean // closed captions
  hasTranscript?: boolean // transcript availability
  audioLanguages?: string[] // available audio tracks
  videoQuality?: string // max resolution (e.g., "1080p", "4K")
  audioQuality?: string // audio bitrate/quality
}
```

### 6. Series/Show Context (New)
```typescript
interface SeriesContext {
  seriesId?: string // show/playlist ID
  seriesName?: string
  episodeNumber?: number
  seasonNumber?: number
  totalEpisodesInSeries?: number
  isLatestEpisode?: boolean
}
```

### 7. Cross-Platform Content Matching (New)
```typescript
interface CrossPlatformMetadata {
  // Unique content fingerprint based on normalized metadata
  contentFingerprint?: string
  
  // Publisher/creator identity matching
  publisherCanonicalId?: string // Internal unified publisher ID
  publisherAliases?: {
    platform: string
    id: string
    name: string
    confidence: number // 0-1 confidence score
  }[]
  
  // Related content on other platforms
  crossPlatformMatches?: {
    platform: string
    contentId: string
    matchConfidence: number // 0-1 probability score
    matchReason: string[] // ['title_match', 'duration_match', 'publisher_match', etc.]
  }[]
  
  // Content matching metadata
  normalizedTitle?: string // Title stripped of platform-specific formatting
  episodeIdentifier?: string // Standardized episode ID (e.g., "S01E05" or episode number)
  publishDate?: Date // Normalized publish date for matching
  durationVariance?: number // Seconds of acceptable duration difference
}
```

## Database Schema Updates

### Feed Items Table Extensions
```sql
-- Add engagement metrics
ALTER TABLE feed_items ADD COLUMN view_count INTEGER;
ALTER TABLE feed_items ADD COLUMN like_count INTEGER;
ALTER TABLE feed_items ADD COLUMN comment_count INTEGER;
ALTER TABLE feed_items ADD COLUMN popularity_score INTEGER; -- 0-100 normalized

-- Add classification fields
ALTER TABLE feed_items ADD COLUMN language TEXT;
ALTER TABLE feed_items ADD COLUMN is_explicit BOOLEAN DEFAULT FALSE;
ALTER TABLE feed_items ADD COLUMN content_type TEXT; -- 'video', 'podcast', 'short', 'live'
ALTER TABLE feed_items ADD COLUMN category TEXT;
ALTER TABLE feed_items ADD COLUMN tags TEXT; -- JSON array

-- Add technical metadata
ALTER TABLE feed_items ADD COLUMN has_captions BOOLEAN;
ALTER TABLE feed_items ADD COLUMN has_hd BOOLEAN;
ALTER TABLE feed_items ADD COLUMN video_quality TEXT;

-- Add series/episode context
ALTER TABLE feed_items ADD COLUMN series_metadata TEXT; -- JSON object
ALTER TABLE feed_items ADD COLUMN episode_number INTEGER;
ALTER TABLE feed_items ADD COLUMN season_number INTEGER;

-- Add aggregated metadata objects for flexibility
ALTER TABLE feed_items ADD COLUMN statistics_metadata TEXT; -- JSON object
ALTER TABLE feed_items ADD COLUMN technical_metadata TEXT; -- JSON object

-- Add cross-platform matching fields
ALTER TABLE feed_items ADD COLUMN content_fingerprint TEXT; -- Unique content identifier
ALTER TABLE feed_items ADD COLUMN publisher_canonical_id TEXT; -- Unified publisher ID
ALTER TABLE feed_items ADD COLUMN cross_platform_metadata TEXT; -- JSON object for matches
ALTER TABLE feed_items ADD COLUMN normalized_title TEXT; -- For fuzzy matching
ALTER TABLE feed_items ADD COLUMN episode_identifier TEXT; -- Standardized episode ID
```

### Publishers Table (New)
```sql
-- Create unified publishers table for cross-platform identity management
CREATE TABLE publishers (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL, -- Primary/official name
  alternative_names TEXT, -- JSON array of known aliases
  verified BOOLEAN DEFAULT FALSE,
  primary_platform TEXT, -- Main platform (youtube/spotify)
  platform_identities TEXT NOT NULL, -- JSON object: {youtube: {id, name}, spotify: {id, name}}
  metadata TEXT, -- JSON object for additional data
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create cross-platform content matches table
CREATE TABLE content_matches (
  id TEXT PRIMARY KEY,
  content_fingerprint TEXT NOT NULL,
  platform_a TEXT NOT NULL,
  content_id_a TEXT NOT NULL,
  platform_b TEXT NOT NULL,
  content_id_b TEXT NOT NULL,
  match_confidence REAL NOT NULL, -- 0.0 to 1.0
  match_reasons TEXT NOT NULL, -- JSON array of match factors
  verified BOOLEAN DEFAULT FALSE, -- Human-verified match
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(content_id_a, content_id_b)
);

-- Add indexes for efficient matching
CREATE INDEX idx_feed_items_fingerprint ON feed_items(content_fingerprint);
CREATE INDEX idx_feed_items_publisher_canonical ON feed_items(publisher_canonical_id);
CREATE INDEX idx_feed_items_normalized_title ON feed_items(normalized_title);
CREATE INDEX idx_content_matches_fingerprint ON content_matches(content_fingerprint);
```

### Subscriptions Table Extensions
```sql
-- Add richer channel/show data
ALTER TABLE subscriptions ADD COLUMN subscriber_count INTEGER;
ALTER TABLE subscriptions ADD COLUMN is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE subscriptions ADD COLUMN content_categories TEXT; -- JSON array
ALTER TABLE subscriptions ADD COLUMN primary_language TEXT;
ALTER TABLE subscriptions ADD COLUMN average_duration INTEGER; -- seconds
ALTER TABLE subscriptions ADD COLUMN upload_frequency TEXT; -- 'daily', 'weekly', 'monthly'
ALTER TABLE subscriptions ADD COLUMN last_content_date TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN total_content_count INTEGER;
ALTER TABLE subscriptions ADD COLUMN channel_metadata TEXT; -- JSON for platform-specific data
```

## Platform-Specific Data Mapping

### YouTube → Unified Schema
```typescript
function mapYouTubeVideo(video: YouTubeVideoDetails, channel?: YouTubeChannel): UnifiedContent {
  return {
    // Core fields
    id: video.id,
    title: video.snippet.title,
    description: video.snippet.description,
    thumbnailUrl: video.snippet.thumbnails?.high?.url,
    publishedAt: new Date(video.snippet.publishedAt),
    durationSeconds: YouTubeAPI.parseDuration(video.contentDetails.duration),
    
    // Statistics
    viewCount: parseInt(video.statistics?.viewCount || '0'),
    likeCount: parseInt(video.statistics?.likeCount || '0'),
    commentCount: parseInt(video.statistics?.commentCount || '0'),
    
    // Classification
    category: video.snippet.categoryId,
    tags: video.snippet.tags || [],
    language: video.snippet.defaultLanguage || video.snippet.defaultAudioLanguage,
    contentType: determineYouTubeContentType(video),
    
    // Technical details
    hasHD: video.contentDetails.definition === 'hd',
    hasCaptions: video.contentDetails.caption === 'true',
    videoQuality: video.contentDetails.definition,
    
    // Creator info
    creatorId: video.snippet.channelId,
    creatorName: video.snippet.channelTitle,
    creatorVerified: channel?.status?.isLinked,
    creatorSubscriberCount: parseInt(channel?.statistics?.subscriberCount || '0')
  }
}

function determineYouTubeContentType(video: YouTubeVideoDetails): ContentType {
  const duration = YouTubeAPI.parseDuration(video.contentDetails.duration)
  
  if (video.snippet.liveBroadcastContent === 'live') return 'live'
  if (duration && duration <= 60) return 'short'
  return 'video'
}
```

### Spotify → Unified Schema
```typescript
function mapSpotifyEpisode(episode: SpotifyEpisode, show: SpotifyShow): UnifiedContent {
  return {
    // Core fields
    id: episode.id,
    title: episode.name,
    description: episode.description,
    thumbnailUrl: episode.images?.[0]?.url || show.images?.[0]?.url,
    publishedAt: new Date(episode.release_date),
    durationSeconds: Math.round(episode.duration_ms / 1000),
    
    // Series context
    seriesId: show.id,
    seriesName: show.name,
    episodeNumber: episode.episode_number,
    totalEpisodesInSeries: show.total_episodes,
    
    // Classification
    language: episode.language || show.languages?.[0],
    isExplicit: episode.explicit || show.explicit,
    contentType: 'podcast',
    category: show.category || 'podcast',
    
    // Creator info
    creatorId: show.id,
    creatorName: show.publisher,
    creatorThumbnail: show.images?.[0]?.url,
    
    // Technical details
    hasTranscript: episode.is_externally_hosted === false, // Spotify-hosted often have transcripts
    audioQuality: 'high' // Spotify generally provides high-quality audio
  }
}
```

## Implementation Phases

### Phase 1: High Impact, Low Effort (Week 1-2) ✅ COMPLETED
**Goal**: Capture the most valuable metrics with minimal API changes

1. **Add engagement metrics** ✅
   - YouTube: viewCount, likeCount, commentCount
   - Calculate popularity scores
   
2. **Add basic classification** ✅
   - Content type (video/podcast/short/live)
   - Language detection
   - Explicit content flags

3. **Database migrations** ✅
   - Add new columns to feed_items
   - Create indexes for common queries

**API Quota Impact**: Minimal - data already available in current API responses

**Implementation Details**:
- Updated YouTube API to fetch statistics data (viewCount, likeCount, commentCount)
- Added content type detection based on duration and live status
- Implemented popularity score calculation (logarithmic scaling)
- Updated Spotify API to include language and explicit content flags
- Modified batch processors to capture and store new metrics
- Created database migration 0008_phase1_feed_enhancements.sql
- Updated FeedItem interface in shared package to include new fields

### Phase 2: Creator & Series Context (Week 3-4) ✅ COMPLETED
**Goal**: Enhance creator information and series navigation

1. **Enrich creator data** ✅
   - Subscriber/follower counts
   - Verification status
   - Creator thumbnails

2. **Add series/episode metadata** ✅
   - Episode numbers for podcasts
   - Series relationships
   - Total episode counts

3. **Update subscription discovery** ✅
   - Store richer channel/show data
   - Track upload frequency

**API Quota Impact**: Moderate - requires additional channel detail calls for YouTube

**Implementation Details**:
- Added creator fields: creatorId, creatorName, creatorThumbnail, creatorVerified, creatorSubscriberCount
- Added series fields: seriesId, seriesName, episodeNumber, totalEpisodesInSeries, isLatestEpisode
- Extended YouTube API to include channel statistics in batch processor
- Updated Spotify processor to include show/publisher metadata
- Enhanced subscriptions table with subscriber counts, verification, and content statistics
- Created database migration 0009_phase2_creator_series_context.sql
- Updated FeedItem interface with Phase 2 fields

### Phase 3: Advanced Metadata (Week 5-6)
**Goal**: Add technical details and advanced features

1. **Technical metadata**
   - HD/4K availability
   - Caption availability
   - Audio language options

2. **Content categorization**
   - Tags extraction
   - Category mapping
   - Topic analysis

3. **Calculated metrics**
   - Engagement rates
   - Upload frequency analysis
   - Trending detection

**API Quota Impact**: Higher - may require additional API calls for detailed metadata

### Phase 4: Cross-Platform Content Matching (Week 7-8)
**Goal**: Identify and link content across platforms

1. **Publisher unification**
   - Build publisher canonical ID system
   - Map known publishers across platforms
   - Create publisher alias detection

2. **Content fingerprinting**
   - Implement fingerprint generation
   - Backfill fingerprints for existing content
   - Create matching indexes

3. **Matching algorithm deployment**
   - Deploy real-time matching for new content
   - Run batch matching for historical data
   - Build confidence scoring system

4. **UI enhancements**
   - Show "Also available on" indicators
   - Display unified publisher profiles
   - Provide cross-platform analytics

**API Quota Impact**: None - uses existing data for matching

## API Quota Considerations

### YouTube API Quotas
- **Current usage**: ~3 units per video (playlistItems.list)
- **With enhancements**: ~4 units per video (adding statistics)
- **Channel details**: +1 unit per channel (channels.list)
- **Daily quota**: 10,000 units default
- **Optimization**: Batch channel requests, cache channel data

### Spotify API
- **Rate limits**: No hard quotas, but rate limiting applies
- **Current usage**: 1 request per show for episodes
- **With enhancements**: No additional requests needed (data in existing responses)
- **Optimization**: Use batch endpoints where available

## Cross-Platform Content Matching System

### Content Fingerprinting Algorithm
```typescript
function generateContentFingerprint(content: UnifiedContent): string {
  // Normalize and hash key content attributes
  const components = [
    normalizeTitle(content.title),
    content.episodeNumber || '',
    content.seasonNumber || '',
    Math.floor(content.durationSeconds / 10), // 10-second buckets for duration tolerance
    formatDate(content.publishedAt, 'YYYY-MM-DD'), // Day-level precision
  ].filter(Boolean).join('|')
  
  return crypto.createHash('sha256').update(components).digest('hex')
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/ep(isode)?\s*\d+/gi, '') // Remove episode markers
    .replace(/s\d+e\d+/gi, '') // Remove season/episode notation
    .trim()
}
```

### Publisher Matching Strategy
```typescript
interface PublisherMatcher {
  // Match publishers across platforms using multiple signals
  async matchPublisher(platform: string, publisherId: string, publisherName: string): Promise<PublisherMatch> {
    const signals = []
    
    // 1. Exact name match (case-insensitive)
    const exactMatch = await findPublisherByName(publisherName)
    if (exactMatch) signals.push({ type: 'exact_name', confidence: 0.95 })
    
    // 2. Fuzzy name matching (Levenshtein distance)
    const fuzzyMatches = await findPublishersByFuzzyName(publisherName, 0.85)
    if (fuzzyMatches.length) signals.push({ type: 'fuzzy_name', confidence: 0.80 })
    
    // 3. Common words/phrases in content titles
    const titlePatterns = await analyzeContentTitlePatterns(publisherId, platform)
    const patternMatch = await findPublisherByTitlePatterns(titlePatterns)
    if (patternMatch) signals.push({ type: 'title_pattern', confidence: 0.70 })
    
    // 4. Known publisher mappings (manual/verified)
    const knownMapping = await getKnownPublisherMapping(platform, publisherId)
    if (knownMapping) signals.push({ type: 'verified_mapping', confidence: 1.0 })
    
    // Calculate weighted confidence score
    const confidence = calculateConfidence(signals)
    
    return {
      canonicalId: exactMatch?.id || fuzzyMatches[0]?.id || generateNewPublisherId(),
      confidence,
      signals
    }
  }
}
```

### Content Matching Algorithm
```typescript
interface ContentMatcher {
  async findCrossPlatformMatches(content: UnifiedContent): Promise<CrossPlatformMatch[]> {
    const matches: CrossPlatformMatch[] = []
    
    // Stage 1: Fingerprint matching (exact content match)
    const fingerprintMatches = await findByFingerprint(content.contentFingerprint)
    
    // Stage 2: Publisher + episode matching (for series content)
    if (content.publisherCanonicalId && content.episodeIdentifier) {
      const episodeMatches = await findByPublisherAndEpisode(
        content.publisherCanonicalId,
        content.episodeIdentifier
      )
      matches.push(...episodeMatches)
    }
    
    // Stage 3: Fuzzy matching with scoring
    const candidates = await findCandidates({
      normalizedTitle: content.normalizedTitle,
      publisherCanonicalId: content.publisherCanonicalId,
      durationRange: [
        content.durationSeconds - 30,
        content.durationSeconds + 30
      ],
      publishDateRange: [
        subDays(content.publishedAt, 3),
        addDays(content.publishedAt, 3)
      ]
    })
    
    // Score each candidate
    for (const candidate of candidates) {
      const score = calculateMatchScore(content, candidate)
      if (score.confidence > 0.75) {
        matches.push({
          platform: candidate.provider,
          contentId: candidate.id,
          matchConfidence: score.confidence,
          matchReasons: score.reasons
        })
      }
    }
    
    return matches
  }
  
  calculateMatchScore(content: UnifiedContent, candidate: FeedItem): MatchScore {
    const scores: Array<{factor: string, weight: number, score: number}> = []
    
    // Title similarity (40% weight)
    const titleSimilarity = calculateStringSimilarity(
      content.normalizedTitle,
      candidate.normalizedTitle
    )
    scores.push({
      factor: 'title_match',
      weight: 0.40,
      score: titleSimilarity
    })
    
    // Publisher match (30% weight)
    if (content.publisherCanonicalId === candidate.publisherCanonicalId) {
      scores.push({
        factor: 'publisher_match',
        weight: 0.30,
        score: 1.0
      })
    }
    
    // Duration similarity (15% weight)
    const durationDiff = Math.abs(content.durationSeconds - candidate.durationSeconds)
    const durationScore = Math.max(0, 1 - (durationDiff / content.durationSeconds))
    scores.push({
      factor: 'duration_match',
      weight: 0.15,
      score: durationScore
    })
    
    // Publish date proximity (10% weight)
    const daysDiff = Math.abs(differenceInDays(content.publishedAt, candidate.publishedAt))
    const dateScore = Math.max(0, 1 - (daysDiff / 7)) // Within a week
    scores.push({
      factor: 'date_match',
      weight: 0.10,
      score: dateScore
    })
    
    // Episode number match (5% weight, if applicable)
    if (content.episodeNumber && candidate.episodeNumber) {
      const episodeMatch = content.episodeNumber === candidate.episodeNumber ? 1 : 0
      scores.push({
        factor: 'episode_match',
        weight: 0.05,
        score: episodeMatch
      })
    }
    
    // Calculate weighted average
    const totalScore = scores.reduce((sum, s) => sum + (s.score * s.weight), 0)
    const matchReasons = scores.filter(s => s.score > 0.5).map(s => s.factor)
    
    return {
      confidence: totalScore,
      reasons: matchReasons
    }
  }
}
```

### Known Publisher Mappings
```typescript
// Maintain a curated list of verified publisher mappings
const KNOWN_PUBLISHER_MAPPINGS = {
  'Joe Rogan Experience': {
    youtube: { id: 'UCzQUP1qoWDoEbmsQxvdjxgQ', name: 'PowerfulJRE' },
    spotify: { id: '4rOoJ6Egrf8K2IrywzwOMk', name: 'The Joe Rogan Experience' }
  },
  'Lex Fridman Podcast': {
    youtube: { id: 'UCSHZKyawb77ixDdsGog4iWA', name: 'Lex Fridman' },
    spotify: { id: '2MAi0BvDc6GTFvKFPXnkCL', name: 'Lex Fridman Podcast' }
  },
  // Add more known mappings as discovered
}
```

## Migration Strategy

### For Existing Data
1. **Backfill high-priority fields**
   - Run batch job to fetch view counts for recent videos
   - Update content types based on duration
   - Set default values for new boolean fields

2. **Gradual enrichment**
   - Enrich data as items are accessed
   - Prioritize recent and popular content
   - Use background jobs during low-usage periods

3. **Data consistency**
   - Add validation for new required fields
   - Handle missing data gracefully in UI
   - Provide fallbacks for legacy content

4. **Cross-platform matching backfill**
   - Generate content fingerprints for existing items
   - Build publisher canonical ID mappings
   - Run matching algorithm on recent content first
   - Gradually expand to historical content

## Use Cases for Cross-Platform Matching

### User Benefits
1. **Deduplicated Discovery**
   - Avoid showing same content multiple times
   - Indicate "You follow this on Spotify too" 
   - Merge engagement stats across platforms

2. **Platform Preference**
   - Let users choose preferred platform for content
   - Auto-redirect to preferred platform
   - Show platform availability indicators

3. **Unified Publisher View**
   - Single publisher profile across platforms
   - Combined content library
   - Aggregated statistics and metrics

4. **Smart Recommendations**
   - "Since you like Joe Rogan on Spotify, watch his YouTube exclusives"
   - Cross-platform content gaps ("New on YouTube, not yet on Spotify")
   - Better understanding of user preferences

### Analytics & Insights
1. **Publisher Analytics**
   - Total reach across platforms
   - Platform performance comparison
   - Content strategy insights

2. **Content Performance**
   - Cross-platform engagement comparison
   - Platform-specific audience behavior
   - Optimal release timing analysis

3. **User Behavior**
   - Platform preference patterns
   - Cross-platform consumption habits
   - Content discovery paths
