# Article Bookmarking - Technical Design Document

## Overview

This document outlines the technical implementation for article bookmarking feature, enabling users to save articles with rich metadata including author attribution, reading time, publication date, and featured images.

## Goals

1. Leverage existing metadata extraction and storage infrastructure
2. Achieve feature parity with video/podcast bookmarks
3. Maintain data consistency across platforms
4. Support seamless UI integration in mobile app

## Current State Analysis

### What We Have ✅

#### 1. Data Schema (Fully Supported)
- **Content table** (`packages/api/src/schema.ts:176-259`): Already has all fields needed for articles
  - Basic metadata: `title`, `description`, `thumbnailUrl`, `publishedAt`, `language`
  - Creator fields: `creatorId`, `creatorName`, `creatorHandle`, `creatorThumbnail`
  - Content classification: `contentType` (supports 'article')
  - Extended metadata: `extendedMetadata` JSON field for article-specific data
- **Creators table** (`packages/api/src/schema.ts:19-33`): Supports author storage
  - `id`, `name`, `handle`, `avatarUrl`, `bio`, `url`
  - Platform tracking via `platforms` JSON field

#### 2. Type Definitions (Fully Implemented)
- **ArticleMetadata schema** (`packages/shared/src/types.ts:37-41`):
  ```typescript
  export const ArticleMetadataSchema = z.object({
    authorName: z.string().optional(),
    wordCount: z.number().optional(),
    readingTime: z.number().optional(),
  })
  ```
- **Bookmark schema** (`packages/shared/src/types.ts:71-102`): Includes `articleMetadata` field
- **Creator schema** (`packages/shared/src/types.ts:49-68`): Supports author representation

#### 3. Metadata Extraction (Partially Implemented)
- **Enhanced web extraction** (`packages/shared/src/enhanced-metadata-extractor.ts:196-272`):
  - Parses JSON-LD, Open Graph, Twitter cards
  - Extracts author/creator from structured data
  - Calculates word count and reading time for articles (lines 651-670)
  - Supports article content type detection
- **Substack-specific extraction** (`packages/shared/src/enhanced-metadata-extractor.ts:1123-1177`):
  - Enhanced article metadata for Substack posts
  - Creator extraction from subdomain

#### 4. UI Components (Exist, Need Article Support)
- **MediaRichBookmarkCard** (`apps/mobile/components/MediaRichBookmarkCard.tsx`):
  - Displays thumbnail, creator avatar, duration/reading time
  - Handles video/podcast content
  - **Gap**: Needs article-specific rendering logic
- **CompactBookmarkCard** (`apps/mobile/components/CompactBookmarkCard.tsx`):
  - Compact list view
  - **Gap**: Reading time display for articles

### What We Need ⚠️

#### 1. Schema Changes Required
- [ ] **Add full-text content storage** to `content` table:
  - `fullTextContent` (TEXT field) - Cleaned article HTML/markdown
  - `fullTextExtractedAt` (TIMESTAMP) - When full text was extracted
  - **Note**: For future offline reading feature, not required for MVP

#### 2. Metadata Extraction Gaps
- [ ] **Enhanced article-specific extraction**: While basic extraction exists, we need:
  - Better author extraction from various article platforms (Medium, dev.to, personal blogs)
  - Improved word count estimation from HTML content
  - **Featured image prioritization**: `og:image` → first content image → author avatar → favicon
  - Better publication date parsing for non-standard formats
  - Full-text content extraction (cleaned HTML) for future offline reading

#### 3. Storage/Repository Gaps
- [ ] **Article metadata persistence**: Current `d1-repository.ts` doesn't persist article metadata
  - Need to map `articleMetadata` to `content.extendedMetadata` JSON field
  - Store `wordCount` and `readingTime` in content table
  - Ensure `creatorId` linkage for authors
  - (Future) Store full-text content in `fullTextContent` field

#### 4. UI/Display Gaps
- [ ] **Article-specific card rendering**:
  - Reading time badge (replace duration for articles)
  - Author attribution (different from channel/show)
  - **Publication date display**: Relative (< 30 days), absolute (≥ 30 days)
  - Article-specific placeholder icons
  - **Show "Limited preview" indicator** when metadata is incomplete (paywalled content)
- [ ] **Creator profile support** for authors:
  - Display author name + avatar consistently
  - Link to author profile (creator detail page)

