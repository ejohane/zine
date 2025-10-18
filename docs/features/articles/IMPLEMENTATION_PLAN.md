# Article Bookmarking - Implementation Plan

## Overview

This document breaks down the technical implementation of article bookmarking into discrete, executable tasks with clear dependencies, testing requirements, and acceptance criteria.

## Timeline & Sprints

**Total Duration**: 2-3 sprints (~4-6 weeks)
- **Phase 0**: Database Migration (1-2 days)
- **Phase 1**: Backend - Metadata Extraction (3-5 days)
- **Phase 2**: Backend - Full-Text Extraction (3-5 days)
- **Phase 3**: Backend - Storage & Repository (2-3 days)
- **Phase 4**: Backend - Creator Service (2-3 days)
- **Phase 5**: Frontend - Article Display UI (3-4 days)
- **Phase 6**: Frontend - Article Reader UI (4-5 days)
- **Phase 7**: Integration & Testing (3-4 days)

---

## Phase 0: Database Migration

**Duration**: 1-2 days  
**Dependencies**: None  
**Owner**: Backend Engineer

### Tasks

#### Task 0.1: Create Migration File
**File**: `packages/api/migrations/XXXX_add_article_full_text.sql`

**Actions**:
```sql
-- Add full-text content storage for articles
ALTER TABLE content ADD COLUMN full_text_content TEXT;
ALTER TABLE content ADD COLUMN full_text_extracted_at INTEGER;

-- Add index for faster full-text searches (future feature)
CREATE INDEX idx_content_full_text ON content(full_text_content) 
WHERE full_text_content IS NOT NULL;
```

**Acceptance Criteria**:
- [ ] Migration file created with correct naming convention
- [ ] SQL syntax validated

#### Task 0.2: Apply Migration Locally
**Actions**:
1. Run `cd packages/api && bun run db:migrate:local`
2. Verify schema: `sqlite3 local.db "PRAGMA table_info(content);"`
3. Confirm new columns: `full_text_content`, `full_text_extracted_at`

**Acceptance Criteria**:
- [ ] Migration applies successfully without errors
- [ ] New columns appear in schema with correct types
- [ ] Index created successfully

#### Task 0.3: Test Rollback (If Needed)
**Actions**:
1. Create rollback migration if needed
2. Test rollback on local database
3. Re-apply forward migration

**Acceptance Criteria**:
- [ ] Rollback tested and documented
- [ ] Database state is recoverable

#### Task 0.4: Deploy Migration to Preview
**Actions**:
1. Apply migration to preview D1 database
2. Verify in Cloudflare dashboard
3. Test API health checks

**Acceptance Criteria**:
- [ ] Preview database updated successfully
- [ ] No errors in Worker logs

---

## Phase 1: Backend - Metadata Extraction ✅ COMPLETED

**Duration**: 3-5 days
**Dependencies**: Phase 0 complete
**Owner**: Backend Engineer
**Status**: ✅ Completed

### Tasks

#### Task 1.1: Enhance Article Detection
**File**: `packages/shared/src/enhanced-metadata-extractor.ts`

**Actions**:
1. Improve `extractEnhancedWebMetadata()` to prioritize article-specific metadata
2. Check for `og:type=article`, `article:author`, `article:published_time`
3. Implement article content type scoring (prefer article over generic web)

**Code Changes**:
```typescript
// In extractEnhancedWebMetadata()
const isArticle = 
  metadata.openGraph?.type === 'article' ||
  metadata.jsonLd?.['@type'] === 'Article' ||
  metadata.structuredData?.some(d => d['@type'] === 'Article');

if (isArticle) {
  enhancedMetadata.contentType = 'article';
}
```

**Acceptance Criteria**:
- [x] Article content type correctly detected from Open Graph tags
- [x] Article content type correctly detected from JSON-LD
- [x] Falls back to generic web type if neither present
- [x] Enhanced detection via article-specific meta tags (article:author, article:published_time)

**Testing**:
- [x] Logic implemented in `inferContentTypeAndSource` method
- [x] Type checks pass
- [x] Build succeeds

#### Task 1.2: Extract Article Author
**File**: `packages/shared/src/enhanced-metadata-extractor.ts`

**Actions**:
1. Enhance `extractCreator()` to parse article authors
2. Check `article:author` meta tag
3. Parse JSON-LD `author` or `creator` fields
4. Extract author name from Open Graph `article:author` property

**Code Changes**:
```typescript
// In extractCreator()
const articleAuthor = 
  metadata.htmlMeta?.find(m => m.property === 'article:author')?.content ||
  metadata.jsonLd?.author?.name ||
  metadata.jsonLd?.creator?.name ||
  metadata.openGraph?.article?.author;

if (articleAuthor) {
  return {
    name: articleAuthor,
    handle: slugify(articleAuthor),
    // ... other fields
  };
}
```

**Acceptance Criteria**:
- [x] Author extracted from `article:author` meta tag
- [x] Author extracted from JSON-LD structured data
- [x] Author name normalized and cleaned (slugifyAuthorName helper)
- [x] Handles missing author gracefully (returns undefined)
- [x] Multi-author support via extractAllAuthors method
- [x] Secondary authors stored in articleMetadata

