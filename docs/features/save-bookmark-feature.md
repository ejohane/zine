# Save Bookmark – Feature Requirements

## Overview

This feature allows users to save (bookmark) any URL into their personal library. The app should extract normalized metadata, identify the content type and source, associate the content with a creator, and prevent duplicate bookmarks. Bookmarks can later be organized, searched, and grouped — including by creator.

---

## Core User Flows

### Saving a Bookmark

1. **User Input**
   - Users can paste a URL into the app to initiate a save.

2. **Preprocessing Step**
   - The app previews the content using extracted metadata, including title, image, content type, source, and creator.
   - If metadata is unavailable or incomplete, the user is still allowed to save the URL.

3. **Duplicate Detection**
   - The app checks for existing bookmarks with a normalized version of the URL.
   - If a match is found, the existing bookmark is shown instead of creating a new one.

4. **User Confirmation**
   - If the bookmark is new, the user can confirm saving it into their library.

---

## Normalized Metadata Fields

### Core Metadata Fields

These fields should be collected and stored for every bookmark, where available.

| Field         | Type     | Description                                                     |
| ------------- | -------- | --------------------------------------------------------------- |
| url           | string   | Canonical URL (normalized, deduplicated)                        |
| title         | string   | Title or headline of the content                                |
| source        | enum     | Platform or publisher (e.g. spotify, youtube, substack, x, web) |
| content_type  | enum     | Content category (e.g. article, podcast, video, post, link)     |
| thumbnail_url | string   | Primary image or thumbnail                                      |
| favicon_url   | string   | Site or platform favicon                                        |
| created_at    | ISO date | Timestamp when the bookmark was created in the app              |
| published_at  | ISO date | Date the content was originally published (if available)        |
| description   | string   | Short summary or excerpt of the content                         |

---

## Creator Metadata

Each bookmark can optionally reference a structured `creator` object that provides normalized metadata about the individual or brand behind the content.

### Creator Object Fields

| Field          | Type     | Description                                             |
| -------------- | -------- | ------------------------------------------------------- |
| id             | string   | Platform-specific unique ID (e.g. youtube:UCabc123)     |
| name           | string   | Full display name                                       |
| handle         | string   | Platform-specific handle (e.g. @username)               |
| avatar_url     | string   | Profile image or logo                                   |
| bio            | string   | Short description or bio                                |
| url            | string   | Canonical creator URL or profile                        |
| platforms      | string[] | List of platforms (e.g. ["youtube", "substack"])        |
| external_links | object[] | Additional personal links with `title` and `url` fields |

### Requirement: Creator-Based Filtering

- Users must be able to view the creator’s profile and see all bookmarks associated with that creator.
- Bookmarks should be filterable by `creator.id`, or by `creator.name + source` as a fallback.
- `creator.id` should be stable and consistent across bookmarks (e.g. YouTube channel ID, newsletter domain).

---

## Extended Metadata (Optional / Type-Specific)

These fields are collected only when applicable to the content type or source.

### All Content Types

| Field    | Type     | Description                   |
| -------- | -------- | ----------------------------- |
| language | string   | Language code (e.g. en, es)   |
| tags     | string[] | User-defined or inferred tags |

### For Video Content (e.g. YouTube)

| Field      | Type   | Description       |
| ---------- | ------ | ----------------- |
| duration   | number | Length in seconds |
| view_count | number | Number of views   |

### For Podcast Content (e.g. Spotify)

| Field          | Type   | Description                   |
| -------------- | ------ | ----------------------------- |
| episode_title  | string | Title of the specific episode |
| episode_number | number | Episode number                |
| series_name    | string | Name of the podcast series    |
| duration       | number | Episode length in seconds     |

### For Article Content (e.g. Substack, blogs)

| Field        | Type   | Description                       |
| ------------ | ------ | --------------------------------- |
| author_name  | string | Legacy fallback if no creator     |
| word_count   | number | Estimated or actual word count    |
| reading_time | number | Estimated reading time in minutes |

### For Post Content (e.g. X, Threads)

| Field        | Type   | Description              |
| ------------ | ------ | ------------------------ |
| post_text    | string | Main text of the post    |
| like_count   | number | Number of likes          |
| repost_count | number | Number of reposts/shares |

---

## Additional Functional Requirements

### URL Normalization

- URLs must be normalized before checking for duplicates or saving.
- Normalization includes removing UTM parameters, enforcing HTTPS, and trimming whitespace.

### Content Validation and Errors