#### 5. Creator Service Gaps
- [ ] **Author deduplication via fuzzy matching**: `creator-service.ts` needs article author support
  - Implement name similarity matching (Levenshtein distance or similar)
  - Resolve web-based authors across different article platforms
  - Handle author name variations (John Doe vs. J. Doe vs. johndoe)
  - Consider domain-based matching (same author from same domain)

## Architecture

### High-Level Flow

```
User pastes article URL
    ↓
Bookmark Save Service
    ↓
Enhanced Metadata Extractor
    ├→ Detect platform (Substack/Medium/web)
    ├→ Extract article metadata (title, author, image, date, wordCount)
    ├→ Calculate reading time (wordCount / 200 WPM)
    └→ Extract/create Creator for author
    ↓
D1 Repository
    ├→ Insert/update Content record (with article metadata)
    ├→ Ensure Creator exists (author)
    └→ Create Bookmark record (link user + content)
    ↓
Mobile App
    └→ Display article card (thumbnail, author, reading time, date)
```

### Data Model

#### Content Table Schema Changes
**New fields to add** (migration required):
```sql
ALTER TABLE content ADD COLUMN full_text_content TEXT;
ALTER TABLE content ADD COLUMN full_text_extracted_at INTEGER; -- timestamp
```

**Updated Content Table Schema**:
```typescript
{
  id: 'web-{hash}',
  externalId: '{url-hash}',
  provider: 'web' | 'substack' | 'medium',
  contentType: 'article',
  title: string,
  description?: string,
  thumbnailUrl?: string,        // Featured image (priority: og:image → content img → author avatar → favicon)
  publishedAt?: timestamp,
  creatorId?: string,            // Link to author in creators table
  creatorName?: string,
  creatorThumbnail?: string,     // Author avatar
  language?: string,
  
  // NEW: Full-text content (for future offline reading)
  fullTextContent?: string,      // Cleaned article HTML/markdown
  fullTextExtractedAt?: timestamp,
  
  // Extended metadata (JSON field)
  extendedMetadata: {
    authorName?: string,          // Primary author
    secondaryAuthors?: string[],  // Additional authors (for multi-author articles)
    wordCount?: number,
    readingTime?: number,         // In minutes (calculated at 200 WPM)
    isPaywalled?: boolean,        // Indicates limited metadata availability
  }
}
```

#### Creator Table (Existing Schema)
```typescript
{
  id: 'web:{author-slug}' | 'substack:{subdomain}',
  name: string,                  // Author display name
  handle?: string,
  avatarUrl?: string,            // Author profile picture
  bio?: string,
  url?: string,                  // Author profile/website
  platforms: ['web', 'substack', ...]
}
```

## Implementation Plan

### Phase 0: Database Migration (Prerequisite)
**Files to create:**
- `packages/api/migrations/XXXX_add_article_full_text.sql`

**Migration SQL:**
```sql
-- Add full-text content storage for articles
ALTER TABLE content ADD COLUMN full_text_content TEXT;
ALTER TABLE content ADD COLUMN full_text_extracted_at INTEGER;

-- Add index for faster full-text searches (future feature)
CREATE INDEX idx_content_full_text ON content(full_text_content) WHERE full_text_content IS NOT NULL;
```

**Testing:**
- Run migration on local D1 database
- Verify schema changes with `PRAGMA table_info(content);`
- Test rollback if needed

### Phase 1: Backend - Metadata Extraction Enhancement
**Files to modify:**
- `packages/shared/src/enhanced-metadata-extractor.ts`

**Changes:**
1. Improve `extractEnhancedWebMetadata()` for article detection
   - Prioritize article-specific Open Graph tags: `og:type=article`, `article:author`, `article:published_time`
   - Extract word count from visible text content (exclude nav, footer, ads)
   - Calculate reading time: `Math.ceil(wordCount / 200)` (standard 200 WPM)
   - **Featured image priority**: `og:image` → first content `<img>` → author avatar → favicon
   - Extract full-text content (cleaned HTML for future offline reading)

2. Enhance `extractCreator()` for article authors
   - Parse `article:author` meta tag
   - Extract author from JSON-LD `author` or `creator` fields
   - Create unique author IDs: `web:{slugified-name}` or `{platform}:{author-id}`
   - Handle multiple authors: store primary in creator, others in `extendedMetadata.secondaryAuthors`

3. Add paywalled content detection
   - Set `extendedMetadata.isPaywalled = true` when metadata is limited
   - Common indicators: login walls, subscription prompts, truncated content