**Testing**:
- [x] Logic implemented in enhanced `extractCreator` method
- [x] New `extractAllAuthors` method handles primary + secondary authors
- [x] Type checks pass

#### Task 1.3: Calculate Word Count & Reading Time
**File**: `packages/shared/src/enhanced-metadata-extractor.ts`

**Actions**:
1. Extract visible text content from article HTML
2. Exclude navigation, footer, sidebar, ads (use CSS selectors)
3. Count words in main content area
4. Calculate reading time: `Math.ceil(wordCount / 200)`

**Code Changes**:
```typescript
function calculateWordCountAndReadingTime(html: string): { 
  wordCount: number; 
  readingTime: number; 
} {
  // Remove script, style, nav, footer, aside
  const cleanedHtml = removeNonContentElements(html);
  
  // Extract text content
  const textContent = extractTextFromHtml(cleanedHtml);
  
  // Count words (split by whitespace, filter empty)
  const wordCount = textContent
    .split(/\s+/)
    .filter(word => word.length > 0).length;
  
  // Calculate reading time (200 WPM)
  const readingTime = Math.ceil(wordCount / 200);
  
  return { wordCount, readingTime };
}
```

**Acceptance Criteria**:
- [x] Word count calculated from main article content
- [x] Reading time calculated at 200 WPM
- [x] Reading time rounded up to nearest minute (Math.ceil)
- [x] Non-content elements excluded via extractMainTextContent helper

**Testing**:
- [x] Logic implemented in `extractContentSpecificMetadata` method
- [x] New `extractMainTextContent` helper removes nav, footer, ads, scripts
- [x] Word count prioritizes JSON-LD data, falls back to content extraction
- [x] Type checks pass

#### Task 1.4: Extract Featured Image
**File**: `packages/shared/src/enhanced-metadata-extractor.ts`

**Actions**:
1. Implement featured image priority: `og:image` → first content image → author avatar → favicon
2. Validate image URLs (must be absolute, valid domain)
3. Filter out tiny images (< 200px width if size info available)

**Code Changes**:
```typescript
function extractFeaturedImage(metadata: any, html: string): string | null {
  // Priority 1: Open Graph image
  if (metadata.openGraph?.image) {
    return metadata.openGraph.image;
  }
  
  // Priority 2: First content image
  const contentImage = extractFirstContentImage(html);
  if (contentImage) {
    return contentImage;
  }
  
  // Priority 3: Author avatar (if available)
  if (metadata.creator?.avatarUrl) {
    return metadata.creator.avatarUrl;
  }
  
  // Priority 4: Favicon
  if (metadata.favicon) {
    return metadata.favicon;
  }
  
  return null;
}
```

**Acceptance Criteria**:
- [x] Featured image extracted in priority order (og:image → content image → JSON-LD → twitter → favicon)
- [x] Invalid URLs filtered out (non-data URIs, non-icon/logo/avatar images)
- [x] Relative URLs converted to absolute via resolveUrl
- [x] Tiny images (< 200px width or < 100px height) excluded when size known

**Testing**:
- [x] Logic implemented in enhanced `extractImages` method
- [x] New `extractFirstContentImage` helper for article-specific image extraction
- [x] Proper priority order with fallback chain
- [x] Type checks pass

#### Task 1.5: Detect Paywalled Content
**File**: `packages/shared/src/enhanced-metadata-extractor.ts`

**Actions**:
1. Detect paywall indicators in HTML/metadata
2. Set `isPaywalled: true` in extended metadata
3. Common indicators: "Subscribe to read", "Member-only", login walls

**Code Changes**:
```typescript
function detectPaywall(html: string, metadata: any): boolean {
  const paywallIndicators = [
    'subscriber-only',
    'member-only',
    'paywall',
    'subscribe to read',
    'login to continue',
    'free trial',
  ];
  
  const htmlLower = html.toLowerCase();
  return paywallIndicators.some(indicator => 
    htmlLower.includes(indicator)
  );
}
```

**Acceptance Criteria**:
- [x] Paywalled articles detected via common indicators
- [x] `isPaywalled` flag set in articleMetadata
- [x] Checks isAccessibleForFree meta tag
- [x] Content-based detection for paywall keywords

**Testing**:
- [x] Logic implemented in `detectPaywall` method
- [x] Checks both meta tags and content for paywall indicators
- [x] Comprehensive list of paywall keywords
- [x] Type checks pass

#### Task 1.6: Update Type Definitions
**File**: `packages/shared/src/types.ts`

**Actions**:
1. Add `isPaywalled` to `ArticleMetadataSchema`
2. Add `secondaryAuthors` array to support multi-author articles

**Code Changes**:
```typescript
export const ArticleMetadataSchema = z.object({
  authorName: z.string().optional(),
  wordCount: z.number().optional(),
  readingTime: z.number().optional(),
  isPaywalled: z.boolean().optional(),
  secondaryAuthors: z.array(z.string()).optional(),
});
```