- If content is unreachable or metadata cannot be extracted, display an error.
- If partial metadata is available, allow the user to save the bookmark anyway.

### Bookmark Status

- Bookmarks should have a status:
  - active (default)
  - archived
  - deleted

### Visibility and Scope

- Bookmarks are private to the user by default.
- Bookmarks must be scoped per user.

### Reprocessing Metadata

- Users may choose to refresh bookmark metadata later to get updated or missing data.

### Minimal Bookmark Save

- Users should be able to save a raw URL with little or no metadata if needed.

### Notes (Optional)

- Users may attach a personal note or annotation to a bookmark, either during save or later.

---

## Implementation Plan

### Technical Architecture

#### Server-Side Metadata Extraction
- **Platform**: Cloudflare Workers
- **Technology Stack**:
  - `@cloudflare/workers-types` - Built-in `fetch()` API
  - `linkedom` - Lightweight DOM implementation for Workers
  - `metascraper` - Comprehensive metadata extraction with plugins
- **Approach**: All metadata extraction happens server-side in the API layer

#### Platform-Specific Handling
- **YouTube**: API calls for video metadata and creator information
- **Spotify**: Web API for podcast/music metadata
- **Twitter/X**: oEmbed API for tweet data
- **Substack**: RSS/JSON feeds for newsletter metadata
- **Generic Web**: Open Graph, Twitter Cards, JSON-LD structured data

### Database Schema Design

#### Creators Table
```sql
CREATE TABLE creators (
  id TEXT PRIMARY KEY,              -- Platform-specific ID (e.g. youtube:UCabc123)
  name TEXT NOT NULL,               -- Display name
  handle TEXT,                      -- Platform handle (e.g. @username)
  avatar_url TEXT,                  -- Profile image
  bio TEXT,                         -- Description
  url TEXT,                         -- Canonical profile URL
  platforms TEXT,                   -- JSON array of platforms
  external_links TEXT,              -- JSON array of {title, url} objects
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

#### Extended Bookmarks Table
```sql
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT '1',    -- Hardcoded for now
  url TEXT NOT NULL,                     -- Normalized canonical URL
  original_url TEXT NOT NULL,            -- Original URL as submitted
  title TEXT NOT NULL,
  description TEXT,
  source TEXT,                           -- Platform enum (youtube, spotify, etc.)
  content_type TEXT,                     -- Content type enum (video, article, etc.)
  thumbnail_url TEXT,
  favicon_url TEXT,
  published_at INTEGER,                  -- Original publish date
  language TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active, archived, deleted
  creator_id TEXT,                       -- FK to creators table
  
  -- Extended metadata (JSON fields)
  video_metadata TEXT,                   -- {duration, view_count}
  podcast_metadata TEXT,                 -- {episode_title, episode_number, series_name, duration}
  article_metadata TEXT,                 -- {author_name, word_count, reading_time}
  post_metadata TEXT,                    -- {post_text, like_count, repost_count}
  
  -- Standard fields
  tags TEXT,                             -- JSON array
  notes TEXT,                            -- User notes
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  
  FOREIGN KEY (creator_id) REFERENCES creators(id)
);
```

### Implementation Components

#### 1. Shared Package (packages/shared/src/)

**New Files:**
- `url-normalizer.ts` - URL normalization and duplicate detection logic
- `metadata-extractor.ts` - Server-side metadata extraction orchestration
- `creator-resolver.ts` - Creator identification and normalization
- `bookmark-save-service.ts` - Complete bookmark saving workflow

**Updated Files:**
- `types.ts` - Add comprehensive Bookmark and Creator types with Zod schemas
- `api-service.ts` - Extend repositories with new methods

#### 2. API Package (packages/api/src/)

**Updated Files:**
- `schema.ts` - Add creators table and extend bookmarks table
- `index.ts` - Add new endpoints:
  - `POST /api/v1/bookmarks/save` - Save bookmark with URL
  - `GET /api/v1/bookmarks/creators/:id` - Get bookmarks by creator
  - `PUT /api/v1/bookmarks/:id/refresh` - Refresh metadata

#### 3. Web Package (apps/web/src/)

**New Components:**
- `BookmarkSaveForm` - URL input and preview
- `MetadataPreview` - Show extracted metadata before saving
- `DuplicateDetection` - Handle duplicate bookmark scenarios

**New Hooks:**
- `useBookmarkSave` - Handle save workflow with TanStack Query
- `useMetadataPreview` - Preview metadata before saving

### Key Design Decisions

1. **Business Logic Location**: All bookmark saving logic in shared package
2. **Metadata Extraction**: Server-side only (Cloudflare Workers)
3. **Creator Relationships**: Separate normalized creators table
4. **User Scoping**: user_id field hardcoded to "1" for now
5. **URL Handling**: Store both original and normalized URLs
6. **Extended Metadata**: JSON fields for platform-specific data
7. **Repository Pattern**: Extend existing pattern with new methods

### API Endpoints

#### New Endpoints
- `POST /api/v1/bookmarks/save`
  - Body: `{url: string, notes?: string}`
  - Response: Full bookmark with metadata and creator info
  - Handles: URL normalization, duplicate detection, metadata extraction

- `GET /api/v1/bookmarks/creators/:creatorId`
  - Response: All bookmarks for a specific creator
  - Supports pagination and filtering

#### Updated Endpoints
- `GET /api/v1/bookmarks` - Include creator information in response
- `GET /api/v1/bookmarks/:id` - Include full metadata and creator info

### Implementation Phases

1. **Phase 1**: Database schema updates and basic save workflow
2. **Phase 2**: Metadata extraction service with generic web support
3. **Phase 3**: Platform-specific extractors (YouTube, Spotify, etc.)
4. **Phase 4**: UI components and save form
5. **Phase 5**: Creator-based filtering and duplicate detection UX

### Out of Scope (Current Phase)
- User authentication (hardcoded user_id)
- Bulk operations
- Search functionality
- Advanced metadata refresh scheduling

---

## Technical Implementation Details

### URL Normalization Rules

#### Standard Normalization
1. **Protocol**: Force HTTPS where possible
2. **Domain**: Convert to lowercase, remove www prefix
3. **Path**: Remove trailing slashes, decode percent-encoding
4. **Query Parameters**: Remove tracking parameters:
   - UTM parameters (`utm_source`, `utm_medium`, etc.)
   - Facebook (`fbclid`)
   - Google (`gclid`)
   - Analytics (`ref`, `source`)
5. **Fragment**: Remove hash fragments (`#section`)
6. **Redirects**: Follow redirects to canonical URL (max 3 hops)