4. Add platform-specific extractors (if needed)
   - Medium: Extract from Medium-specific metadata
   - dev.to: Extract from dev.to API/metadata
   - Ghost: Support Ghost blog metadata

**Testing:**
- Unit tests for article metadata extraction from sample HTML
- Test various article platforms: Substack, Medium, personal blogs, news sites
- Validate reading time calculations (200 WPM standard)
- Test paywalled content detection (NYT, Medium member-only)

### Phase 2: Backend - Storage & Repository
**Files to modify:**
- `packages/api/src/d1-repository.ts`
- `packages/api/src/repositories/content-repository.ts`

**Changes:**
1. Update `createWithMetadata()` in D1Repository
   - Map `articleMetadata` to `content.extendedMetadata` JSON
   - Persist `wordCount`, `readingTime`, `secondaryAuthors`, `isPaywalled` in extended metadata
   - Store `fullTextContent` and `fullTextExtractedAt` (for future offline reading)
   - Ensure `creatorId` is set for article authors

2. Update `mapRowToBookmark()` helper
   - Parse `extendedMetadata` JSON and map to `articleMetadata` field
   - Include creator data for article authors
   - Extract `isPaywalled` flag for UI indicator

**Testing:**
- Integration tests for article bookmark creation
- Verify metadata round-trip (save → retrieve → matches)
- Test creator linkage for authors
- Verify full-text content is stored (when available)

### Phase 3: Frontend - UI Components
**Files to modify:**
- `apps/mobile/components/MediaRichBookmarkCard.tsx`
- `apps/mobile/components/CompactBookmarkCard.tsx`
- `apps/mobile/lib/dateUtils.ts`

**Changes:**
1. Update `MediaRichBookmarkCard`:
   ```typescript
   // Replace duration with reading time for articles
   const displayTime = bookmark.contentType === 'article'
     ? bookmark.articleMetadata?.readingTime 
       ? `${bookmark.articleMetadata.readingTime} min read`
       : null  // Show nothing if reading time unavailable
     : formatDuration(duration);
   
   // Use article author instead of channel/show
   const authorName = bookmark.contentType === 'article'
     ? bookmark.articleMetadata?.authorName || bookmark.creator?.name
     : bookmark.creator?.name;
   
   // Show "Limited preview" indicator for paywalled content
   const isPaywalled = bookmark.articleMetadata?.isPaywalled;
   ```

2. Update `CompactBookmarkCard`:
   - Show reading time badge for articles (or nothing if unavailable)
   - Display author avatar for articles
   - Show "Limited preview" chip for paywalled content

3. Update `dateUtils.ts`:
   - Add `formatPublicationDate()` helper:
     - Recent (< 30 days): "2 days ago", "3 weeks ago"
     - Older (≥ 30 days): "Jan 15, 2023"

4. Handle article-specific icons/indicators
   - Use `file-text` icon for articles (already exists)
   - Show article content type color
   - Display lock icon for paywalled content

**Testing:**
- Visual testing on iOS/Android simulators
- Test with various article bookmarks (with/without images, authors, dates)
- Test paywalled content indicator display
- Test publication date formatting (recent vs. old articles)
- Verify accessibility (screen readers, contrast)

### Phase 4: Integration & Polish
**Files to modify:**
- `packages/shared/src/creator-service.ts`

**Changes:**
1. Enhance `creator-service.ts` for author deduplication via fuzzy matching
   - Implement name similarity algorithm:
     ```typescript
     // Use Levenshtein distance or similar string matching
     function calculateSimilarity(name1: string, name2: string): number {
       // Normalize: lowercase, remove punctuation, trim
       const normalized1 = normalizeName(name1);
       const normalized2 = normalizeName(name2);
       
       // Calculate similarity score (0-1)
       // Consider: exact match, substring match, Levenshtein distance
       return similarity;
     }
     ```
   - Match authors with similarity > 0.85 threshold
   - Consider domain-based matching (same author from same root domain = likely match)
   - Handle common name variations:
     - "John Doe" ↔ "J. Doe" ↔ "John A. Doe"
     - "johndoe" ↔ "john_doe" ↔ "@johndoe"

2. Update `resolveCreator()` to use fuzzy matching
   - Check existing creators for similar names before creating new ones
   - Merge metadata from multiple sources (prefer most complete record)