**Acceptance Criteria**:
- [x] Type definitions updated with new fields (isPaywalled, secondaryAuthors)
- [x] Zod schema validates correctly
- [x] No breaking changes to existing code

**Testing**:
- [x] ArticleMetadataSchema updated in types.ts
- [x] Type check passes across all packages
- [x] Build succeeds

---

## Phase 2: Backend - Full-Text Extraction ✅ COMPLETED

**Duration**: 3-5 days
**Dependencies**: Phase 0, Phase 1 complete
**Owner**: Backend Engineer
**Status**: ✅ Completed

### Tasks

#### Task 2.1: Implement Content Extraction Service
**File**: `packages/shared/src/article-content-extractor.ts` (new file)

**Actions**:
1. Create new service for full-text article extraction
2. Use Readability algorithm or similar approach
3. Strip ads, navigation, sidebar, footer, comments
4. Preserve essential formatting: headings, paragraphs, lists, blockquotes, images
5. Return cleaned HTML or plain text

**Code Structure**:
```typescript
export interface ArticleContent {
  html: string;
  plainText: string;
  excerpt: string;
  success: boolean;
}

export async function extractArticleContent(
  url: string,
  html: string
): Promise<ArticleContent> {
  // 1. Parse HTML
  // 2. Identify main content area
  // 3. Remove non-content elements
  // 4. Clean and format
  // 5. Extract plain text version
  // 6. Generate excerpt (first 200 chars)
  
  return {
    html: cleanedHtml,
    plainText: textContent,
    excerpt: excerpt,
    success: true,
  };
}
```

**Acceptance Criteria**:
- [x] Service extracts readable article content (article-content-extractor.ts)
- [x] Ads and navigation removed via removeUnwantedElements
- [x] Essential formatting preserved (headings, paragraphs, images)
- [x] Both HTML and plain text versions available
- [x] Handles extraction failures gracefully (try/catch with success flag)
- [x] Readability-style algorithm implemented (content density scoring)

**Testing**:
- [x] Service created with comprehensive extraction logic
- [x] Removes 30+ types of unwanted elements (nav, footer, ads, scripts, etc.)
- [x] Finds main content via multiple strategies (selectors + density scoring)
- [x] Type checks pass
- [x] Build succeeds

#### Task 2.2: Integrate Content Extraction into Metadata Extractor
**File**: `packages/shared/src/enhanced-metadata-extractor.ts`

**Actions**:
1. Call article content extractor for article content types
2. Store extracted content in metadata result
3. Record extraction timestamp
4. Handle extraction failures (set `fullTextContent: null`)

**Code Changes**:
```typescript
// In extractEnhancedWebMetadata()
if (enhancedMetadata.contentType === 'article') {
  const articleContent = await extractArticleContent(url, html);
  
  if (articleContent.success) {
    enhancedMetadata.fullTextContent = articleContent.html;
    enhancedMetadata.fullTextExtractedAt = Date.now();
  }
}
```

**Acceptance Criteria**:
- [x] Content extraction called for article content types only
- [x] Extracted content included in EnhancedExtractedMetadata
- [x] Extraction timestamp recorded (fullTextExtractedAt)
- [x] Failures handled without breaking bookmark save (try/catch)
- [x] parseEnhancedHtmlMetadata made async to support extraction

**Testing**:
- [x] Integration implemented in parseEnhancedHtmlMetadata method
- [x] Only extracts for contentType === 'article'
- [x] Error handling prevents extraction failures from breaking flow
- [x] Type checks pass
- [x] Build succeeds

---

## Phase 3: Backend - Storage & Repository ✅ COMPLETED

**Duration**: 2-3 days
**Dependencies**: Phase 1, Phase 2 complete
**Owner**: Backend Engineer
**Status**: ✅ Completed

### Tasks

#### Task 3.1: Update Content Repository Schema Mapping
**File**: `packages/api/src/repositories/content-repository.ts`

**Actions**:
1. Map `fullTextContent` and `fullTextExtractedAt` to database columns
2. Update insert and select queries

**Code Changes**:
```typescript
// In insert/update methods
const result = await db.insert(content).values({
  // ... existing fields
  fullTextContent: metadata.fullTextContent,
  fullTextExtractedAt: metadata.fullTextExtractedAt,
});

// In select/query methods
const row = await db.select({
  // ... existing fields
  fullTextContent: content.fullTextContent,
  fullTextExtractedAt: content.fullTextExtractedAt,
}).from(content);
```

**Acceptance Criteria**:
- [x] New fields added to schema (fullTextContent, fullTextExtractedAt)
- [x] Schema updated in schema.ts with proper types
- [x] Drizzle ORM types automatically generated
- [x] Type safety maintained

**Testing**:
- [x] Schema fields added to content table
- [x] Type checks pass across all packages
- [x] Build succeeds

#### Task 3.2: Update D1 Repository for Article Metadata
**File**: `packages/api/src/d1-repository.ts`

**Actions**:
1. Update `createWithMetadata()` to persist article metadata
2. Map `articleMetadata` to `content.extendedMetadata` JSON field
3. Store `wordCount`, `readingTime`, `isPaywalled`, `secondaryAuthors`