#### Platform-Specific Normalization
- **YouTube**: Convert to standard watch URLs (`youtube.com/watch?v=ID`)
- **Spotify**: Use standard track/episode URLs
- **Twitter/X**: Convert to standard tweet URLs
- **Substack**: Use canonical post URLs

### Duplicate Detection Strategy

#### Primary Detection
- Compare normalized URLs for exact matches
- Check for common URL variations (mobile vs desktop, different domains)

#### Secondary Detection
- Compare title + creator combination for potential duplicates
- Flag similar content for manual review

#### User Workflow
1. **Exact Duplicate**: Show existing bookmark with option to update metadata
2. **Similar Content**: Show potential duplicate with option to save anyway
3. **No Duplicate**: Proceed with normal save flow

### Error Handling & Recovery

#### Metadata Extraction Errors
- **Network Timeout**: 10 second timeout, save URL with minimal metadata
- **Invalid Response**: Save URL with basic title from HTML `<title>` tag
- **Parsing Failure**: Log error, save URL with user-provided title
- **Rate Limited**: Retry with exponential backoff, fallback to basic metadata

#### Platform API Failures
- **YouTube API**: Fallback to HTML scraping for basic metadata
- **Spotify API**: Use oEmbed as fallback
- **Twitter API**: Use oEmbed for public tweets
- **Generic Fallback**: Always attempt basic HTML metadata extraction

#### User Experience
- **Partial Success**: Show preview with available metadata, allow save
- **Complete Failure**: Allow manual title entry, save minimal bookmark
- **Retry Option**: Provide "Try Again" button for failed extractions

### Performance & Scalability

#### Timeouts & Limits
- **Metadata Extraction**: 10 second total timeout
- **Individual Network Requests**: 5 second timeout
- **Platform API Calls**: 3 second timeout with retries
- **Rate Limiting**: 10 saves per minute per user

#### Caching Strategy
- **Metadata Cache**: 24 hour TTL for extracted metadata
- **Platform Data**: 1 hour TTL for creator information
- **Failed URLs**: 1 hour TTL to prevent repeated failures

#### Background Processing
- **Immediate Response**: Return basic metadata quickly
- **Enhanced Processing**: Enrich metadata in background job
- **Notification**: Update UI when enhanced metadata available

### Security & Validation