**Testing:**
- Unit tests for name similarity matching
- Test author deduplication across platforms:
  - Same author on Substack and personal blog
  - Name variations (full name vs. initials)
  - Handle conflicts (different people with same name)
- End-to-end testing: Paste article URL → Save → View in list → View details
- Test edge cases: no author, no image, very long titles, paywalled content
- Performance testing: metadata extraction speed

## Detailed Component Changes

### MediaRichBookmarkCard.tsx

**Current behavior:**
- Shows video/podcast duration in bottom-right badge
- Shows creator name + avatar
- Shows play button overlay for media content

**Required changes:**
```typescript
// Line 68-73: Update duration logic
const duration = bookmark.contentType === 'article'
  ? null  // Don't show duration for articles
  : bookmark.videoMetadata?.duration ?? bookmark.podcastMetadata?.duration ?? null;

// Line 74-80: Update display time to show reading time for articles
const displayTime = bookmark.contentType === 'article'
  ? bookmark.articleMetadata?.readingTime 
    ? `${bookmark.articleMetadata.readingTime} min read`
    : null
  : formattedDuration;

// Line 76-79: Update author name logic
const authorName = bookmark.contentType === 'article'
  ? bookmark.creator?.name || bookmark.articleMetadata?.authorName || 'Unknown Author'
  : bookmark.creator?.name || bookmark.source || 'Unknown';

// Line 137-152: Hide play button for articles
const isMediaContent = bookmark.contentType === 'video' || bookmark.contentType === 'podcast';

// Line 154-159: Show reading time badge instead of duration for articles
{displayTime && (
  <View style={styles.badge}>
    <Text style={styles.badgeText}>{displayTime}</Text>
  </View>
)}
```

### CompactBookmarkCard.tsx

**Current behavior:**
- Shows duration badge for video/podcast
- Shows content type icon

**Required changes:**
```typescript
// Line 60-66: Update duration to include reading time
const displayDuration = bookmark.contentType === 'article'
  ? bookmark.articleMetadata?.readingTime
    ? `${bookmark.articleMetadata.readingTime} min`
    : null
  : duration;

// Line 116-119: Update badge display
{displayDuration && (
  <View style={styles.compactDurationBadge}>
    <Text style={styles.compactDurationText}>
      {bookmark.contentType === 'article' 
        ? `${displayDuration} read`
        : formatDuration(displayDuration)
      }
    </Text>
  </View>
)}
```

## API Contracts

### SaveBookmark Request (Unchanged)
```typescript
POST /api/bookmarks
{
  url: string,
  notes?: string
}
```

### Bookmark Response (Enhanced with Article Data)
```typescript
{
  id: string,
  userId: string,
  url: string,
  title: string,
  contentType: 'article',
  thumbnailUrl?: string,
  publishedAt?: number,
  creator?: {
    id: string,
    name: string,
    avatarUrl?: string,
    bio?: string,
    url?: string
  },
  articleMetadata?: {
    authorName?: string,
    wordCount?: number,
    readingTime?: number  // in minutes
  }
}
```

## Migration Strategy

**No database migrations required** - All necessary fields exist in current schema.

**Backfill strategy** (optional future enhancement):
1. Identify existing bookmarks with `contentType: 'article'` but missing `articleMetadata`
2. Re-run metadata extraction for these bookmarks
3. Update `content.extendedMetadata` with extracted article data

## Testing Strategy

### Unit Tests
- [ ] `enhanced-metadata-extractor.ts`: Article metadata extraction
- [ ] `creator-service.ts`: Author deduplication
- [ ] `d1-repository.ts`: Article bookmark persistence

### Integration Tests
- [ ] Full bookmark save flow for article URLs
- [ ] Creator creation/linkage for article authors
- [ ] Metadata retrieval and mapping

### E2E Tests
- [ ] Mobile app: Save article bookmark from various sources
- [ ] Mobile app: Display article bookmarks in list view
- [ ] Mobile app: View article bookmark details

### Manual Testing Checklist
- [ ] Test article from Substack
- [ ] Test article from Medium
- [ ] Test article from personal blog
- [ ] Test article from news site (NYT, The Guardian, etc.)
- [ ] Test article without author
- [ ] Test article without featured image
- [ ] Test article without publication date
- [ ] Test very long article (10,000+ words)
- [ ] Test very short article (< 500 words)

## Edge Cases & Error Handling

### Decisions Applied:

1. **Missing author**: Use "Unknown Author" fallback
2. **No word count/reading time available**: Show no badge (don't display estimate)
3. **No featured image**: Priority: `og:image` → first content image → author avatar → favicon
4. **Multiple authors**: Store primary/first author in creator field, secondary authors in `extendedMetadata.secondaryAuthors` array
5. **Paywalled content**: 
   - Extract available metadata from public headers
   - Set `isPaywalled: true` in extended metadata
   - Show "Limited preview" indicator in UI
6. **Very old articles**: Use absolute dates for articles ≥ 30 days old (e.g., "Jan 15, 2023")
7. **Author deduplication**: Use fuzzy name matching (similarity > 0.85) to unify authors across platforms
8. **Full-text content**: Store when available for future offline reading feature (not displayed in MVP)

## Performance Considerations

- **Metadata extraction timeout**: 10 seconds max (existing)
- **Fallback extraction**: oEmbed → Open Graph → HTML parsing (existing)
- **Caching**: Cache extracted metadata to avoid re-fetching (consider future enhancement)
- **Concurrent extraction**: Support batch bookmark imports (existing architecture supports)

## Security Considerations

- **URL validation**: Ensure article URLs are valid and safe (existing validation)
- **Metadata sanitization**: Sanitize extracted HTML to prevent XSS (existing in metadata extractor)
- **Author attribution**: Verify author data comes from trusted sources (article origin)

## Success Criteria

✅ **MVP Complete When:**
1. Users can save article bookmarks from any web URL
2. Article bookmarks display with:
   - Thumbnail image (when available)
   - Author name and avatar (when available)
   - Reading time estimate (when available)
   - Publication date (when available)
3. Article bookmarks visually consistent with video/podcast bookmarks
4. 80%+ of article bookmarks successfully extract author and reading time

## Future Enhancements (Post-MVP)

### Planned for Next Phase:
1. **Offline article reading**: Display stored full-text content when offline (schema already supports)
2. **Enhanced author profiles**: Follow authors, see their other articles across platforms

### Future Considerations:
3. **Article summarization**: AI-generated summaries
4. **Article categories**: Auto-categorize articles (tech, news, opinion, etc.)
5. **Reading progress tracking**: Track how far user has read in an article
6. **Highlights & annotations**: Allow users to highlight text and add notes
7. **Related articles**: Suggest similar articles based on content
8. **RSS integration**: Subscribe to author RSS feeds
9. **Personalized reading speed**: Allow users to configure WPM for reading time estimates
10. **Manual metadata editing**: Let users correct/enhance extracted metadata

## Resolved Technical Questions

1. **Multiple authors?**
   - ✅ Store primary author in creator field, secondary authors in `extendedMetadata.secondaryAuthors`

2. **Reading speed personalization?**
   - ✅ Use standard 200 WPM for all users (no personalization in MVP)

3. **Paywalled content handling?**
   - ✅ Extract available metadata, show "Limited preview" indicator, no manual editing in MVP

4. **Article categorization?**
   - ✅ Generic "article" content type for MVP (no subcategories)

5. **Featured image priority?**
   - ✅ `og:image` → first content image → author avatar → favicon

6. **Author deduplication?**
   - ✅ Implement fuzzy name matching (similarity > 0.85 threshold)

7. **Missing reading time?**
   - ✅ Show no badge/indicator (don't estimate)

8. **Full-text content storage?**
   - ✅ Add schema fields now, extract and store for future offline reading feature

9. **Publication date display?**
   - ✅ Relative for recent (< 30 days), absolute for older (≥ 30 days)

10. **Article update tracking?**
    - ✅ Out of scope for MVP and near-term roadmap

## Remaining Open Questions

1. **How to handle dynamic content?** (e.g., JavaScript-rendered articles)
   - Current approach: Use existing HTML parser
   - Future consideration: Headless browser for SPA-based articles

2. **Full-text extraction quality**: How to clean HTML and preserve formatting?
   - Consider libraries: Readability.js, Mozilla's Readability
   - Test with various article platforms to ensure quality

## References

- Existing PRD documents: `SPOTIFY_BOOKMARKING_PARITY_PLAN.md`, `YOUTUBE_CONNECT_PLAN.md`
- Schema documentation: `packages/api/src/schema.ts`
- Metadata extractor: `packages/shared/src/enhanced-metadata-extractor.ts`
- Bookmark save service: `packages/shared/src/bookmark-save-service.ts`