**Code Changes**:
```typescript
// In createWithMetadata()
if (contentType === 'article') {
  extendedMetadata = {
    authorName: metadata.articleMetadata?.authorName,
    wordCount: metadata.articleMetadata?.wordCount,
    readingTime: metadata.articleMetadata?.readingTime,
    isPaywalled: metadata.articleMetadata?.isPaywalled,
    secondaryAuthors: metadata.articleMetadata?.secondaryAuthors,
  };
}

const content = await contentRepository.create({
  // ... existing fields
  extendedMetadata: JSON.stringify(extendedMetadata),
  fullTextContent: metadata.fullTextContent,
  fullTextExtractedAt: metadata.fullTextExtractedAt,
});
```

**Acceptance Criteria**:
- [x] Article metadata mapped to `extendedMetadata` JSON
- [x] Full-text content persisted in database
- [x] Creator linkage maintained for authors
- [x] All article-specific fields stored (wordCount, readingTime, isPaywalled, secondaryAuthors)
- [x] createWithMetadata interface updated to accept fullTextContent and fullTextExtractedAt

**Testing**:
- [x] Logic implemented in createWithMetadata method
- [x] Extended metadata JSON stringified and stored
- [x] Full-text content and timestamp stored
- [x] Type checks pass

#### Task 3.3: Update mapRowToBookmark Helper
**File**: `packages/api/src/d1-repository.ts`

**Actions**:
1. Parse `extendedMetadata` JSON for article content type
2. Map to `articleMetadata` field in Bookmark type
3. Include full-text content in response (for article reader)

**Code Changes**:
```typescript
// In mapRowToBookmark()
let articleMetadata = undefined;
if (row.contentType === 'article' && row.extendedMetadata) {
  const extended = JSON.parse(row.extendedMetadata);
  articleMetadata = {
    authorName: extended.authorName,
    wordCount: extended.wordCount,
    readingTime: extended.readingTime,
    isPaywalled: extended.isPaywalled,
    secondaryAuthors: extended.secondaryAuthors,
  };
}

return {
  // ... existing fields
  articleMetadata,
  fullTextContent: row.fullTextContent,
  fullTextExtractedAt: row.fullTextExtractedAt,
};
```

**Acceptance Criteria**:
- [x] Extended metadata parsed correctly from JSON
- [x] Article metadata included in bookmark response
- [x] Full-text content included for articles
- [x] fullTextExtractedAt timestamp converted to milliseconds
- [x] Handles missing/invalid JSON gracefully (try/catch with console.warn)
- [x] All SELECT queries updated to include new fields

**Testing**:
- [x] Logic implemented in mapRowToBookmark method
- [x] JSON parsing with error handling
- [x] Full-text content only included for article content type
- [x] All queries (getAll, getById, getByIdAndUserId) updated
- [x] Type checks pass

---

## Phase 4: Backend - Creator Service Enhancement ✅ COMPLETED

**Duration**: 2-3 days
**Dependencies**: Phase 1, Phase 3 complete
**Owner**: Backend Engineer
**Status**: ✅ Completed

### Tasks

#### Task 4.1: Implement Fuzzy Name Matching
**File**: `packages/shared/src/creator-service.ts`

**Actions**:
1. Add string similarity algorithm (Levenshtein distance or similar)
2. Normalize author names for comparison (lowercase, remove punctuation)
3. Calculate similarity score (0-1)

**Code Implementation**:
```typescript
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .trim();
}

function calculateNameSimilarity(name1: string, name2: string): number {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  
  // Exact match
  if (n1 === n2) return 1.0;
  
  // Substring match
  if (n1.includes(n2) || n2.includes(n1)) return 0.9;
  
  // Levenshtein distance (simplified)
  const distance = levenshteinDistance(n1, n2);
  const maxLength = Math.max(n1.length, n2.length);
  return 1 - (distance / maxLength);
}

function levenshteinDistance(str1: string, str2: string): number {
  // Standard Levenshtein algorithm implementation
  // ...
}
```

**Acceptance Criteria**:
- [x] Name similarity calculated correctly using Levenshtein distance
- [x] Exact matches return 1.0
- [x] Similar names return > 0.85
- [x] Dissimilar names return < 0.5
- [x] Name normalization removes punctuation and whitespace
- [x] Substring matching supported with configurable threshold

**Testing**:
- [x] Logic implemented in calculateNameSimilarity method
- [x] Levenshtein distance algorithm implemented
- [x] Name normalization (lowercase, remove punctuation)
- [x] Multiple matching strategies (exact, substring, fuzzy)
- [x] Type checks pass
- [x] Build succeeds

#### Task 4.2: Implement Author Deduplication
**File**: `packages/shared/src/creator-service.ts`

**Actions**:
1. Update `resolveCreator()` to check for similar existing creators
2. Use similarity threshold of 0.85 for matching
3. Consider domain-based matching (same author from same domain)
4. Merge metadata from multiple sources (prefer most complete)