#### Input Validation
- **URL Format**: Validate URL structure and protocol
- **Domain Allowlist**: Block known malicious domains
- **Content-Type**: Validate response content types
- **File Size**: Limit response size to 10MB

#### Content Security
- **Metadata Sanitization**: Strip HTML tags from titles/descriptions
- **Image Validation**: Validate thumbnail URLs and content types
- **XSS Prevention**: Escape all user-generated content
- **CORS Headers**: Proper CORS for thumbnail serving

### Platform-Specific Implementation

#### YouTube Integration
- **API**: YouTube Data API v3
- **Authentication**: Server-side API key
- **Endpoints**: 
  - `videos` for video metadata
  - `channels` for creator information
- **Rate Limits**: 10,000 units per day (1 video = 1 unit)
- **Fallback**: HTML scraping for basic title/thumbnail

#### Spotify Integration
- **API**: Spotify Web API
- **Authentication**: Client Credentials flow
- **Endpoints**:
  - `tracks` for music metadata
  - `episodes` for podcast metadata
  - `artists` for creator information
- **Rate Limits**: 100 requests per minute
- **Fallback**: oEmbed API for basic metadata

#### Twitter/X Integration
- **API**: Twitter oEmbed API (public tweets only)
- **Authentication**: None required for oEmbed
- **Limitations**: Public tweets only, no detailed analytics
- **Fallback**: HTML scraping for basic content

#### Generic Web Content
- **Primary**: HTML meta tags (Open Graph, Twitter Cards)
- **Secondary**: JSON-LD structured data
- **Fallback**: HTML title and meta description tags
- **Image Extraction**: First suitable image from content

### Data Migration Strategy

#### Existing Bookmarks Migration
```sql
-- Step 1: Add new columns with defaults
ALTER TABLE bookmarks ADD COLUMN user_id TEXT NOT NULL DEFAULT '1';
ALTER TABLE bookmarks ADD COLUMN original_url TEXT;
ALTER TABLE bookmarks ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

-- Step 2: Populate original_url from existing url
UPDATE bookmarks SET original_url = url WHERE original_url IS NULL;

-- Step 3: Create creators table
CREATE TABLE creators (...);

-- Step 4: Migrate existing data to new schema
-- (Custom migration script for any existing creator data)
```

#### Migration Rollback Plan
- Keep original schema backup
- Reversible migration scripts
- Data validation checks post-migration

### Testing Strategy

#### Unit Tests
- URL normalization edge cases
- Metadata extraction with mock responses
- Creator resolution logic
- Error handling scenarios

#### Integration Tests
- End-to-end save workflow
- Platform-specific extractors with mock APIs
- Database operations and constraints
- Cache behavior validation

#### Load Testing
- Concurrent save operations
- Platform API rate limiting
- Database performance under load
- Cache effectiveness

### Monitoring & Observability

#### Key Metrics
- **Success Rate**: Percentage of successful saves
- **Extraction Quality**: Metadata completeness scores
- **Platform Performance**: Response times per platform
- **Error Rates**: Categorized by error type

#### Alerting
- **High Error Rate**: >5% failures in 5 minutes
- **Platform Outages**: API failures per platform
- **Performance Degradation**: >10s average response time
- **Rate Limiting**: Approaching API limits

#### Logging
- **Structured Logs**: JSON format with correlation IDs
- **Sensitive Data**: Never log full URLs or user data
- **Debug Information**: Extraction steps and timing
- **Error Context**: Full error details with stack traces

### Configuration Management

#### Environment Variables
```
# Platform API Keys
YOUTUBE_API_KEY=your_youtube_api_key
SPOTIFY_CLIENT_ID=your_spotify_client_id  
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# Feature Flags
ENABLE_YOUTUBE_EXTRACTION=true
ENABLE_SPOTIFY_EXTRACTION=true
ENABLE_TWITTER_EXTRACTION=true

# Performance Settings
METADATA_EXTRACTION_TIMEOUT=10000
PLATFORM_API_TIMEOUT=3000
MAX_REDIRECTS=3
CACHE_TTL_SECONDS=86400

# Security Settings
MAX_RESPONSE_SIZE_MB=10
ALLOWED_CONTENT_TYPES=text/html,application/json
RATE_LIMIT_PER_MINUTE=10
```

#### Feature Toggles
- **Platform Extractors**: Toggle individual platforms on/off
- **Background Processing**: Enable/disable async enrichment
- **Caching**: Enable/disable metadata caching
- **Validation**: Strict vs permissive URL validation