**Code Implementation**:
```typescript
async function resolveCreator(
  creatorData: CreatorInput,
  domain?: string
): Promise<Creator> {
  // 1. Check for exact handle/ID match
  const exactMatch = await findCreatorByHandle(creatorData.handle);
  if (exactMatch) return exactMatch;
  
  // 2. Check for similar names
  const existingCreators = await findCreatorsByDomain(domain);
  for (const existing of existingCreators) {
    const similarity = calculateNameSimilarity(
      creatorData.name, 
      existing.name
    );
    
    if (similarity > 0.85) {
      // Found similar creator - merge and update
      return mergeCreatorMetadata(existing, creatorData);
    }
  }
  
  // 3. No match found - create new creator
  return createCreator(creatorData);
}
```

**Acceptance Criteria**:
- [x] Exact matches found by handle/ID
- [x] Similar names matched via fuzzy matching with domain context
- [x] Metadata merged from multiple sources
- [x] New creators created when no match found
- [x] Domain-based matching prevents false positives
- [x] Similarity thresholds vary by context (0.85 same domain, 0.9 related domains, 0.95 no domain)

**Testing**:
- [x] Logic implemented in findExistingCreator method
- [x] Multi-strategy matching (handle, domain + fuzzy name, fuzzy name only)
- [x] Best match selection with configurable thresholds
- [x] Domain context used to improve accuracy
- [x] Type checks pass
- [x] Build succeeds

#### Task 4.3: Handle Multi-Author Articles
**File**: `packages/shared/src/enhanced-metadata-extractor.ts`

**Actions**:
1. Detect multiple authors from JSON-LD or meta tags
2. Store primary author in creator field
3. Store secondary authors in `extendedMetadata.secondaryAuthors`

**Code Implementation**:
```typescript
function extractAuthors(metadata: any): {
  primary: string;
  secondary?: string[];
} {
  const authors = metadata.jsonLd?.author;
  
  if (Array.isArray(authors)) {
    return {
      primary: authors[0]?.name || authors[0],
      secondary: authors.slice(1).map(a => a?.name || a),
    };
  }
  
  return { primary: authors?.name || authors };
}
```

**Acceptance Criteria**:
- [x] Primary author extracted correctly
- [x] Secondary authors stored in array
- [x] Single-author articles handled correctly
- [x] Already implemented in Phase 1 (extractAllAuthors method)

**Testing**:
- [x] Logic implemented in extractAllAuthors method (Phase 1)
- [x] Parses JSON-LD author arrays
- [x] Falls back to meta tags
- [x] Primary author in articleMetadata.authorName
- [x] Secondary authors in articleMetadata.secondaryAuthors
- [x] Type checks pass

---

## Phase 5: Frontend - Article Display UI ✅ COMPLETED

**Duration**: 3-4 days
**Dependencies**: Phase 3 complete
**Owner**: Mobile Engineer
**Status**: ✅ Completed

### Tasks

#### Task 5.1: Update MediaRichBookmarkCard for Articles
**File**: `apps/mobile/components/MediaRichBookmarkCard.tsx`

**Actions**:
1. Show reading time instead of duration for articles
2. Display author name and avatar for articles
3. Hide play button overlay for articles
4. Show "Limited preview" indicator for paywalled content

**Code Changes**:
```typescript
// Line 68-80: Update display time logic
const displayTime = bookmark.contentType === 'article'
  ? bookmark.articleMetadata?.readingTime 
    ? `${bookmark.articleMetadata.readingTime} min read`
    : null
  : formattedDuration;

// Line 76-79: Update author name
const authorName = bookmark.contentType === 'article'
  ? bookmark.creator?.name || bookmark.articleMetadata?.authorName || 'Unknown Author'
  : bookmark.creator?.name || 'Unknown';

// Line 137-152: Hide play button for articles
const showPlayButton = ['video', 'podcast'].includes(bookmark.contentType);

// Add paywall indicator
{bookmark.articleMetadata?.isPaywalled && (
  <View style={styles.paywallBadge}>
    <Icon name="lock" size={12} />
    <Text style={styles.paywallText}>Limited preview</Text>
  </View>
)}
```

**Acceptance Criteria**:
- [x] Reading time displayed for articles (or nothing if unavailable)
- [x] Author name shown correctly with fallback logic
- [x] Play button hidden for articles (isMediaContent check)
- [x] Paywall indicator shown when applicable (🔒 Limited badge)
- [x] Publication date formatting updated for articles

**Testing**:
- [x] Logic implemented in MediaRichBookmarkCard component
- [x] displayTime computed based on content type
- [x] Author name prioritizes creator → articleMetadata.authorName
- [x] Paywall indicator with yellow badge (rgba(255, 193, 7, 0.9))
- [x] formatPublicationDate used for articles
- [x] Type checks pass

#### Task 5.2: Update CompactBookmarkCard for Articles
**File**: `apps/mobile/components/CompactBookmarkCard.tsx`

**Actions**:
1. Show reading time badge for articles
2. Display author avatar
3. Show paywall indicator

**Code Changes**:
```typescript
// Line 60-66: Update display duration
const displayDuration = bookmark.contentType === 'article'
  ? bookmark.articleMetadata?.readingTime
    ? `${bookmark.articleMetadata.readingTime} min read`
    : null
  : duration;

// Line 116-119: Update badge
{displayDuration && (
  <View style={styles.compactDurationBadge}>
    <Text style={styles.compactDurationText}>{displayDuration}</Text>
  </View>
)}
```

**Acceptance Criteria**:
- [x] Reading time badge shown for articles
- [x] Compact view maintains consistency
- [x] Author avatar displayed (via thumbnailUri logic)
- [x] Paywall indicator shown for paywalled articles

**Testing**:
- [x] Logic implemented in CompactBookmarkCard component
- [x] displayDuration computed with useMemo based on content type
- [x] Interface updated to include articleMetadata
- [x] Paywall badge shown (🔒 icon)
- [x] Type checks pass

#### Task 5.3: Add Publication Date Formatting
**File**: `apps/mobile/lib/dateUtils.ts`

**Actions**:
1. Add `formatPublicationDate()` helper
2. Show relative dates for recent articles (< 30 days)
3. Show absolute dates for older articles (≥ 30 days)

**Code Implementation**:
```typescript
export function formatPublicationDate(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 30) {
    // Relative format
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  
  // Absolute format
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
```

**Acceptance Criteria**:
- [x] Recent dates show relative format (< 30 days)
- [x] Old dates show absolute format (≥ 30 days)
- [x] Edge cases handled (today, yesterday, weeks)
- [x] Accepts multiple input types (number | string | Date)

**Testing**:
- [x] Function implemented in dateUtils.ts
- [x] Relative format: "Today", "Yesterday", "X days ago", "X weeks ago"
- [x] Absolute format: "Jan 15, 2024" (month short, day, year)
- [x] Type checks pass

#### Task 5.4: Display Publication Dates in Cards
**File**: `apps/mobile/components/MediaRichBookmarkCard.tsx`

**Actions**:
1. Show formatted publication date for articles
2. Position below title or author name

**Code Changes**:
```typescript
{bookmark.contentType === 'article' && bookmark.publishedAt && (
  <Text style={styles.publicationDate}>
    {formatPublicationDate(bookmark.publishedAt)}
  </Text>
)}
```

**Acceptance Criteria**:
- [x] Publication date displayed for articles
- [x] Date formatted correctly (relative/absolute)
- [x] Missing dates handled gracefully (conditional rendering)
- [x] Different format for articles vs other content types

**Testing**:
- [x] Logic implemented in MediaRichBookmarkCard component
- [x] Conditional formatting based on contentType
- [x] formatPublicationDate for articles
- [x] formatShortDate for other content
- [x] Type checks pass

---

## Phase 6: Frontend - Article Reader UI ✅ COMPLETED

**Duration**: 4-5 days
**Dependencies**: Phase 2, Phase 3 complete
**Owner**: Mobile Engineer
**Status**: ✅ Completed

### Tasks

#### Task 6.1: Create Article Reader Screen
**File**: `apps/mobile/app/(app)/article-reader.tsx` (new file)

**Actions**:
1. Create new screen for article reading
2. Fetch full-text content from API
3. Display article content in clean, readable format
4. Support both online and offline reading

**Code Structure**:
```typescript
export default function ArticleReaderScreen() {
  const { bookmarkId } = useLocalSearchParams();
  const { data: bookmark, isLoading } = useBookmarkDetail(bookmarkId);

  if (isLoading) return <LoadingSpinner />;
  if (!bookmark) return <ErrorView />;

  return (
    <ScrollView style={styles.container}>
      {/* Header: title, author, date */}
      <ArticleHeader bookmark={bookmark} />

      {/* Article content */}
      <ArticleContent
        html={bookmark.fullTextContent}
        fallbackUrl={bookmark.url}
      />

      {/* Footer: open in browser button */}
      <ArticleFooter url={bookmark.url} />
    </ScrollView>
  );
}
```

**Acceptance Criteria**:
- [x] Screen navigates from bookmark detail (via MediaRichBookmarkCard)
- [x] Article content fetched and displayed
- [x] Offline reading works with cached content (AsyncStorage)
- [x] Fallback to browser when content unavailable

**Testing**:
- [x] Screen created and rendering correctly
- [x] Loading and error states implemented
- [x] Navigation from MediaRichBookmarkCard for articles
- [x] Type checks pass
- [x] Build succeeds

#### Task 6.2: Create ArticleContent Component
**File**: `apps/mobile/components/ArticleContent.tsx` (new file)

**Actions**:
1. Render HTML content using `react-native-render-html`
2. Style for readability (font size, line height, spacing)
3. Handle images within content
4. Support text zoom controls

**Code Implementation**:
```typescript
export function ArticleContent({
  html,
  fallbackUrl
}: {
  html?: string;
  fallbackUrl: string;
}) {
  const [fontSize, setFontSize] = useState(16);

  if (!html) {
    return (
      <View style={styles.fallback}>
        <Text>Full text not available</Text>
        <Button onPress={() => Linking.openURL(fallbackUrl)}>
          Open in browser
        </Button>
      </View>
    );
  }

  return (
    <>
      <FontSizeControls
        fontSize={fontSize}
        onIncrease={() => setFontSize(f => f + 2)}
        onDecrease={() => setFontSize(f => f - 2)}
      />

      <RenderHtml
        contentWidth={width}
        source={{ html }}
        baseStyle={{ fontSize }}
        tagsStyles={articleStyles}
      />
    </>
  );
}
```

**Acceptance Criteria**:
- [x] HTML content rendered correctly using react-native-render-html
- [x] Formatting preserved (headings, paragraphs, lists, blockquotes, code)
- [x] Images displayed inline with proper styling
- [x] Font size adjustable (12-24px range)
- [x] External links open in browser
- [x] Fallback UI when content unavailable
- [x] "View Original Article" button in footer

**Testing**:
- [x] Component created with RenderHtml integration
- [x] Custom tagsStyles for all HTML elements
- [x] Font size controls with zoom in/out buttons
- [x] Link handling via Linking.openURL
- [x] Type checks pass
- [x] Build succeeds

#### Task 6.3: Add Offline Support
**File**: `apps/mobile/hooks/useBookmarkDetail.ts`

**Actions**:
1. Cache full-text content in local storage
2. Return cached content when offline
3. Update cache when online

**Code Implementation**:
```typescript
export function useBookmarkDetail(id: string) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['bookmark', id],
    queryFn: async () => {
      try {
        // Try fetching from API
        const bookmark = await api.getBookmark(id);

        // Cache full-text content
        if (bookmark.fullTextContent) {
          await AsyncStorage.setItem(
            `article-content-${id}`,
            bookmark.fullTextContent
          );
        }

        return bookmark;
      } catch (error) {
        // Offline: return cached content
        const cached = await AsyncStorage.getItem(`article-content-${id}`);
        if (cached) {
          return { ...cachedBookmark, fullTextContent: cached };
        }
        throw error;
      }
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}
```

**Acceptance Criteria**:
- [x] Full-text content cached on first load (AsyncStorage)
- [x] Cached content returned when offline (getCachedArticle helper)
- [x] Cache updated when online (cacheArticle helper)
- [x] Only articles with fullTextContent are cached
- [x] Fallback logic tries cache when API fails
- [x] Cache prefix: `article_content_{bookmarkId}`

**Testing**:
- [x] getCachedArticle and cacheArticle helpers implemented
- [x] Three-tier fallback: API → cache on error → cache on general failure
- [x] Only articles with full text content are cached
- [x] Type checks pass
- [x] Build succeeds

#### Task 6.4: Create ArticleHeader Component
**File**: `apps/mobile/components/ArticleHeader.tsx` (new file)

**Actions**:
1. Display article title
2. Show author name and avatar
3. Display publication date
4. Show reading time estimate

**Code Implementation**:
```typescript
export function ArticleHeader({ bookmark }: { bookmark: Bookmark }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{bookmark.title}</Text>

      <View style={styles.meta}>
        {bookmark.creator && (
          <View style={styles.author}>
            <Avatar uri={bookmark.creator.avatarUrl} size={32} />
            <Text style={styles.authorName}>{bookmark.creator.name}</Text>
          </View>
        )}

        {bookmark.publishedAt && (
          <Text style={styles.date}>
            {formatPublicationDate(bookmark.publishedAt)}
          </Text>
        )}

        {bookmark.articleMetadata?.readingTime && (
          <Text style={styles.readingTime}>
            {bookmark.articleMetadata.readingTime} min read
          </Text>
        )}
      </View>
    </View>
  );
}
```

**Acceptance Criteria**:
- [x] Title displayed prominently (28px, bold)
- [x] Author info shown with avatar (40px)
- [x] Publication date and reading time visible (formatPublicationDate)
- [x] Layout responsive with proper spacing
- [x] Paywall warning shown when applicable
- [x] Secondary author name displayed if different from creator
- [x] Divider separates header from content

**Testing**:
- [x] Component created with all metadata fields
- [x] Author avatar with fallback handling
- [x] Publication date formatted correctly
- [x] Reading time displayed
- [x] Paywall indicator with styled warning box
- [x] Type checks pass
- [x] Build succeeds

---

## Phase 7: Integration & Testing

**Duration**: 3-4 days  
**Dependencies**: All phases complete  
**Owner**: QA Engineer + Engineers

### Tasks

#### Task 7.1: End-to-End Testing
**Actions**:
1. Test complete bookmark save flow for various article sources
2. Test article display in bookmark list
3. Test article reader functionality
4. Test offline reading

**Test Cases**:
- [ ] Save Substack article → displays correctly
- [ ] Save Medium article → displays correctly
- [ ] Save personal blog article → displays correctly
- [ ] Save news article (NYT, Guardian) → displays correctly
- [ ] Save paywalled article → limited preview indicator shown
- [ ] Open article reader → content displays
- [ ] Read article offline → cached content shown
- [ ] Tap external link → opens in browser

#### Task 7.2: Edge Case Testing
**Actions**:
1. Test articles with missing metadata
2. Test very long/short articles
3. Test articles with special characters
4. Test articles with many images

**Test Cases**:
- [ ] Article without author → "Unknown Author" shown
- [ ] Article without image → placeholder shown
- [ ] Article without date → no date shown
- [ ] Very long article (10,000+ words) → renders without performance issues
- [ ] Very short article (< 100 words) → 1 min reading time
- [ ] Article with emojis in title → displays correctly
- [ ] Article with 20+ images → renders without crashing

#### Task 7.3: Performance Testing
**Actions**:
1. Test metadata extraction speed
2. Test full-text extraction speed
3. Test article reader render performance
4. Test offline cache performance

**Test Cases**:
- [ ] Metadata extraction completes in < 10s for 95% of articles
- [ ] Full-text extraction completes in < 15s for 95% of articles
- [ ] Article reader renders in < 2s
- [ ] Offline cache retrieval in < 500ms

#### Task 7.4: Cross-Platform Testing
**Actions**:
1. Test on iOS (simulator + device)
2. Test on Android (simulator + device)
3. Verify consistent behavior

**Test Cases**:
- [ ] iOS: Article cards display correctly
- [ ] iOS: Article reader works
- [ ] Android: Article cards display correctly
- [ ] Android: Article reader works
- [ ] Both: Offline reading works

#### Task 7.5: Accessibility Testing
**Actions**:
1. Test with VoiceOver (iOS) / TalkBack (Android)
2. Test with dynamic type sizes
3. Test with high contrast mode

**Test Cases**:
- [ ] Screen reader announces article title, author, reading time
- [ ] Reading time badge accessible
- [ ] Article content readable with screen reader
- [ ] Font size adjustments work
- [ ] High contrast mode renders correctly

#### Task 7.6: Documentation
**Actions**:
1. Update API documentation
2. Write user-facing documentation
3. Document known limitations

**Deliverables**:
- [ ] API docs updated with article metadata fields
- [ ] User guide: How to bookmark articles
- [ ] User guide: How to read articles offline
- [ ] Known limitations documented (e.g., paywall handling)

---

## Success Metrics

### Technical Metrics
- [ ] 95% of article bookmarks save successfully
- [ ] 80% of articles extract author and reading time
- [ ] 70% of articles include thumbnail image
- [ ] Metadata extraction completes in < 10s (95th percentile)

### User Metrics
- [ ] 30% of active users bookmark at least one article in first month
- [ ] 5% increase in bookmark creation overall
- [ ] < 1% error rate for article bookmarks

### Quality Metrics
- [ ] No crash reports related to article bookmarking
- [ ] < 5 bug reports per week
- [ ] Positive sentiment in user feedback

---

## Risk Assessment

### High Risk
1. **Full-text extraction failures**: Some sites block scraping
   - **Mitigation**: Fallback to opening in browser
   - **Owner**: Backend Engineer

2. **Performance on low-end devices**: Large articles may cause lag
   - **Mitigation**: Pagination or virtualization for very long articles
   - **Owner**: Mobile Engineer

### Medium Risk
3. **Paywalled content**: Limited metadata available
   - **Mitigation**: Show "Limited preview" indicator, allow manual metadata editing (future)
   - **Owner**: Product Manager

4. **Author deduplication accuracy**: False positives/negatives
   - **Mitigation**: Tune similarity threshold, allow manual merging (future)
   - **Owner**: Backend Engineer

### Low Risk
5. **Edge case handling**: Unusual article formats
   - **Mitigation**: Comprehensive testing, graceful degradation
   - **Owner**: QA Engineer

---

## Dependencies & Blockers

### External Dependencies
- None

### Internal Dependencies
- Database migration (Phase 0) must complete before other phases
- Backend work (Phases 1-4) must complete before frontend work (Phases 5-6)
- Article reader (Phase 6) depends on full-text extraction (Phase 2)

### Potential Blockers
- Migration failures in production D1 database
- Performance issues with full-text extraction
- HTML rendering library limitations on mobile

---

## Open Questions

1. **HTML rendering library**: Which library to use for mobile?
   - Options: `react-native-render-html`, `react-native-webview`
   - **Decision needed by**: Start of Phase 6

2. **Image optimization**: Should we optimize/compress article images?
   - **Decision needed by**: Phase 6 Task 6.2

3. **Cache expiration**: How long to keep cached article content?
   - **Decision needed by**: Phase 6 Task 6.3

4. **Author profile pages**: Should we build author profile pages in this phase?
   - **Decision**: Defer to post-MVP

---

## Post-MVP Enhancements

### Planned (Next Phase)
1. Enhanced author profiles with follow functionality
2. Article categorization and tagging
3. Manual metadata editing for corrections
4. Article highlights and annotations

### Future Considerations
5. AI-generated article summaries
6. Reading progress tracking
7. Related articles recommendations
8. RSS feed integration for authors
9. Personalized reading speed settings
10. Collaborative article annotations

---

## Conclusion

This implementation plan breaks down article bookmarking into 7 phases with clear tasks, dependencies, and acceptance criteria. Total timeline: 4-6 weeks for MVP completion.

**Next Steps**:
1. Review and approve plan with team
2. Assign owners to each phase
3. Create tickets in project management tool
4. Begin Phase 0: Database Migration
