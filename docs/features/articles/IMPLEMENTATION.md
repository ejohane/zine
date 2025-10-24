# Article Bookmarking - Implementation Plan

## Overview

This implementation plan breaks down the article bookmarking feature into independent, testable phases. Each phase can be developed, tested, and deployed separately while building toward the complete feature.

## Implementation Phases

### Phase 0: Database Schema Changes
**Duration**: 1-2 days
**Dependencies**: None
**Testable independently**: Yes

#### Objectives
- Add full-text content storage fields to `content` table
- Prepare database for article content storage and future offline reading

#### Tasks
1. Create database migration file
2. Add new columns to `content` table:
   - `full_text_content` (TEXT) - Cleaned article HTML/markdown
   - `full_text_extracted_at` (INTEGER) - Timestamp of extraction
3. Create index for full-text searches (future feature)
4. Update Drizzle schema definitions

#### Files to Create/Modify
- **Create**: `packages/api/migrations/XXXX_add_article_full_text.sql`
- **Modify**: `packages/api/src/schema.ts` (update content table schema)
- **Modify**: `packages/api/drizzle.config.ts` (if needed)

#### Migration SQL
```sql
-- Add full-text content storage for articles
ALTER TABLE content ADD COLUMN full_text_content TEXT;
ALTER TABLE content ADD COLUMN full_text_extracted_at INTEGER;

-- Add index for faster full-text searches (future feature)
CREATE INDEX idx_content_full_text ON content(full_text_content)
WHERE full_text_content IS NOT NULL;
```

#### Testing Strategy
- [ ] Run migration on local D1 database
- [ ] Verify schema changes: `PRAGMA table_info(content);`
- [ ] Test inserting content with full-text fields
- [ ] Test querying content with full-text index
- [ ] Verify migration rollback works correctly
- [ ] Run integration tests to ensure existing functionality works

#### Success Criteria
- ✅ Migration runs successfully without errors
- ✅ New columns exist in `content` table
- ✅ Index is created and functional
- ✅ Existing bookmarks continue to work
- ✅ Schema types are updated in TypeScript

---

### Phase 1: Article Metadata Extraction
**Duration**: 3-5 days
**Dependencies**: Phase 0 (schema changes)
**Testable independently**: Yes

#### Objectives
- Enhance metadata extraction for article-specific data
- Extract author, reading time, featured image, publication date
- Detect paywalled content
- Extract full-text content for offline reading

#### Tasks
1. **Enhance article detection**
   - Detect `og:type=article` in Open Graph tags
   - Identify article content type from structured data
   - Distinguish articles from posts, pages, and other content

2. **Extract article-specific metadata**
   - **Author extraction**:
     - Parse `article:author` meta tag
     - Extract from JSON-LD `author` or `creator` fields
     - Handle multiple authors (primary + secondary)
   - **Featured image**:
     - Priority: `og:image` → first content `<img>` → author avatar → favicon
   - **Word count**:
     - Count visible text content (exclude nav, footer, ads)
     - Strip HTML tags and scripts
   - **Reading time**:
     - Calculate: `Math.ceil(wordCount / 200)` (200 WPM standard)
   - **Publication date**:
     - Parse `article:published_time`, `datePublished`, `og:article:published_time`
     - Support various date formats
   - **Full-text content**:
     - Extract cleaned article HTML
     - Use Readability algorithm or similar
     - Strip ads, navigation, and clutter

3. **Detect paywalled content**
   - Identify login walls, subscription prompts
   - Set `isPaywalled` flag when metadata is limited

4. **Platform-specific extractors** (if needed)
   - Medium: Extract from Medium-specific metadata
   - dev.to: Extract from dev.to structured data
   - Ghost: Support Ghost blog metadata

#### Files to Modify
- **Modify**: `packages/shared/src/enhanced-metadata-extractor.ts`
  - Update `extractEnhancedWebMetadata()` function
  - Update `extractCreator()` for article authors
  - Add `extractArticleContent()` helper
  - Add `detectPaywallStatus()` helper

#### Testing Strategy
- [ ] **Unit tests** for article metadata extraction:
  - Test with sample HTML from various platforms
  - Test Substack, Medium, personal blogs, news sites
  - Test articles with/without author, images, dates
  - Test paywalled content detection
- [ ] **Reading time calculation tests**:
  - Verify 200 WPM standard
  - Test with short (<500 words) and long (10,000+ words) articles
- [ ] **Author extraction tests**:
  - Single author
  - Multiple authors
  - No author (use "Unknown Author")
- [ ] **Featured image priority tests**:
  - og:image present
  - No og:image, use content image
  - No images, use author avatar
  - Fallback to favicon
- [ ] **Full-text extraction tests**:
  - Clean HTML extraction
  - Handle malformed HTML
  - Preserve basic formatting (headings, paragraphs, lists)

#### Test Data
Create sample HTML fixtures for:
- Substack article (with author, image, date)
- Medium article (member-only, paywalled)
- Personal blog (minimal metadata)
- News article (NYT, Guardian style)
- Article without author
- Article without images

#### Success Criteria
- ✅ 80%+ of test articles extract author name
- ✅ 90%+ of test articles extract word count and reading time
- ✅ 70%+ of test articles extract featured image
- ✅ Paywalled content is correctly identified
- ✅ Full-text content is extracted when available
- ✅ No regressions in existing video/podcast extraction

---

### Phase 2: Creator Service - Author Deduplication
**Duration**: 2-3 days
**Dependencies**: Phase 1 (metadata extraction)
**Testable independently**: Yes

#### Objectives
- Implement fuzzy name matching for author deduplication
- Prevent duplicate author records across platforms
- Merge author metadata from multiple sources

#### Tasks
1. **Implement name similarity algorithm**
   - Use Levenshtein distance or Jaro-Winkler similarity
   - Normalize names: lowercase, remove punctuation, trim whitespace
   - Calculate similarity score (0-1 scale)

2. **Create author matching logic**
   - Match threshold: similarity > 0.85
   - Consider domain-based matching (same author from same domain)
   - Handle name variations:
     - "John Doe" ↔ "J. Doe" ↔ "John A. Doe"
     - "johndoe" ↔ "john_doe" ↔ "@johndoe"

3. **Update creator resolution**
   - Check for similar existing authors before creating new ones
   - Merge metadata from multiple sources (prefer most complete)
   - Link articles to existing creator records

4. **Handle edge cases**
   - Different people with same name
   - Same person with different names on different platforms
   - Conflicting metadata (different avatars, bios)

#### Files to Modify
- **Modify**: `packages/shared/src/creator-service.ts`
  - Add `calculateNameSimilarity()` function
  - Add `normalizeName()` helper
  - Add `findSimilarCreators()` function
  - Update `resolveCreator()` to use fuzzy matching

#### Implementation Example
```typescript
function calculateNameSimilarity(name1: string, name2: string): number {
  const normalized1 = normalizeName(name1);
  const normalized2 = normalizeName(name2);

  // Exact match
  if (normalized1 === normalized2) return 1.0;

  // Substring match
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return 0.9;
  }

  // Levenshtein distance
  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);
  return 1 - (distance / maxLength);
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
}
```

#### Testing Strategy
- [ ] **Unit tests for name similarity**:
  - Exact matches: "John Doe" = "John Doe" (1.0)
  - Initials: "John Doe" ≈ "J. Doe" (>0.85)
  - Middle names: "John Doe" ≈ "John A. Doe" (>0.85)
  - Handles: "johndoe" ≈ "john_doe" (>0.85)
  - Different people: "John Doe" ≠ "Jane Doe" (<0.85)
- [ ] **Integration tests for author deduplication**:
  - Same author on Substack and personal blog
  - Same author with name variations
  - Different authors with similar names
- [ ] **Merge metadata tests**:
  - Prefer record with avatar when one has, one doesn't
  - Prefer longer bio
  - Merge platform lists

#### Test Cases
```typescript
describe('Author Deduplication', () => {
  it('should match exact names', () => {
    expect(calculateNameSimilarity('John Doe', 'John Doe')).toBe(1.0);
  });

  it('should match name with initials', () => {
    expect(calculateNameSimilarity('John Doe', 'J. Doe')).toBeGreaterThan(0.85);
  });

  it('should not match different people', () => {
    expect(calculateNameSimilarity('John Doe', 'Jane Smith')).toBeLessThan(0.85);
  });

  it('should merge metadata from multiple sources', async () => {
    const creator1 = { name: 'John Doe', avatarUrl: null, bio: 'Writer' };
    const creator2 = { name: 'J. Doe', avatarUrl: 'https://...', bio: null };
    const merged = await resolveCreator(creator2);
    expect(merged.avatarUrl).toBe('https://...');
    expect(merged.bio).toBe('Writer');
  });
});
```

#### Success Criteria
- ✅ Name similarity algorithm works accurately (>95% on test cases)
- ✅ Authors are deduplicated across platforms
- ✅ Metadata is correctly merged
- ✅ No false positives (different people matched as same)
- ✅ Performance is acceptable (<100ms per author lookup)

---

### Phase 3: Backend Storage - Repository Updates
**Duration**: 2-3 days
**Dependencies**: Phase 1 (metadata extraction), Phase 2 (author deduplication)
**Testable independently**: Yes

#### Objectives
- Persist article metadata to database
- Link articles to author creators
- Store full-text content for offline reading
- Ensure metadata round-trip (save → retrieve → matches)

#### Tasks
1. **Update D1 Repository**
   - Map `articleMetadata` to `content.extendedMetadata` JSON field
   - Persist `wordCount`, `readingTime`, `secondaryAuthors`, `isPaywalled`
   - Store `fullTextContent` and `fullTextExtractedAt`
   - Ensure `creatorId` is set for article authors

2. **Update Content Repository**
   - Handle article-specific fields in `createWithMetadata()`
   - Parse `extendedMetadata` JSON in `mapRowToBookmark()`
   - Include creator data for article authors

3. **Data validation**
   - Validate article metadata against Zod schema
   - Ensure required fields are present
   - Handle missing optional fields gracefully

#### Files to Modify
- **Modify**: `packages/api/src/d1-repository.ts`
  - Update `createWithMetadata()` function
  - Update `mapRowToBookmark()` helper
  - Add article-specific field mappings
- **Modify**: `packages/api/src/repositories/content-repository.ts` (if needed)

#### Implementation Example
```typescript
// In createWithMetadata()
const extendedMetadata = {
  ...existing,
  ...(bookmark.articleMetadata && {
    authorName: bookmark.articleMetadata.authorName,
    wordCount: bookmark.articleMetadata.wordCount,
    readingTime: bookmark.articleMetadata.readingTime,
    secondaryAuthors: bookmark.articleMetadata.secondaryAuthors,
    isPaywalled: bookmark.articleMetadata.isPaywalled,
  }),
};

await db.insert(content).values({
  ...existingFields,
  fullTextContent: bookmark.fullTextContent,
  fullTextExtractedAt: bookmark.fullTextContent ? Date.now() : null,
  extendedMetadata: JSON.stringify(extendedMetadata),
});

// In mapRowToBookmark()
const articleMetadata = row.content_type === 'article' ? {
  authorName: extendedMetadata?.authorName,
  wordCount: extendedMetadata?.wordCount,
  readingTime: extendedMetadata?.readingTime,
  secondaryAuthors: extendedMetadata?.secondaryAuthors,
  isPaywalled: extendedMetadata?.isPaywalled,
} : undefined;
```

#### Testing Strategy
- [ ] **Integration tests for article bookmark creation**:
  - Create article bookmark with full metadata
  - Create article bookmark with minimal metadata
  - Create article without author
  - Create paywalled article
- [ ] **Metadata round-trip tests**:
  - Save article → retrieve → verify all fields match
  - Test with various metadata combinations
- [ ] **Creator linkage tests**:
  - Verify `creatorId` is set for articles with authors
  - Test author deduplication in storage
- [ ] **Full-text storage tests**:
  - Verify `fullTextContent` is stored
  - Verify `fullTextExtractedAt` timestamp
  - Test retrieval of full-text content
- [ ] **Edge case tests**:
  - Missing optional fields
  - Very long article content
  - Special characters in metadata
  - Multiple authors

#### Test Cases
```typescript
describe('Article Bookmark Storage', () => {
  it('should save article with full metadata', async () => {
    const bookmark = await saveBookmark({
      url: 'https://example.com/article',
      articleMetadata: {
        authorName: 'John Doe',
        wordCount: 1500,
        readingTime: 8,
      },
      fullTextContent: '<article>...</article>',
    });

    expect(bookmark.articleMetadata?.authorName).toBe('John Doe');
    expect(bookmark.articleMetadata?.readingTime).toBe(8);
    expect(bookmark.fullTextContent).toBeDefined();
  });

  it('should link article to creator', async () => {
    const bookmark = await saveBookmark({
      url: 'https://example.com/article',
      creator: { name: 'John Doe' },
    });

    expect(bookmark.creatorId).toBeDefined();
    expect(bookmark.creator?.name).toBe('John Doe');
  });
});
```

#### Success Criteria
- ✅ Article metadata is correctly persisted to database
- ✅ Metadata round-trip works (save → retrieve → matches)
- ✅ Creator linkage works for article authors
- ✅ Full-text content is stored when available
- ✅ No data loss for existing bookmarks
- ✅ Performance is acceptable (<500ms per bookmark save)

---

### Phase 4: Mobile UI - Article Card Display
**Duration**: 3-4 days
**Dependencies**: Phase 3 (backend storage)
**Testable independently**: Yes

#### Objectives
- Display article bookmarks with rich metadata
- Show reading time, author, publication date
- Visual consistency with video/podcast cards
- Handle paywalled content indicator

#### Tasks
1. **Update MediaRichBookmarkCard**
   - Replace duration with reading time for articles
   - Show author name and avatar for articles
   - Display publication date (relative for <30 days, absolute for ≥30 days)
   - Show "Limited preview" indicator for paywalled content
   - Hide play button for articles

2. **Update CompactBookmarkCard**
   - Show reading time badge for articles
   - Display author avatar
   - Show "Limited preview" chip for paywalled content

3. **Create date formatting utility**
   - Add `formatPublicationDate()` function
   - Handle relative dates ("2 days ago", "3 weeks ago")
   - Handle absolute dates ("Jan 15, 2023")

4. **Handle article-specific icons**
   - Use `file-text` icon for articles
   - Show lock icon for paywalled content
   - Use article content type color

#### Files to Modify
- **Modify**: `apps/mobile/components/MediaRichBookmarkCard.tsx`
- **Modify**: `apps/mobile/components/CompactBookmarkCard.tsx`
- **Create**: `apps/mobile/lib/dateUtils.ts` (or modify if exists)

#### Implementation Example - MediaRichBookmarkCard.tsx
```typescript
// Replace duration with reading time for articles
const displayTime = bookmark.contentType === 'article'
  ? bookmark.articleMetadata?.readingTime
    ? `${bookmark.articleMetadata.readingTime} min read`
    : null  // Show nothing if reading time unavailable
  : formatDuration(duration);

// Use article author instead of channel/show
const authorName = bookmark.contentType === 'article'
  ? bookmark.creator?.name || bookmark.articleMetadata?.authorName
  : bookmark.creator?.name;

// Show "Limited preview" indicator for paywalled content
const isPaywalled = bookmark.articleMetadata?.isPaywalled;

// Hide play button for articles
const showPlayButton = bookmark.contentType !== 'article';

// Format publication date
const formattedDate = bookmark.publishedAt
  ? formatPublicationDate(bookmark.publishedAt)
  : null;
```

#### Implementation Example - dateUtils.ts
```typescript
export function formatPublicationDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Recent (< 30 days): relative format
  if (diffDays < 30) {
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return '1 week ago';
    if (diffDays < 21) return '2 weeks ago';
    return '3 weeks ago';
  }

  // Older (≥ 30 days): absolute format
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }); // "Jan 15, 2023"
}
```

#### Testing Strategy
- [ ] **Visual regression tests**:
  - Screenshot tests for article cards on iOS/Android
  - Compare with video/podcast cards for consistency
- [ ] **Component tests**:
  - Render article with full metadata
  - Render article without reading time
  - Render article without author
  - Render paywalled article
  - Test publication date formatting (recent vs. old)
- [ ] **Manual testing checklist**:
  - [ ] Article card displays correctly in list view
  - [ ] Reading time badge shows "X min read"
  - [ ] Author name and avatar display
  - [ ] Publication date shows relative/absolute correctly
  - [ ] Paywalled indicator shows when appropriate
  - [ ] Play button is hidden for articles
  - [ ] Tapping card opens article (next phase)
  - [ ] Long-press shows options menu
- [ ] **Accessibility tests**:
  - Screen reader reads article metadata correctly
  - Sufficient color contrast for all text
  - Touch targets are large enough

#### Test Cases
```typescript
describe('MediaRichBookmarkCard - Article', () => {
  it('should display reading time for articles', () => {
    const bookmark = createArticleBookmark({ readingTime: 5 });
    render(<MediaRichBookmarkCard bookmark={bookmark} />);
    expect(screen.getByText('5 min read')).toBeVisible();
  });

  it('should display author name and avatar', () => {
    const bookmark = createArticleBookmark({
      creator: { name: 'John Doe', avatarUrl: 'https://...' }
    });
    render(<MediaRichBookmarkCard bookmark={bookmark} />);
    expect(screen.getByText('John Doe')).toBeVisible();
  });

  it('should show paywalled indicator', () => {
    const bookmark = createArticleBookmark({ isPaywalled: true });
    render(<MediaRichBookmarkCard bookmark={bookmark} />);
    expect(screen.getByText('Limited preview')).toBeVisible();
  });

  it('should not show reading time if unavailable', () => {
    const bookmark = createArticleBookmark({ readingTime: undefined });
    render(<MediaRichBookmarkCard bookmark={bookmark} />);
    expect(screen.queryByText(/min read/)).toBeNull();
  });
});
```

#### Success Criteria
- ✅ Article cards display with reading time badge
- ✅ Author name and avatar are shown correctly
- ✅ Publication dates use relative/absolute format
- ✅ Paywalled indicator shows when appropriate
- ✅ Visual consistency with video/podcast cards
- ✅ Accessibility requirements met
- ✅ No UI glitches or layout issues

---

### Phase 5: Mobile UI - In-App Article Reader
**Duration**: 4-5 days
**Dependencies**: Phase 4 (article card display)
**Testable independently**: Yes

#### Objectives
- Display full-text article content in-app
- Provide clean, readable article view
- Support offline reading
- Handle images and basic formatting

#### Tasks
1. **Create ArticleReader component**
   - Display article title, author, publication date
   - Render full-text content (HTML or markdown)
   - Support text zoom/font size controls
   - Handle images within article content
   - Open external links in system browser
   - Provide "Open in browser" button

2. **Implement article content fetching**
   - Fetch full-text content from API
   - Cache content for offline reading
   - Handle missing content (fallback to external URL)

3. **Style article content**
   - Clean, distraction-free reading experience
   - Preserve basic formatting (headings, paragraphs, lists, quotes)
   - Responsive text sizing
   - Dark mode support

4. **Navigation integration**
   - Open ArticleReader when tapping article bookmark
   - Back button to return to bookmark list
   - Share article functionality

#### Files to Create/Modify
- **Create**: `apps/mobile/components/ArticleReader.tsx`
- **Create**: `apps/mobile/hooks/useArticleContent.ts`
- **Modify**: `apps/mobile/app/(tabs)/bookmarks/index.tsx` (or bookmark detail screen)
- **Create**: `apps/mobile/components/ArticleContent.tsx` (HTML renderer)

#### Implementation Example - ArticleReader.tsx
```typescript
import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useArticleContent } from '@/hooks/useArticleContent';
import { ArticleContent } from '@/components/ArticleContent';
import { Bookmark } from '@zine/shared';

interface ArticleReaderProps {
  bookmark: Bookmark;
  onClose: () => void;
}

export function ArticleReader({ bookmark, onClose }: ArticleReaderProps) {
  const { data: content, isLoading, error } = useArticleContent(bookmark.id);

  if (isLoading) return <LoadingSpinner />;
  if (error || !content) return <ErrorView onOpenBrowser={openExternalUrl} />;

  return (
    <ScrollView>
      <View style={styles.header}>
        <Pressable onPress={onClose}>
          <Text>← Back</Text>
        </Pressable>
        <Pressable onPress={openExternalUrl}>
          <Text>Open in browser</Text>
        </Pressable>
      </View>

      <View style={styles.article}>
        <Text style={styles.title}>{bookmark.title}</Text>

        {bookmark.creator && (
          <View style={styles.author}>
            <Image source={{ uri: bookmark.creator.avatarUrl }} />
            <Text>{bookmark.creator.name}</Text>
          </View>
        )}

        {bookmark.publishedAt && (
          <Text style={styles.date}>
            {formatPublicationDate(bookmark.publishedAt)}
          </Text>
        )}

        <ArticleContent html={content.fullTextContent} />
      </View>
    </ScrollView>
  );
}
```

#### Implementation Example - useArticleContent.ts
```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useArticleContent(bookmarkId: string) {
  return useQuery({
    queryKey: ['article-content', bookmarkId],
    queryFn: () => api.getArticleContent(bookmarkId),
    staleTime: Infinity, // Cache indefinitely for offline reading
  });
}
```

#### Implementation Example - ArticleContent.tsx
```typescript
import React from 'react';
import { WebView } from 'react-native-webview';
import { useColorScheme } from 'react-native';

interface ArticleContentProps {
  html: string;
}

export function ArticleContent({ html }: ArticleContentProps) {
  const colorScheme = useColorScheme();

  // Wrap HTML in styled template
  const styledHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
          font-size: 18px;
          line-height: 1.6;
          padding: 20px;
          background: ${colorScheme === 'dark' ? '#1a1a1a' : '#ffffff'};
          color: ${colorScheme === 'dark' ? '#e0e0e0' : '#333333'};
        }
        img { max-width: 100%; height: auto; }
        a { color: #007AFF; }
        blockquote { border-left: 3px solid #ddd; padding-left: 16px; }
      </style>
    </head>
    <body>${html}</body>
    </html>
  `;

  return (
    <WebView
      source={{ html: styledHtml }}
      style={{ flex: 1 }}
      onShouldStartLoadWithRequest={(request) => {
        // Open external links in system browser
        if (request.url !== 'about:blank') {
          Linking.openURL(request.url);
          return false;
        }
        return true;
      }}
    />
  );
}
```

#### Testing Strategy
- [ ] **Component tests**:
  - Render article with full content
  - Render article without full content (show error)
  - Test loading state
  - Test error state with "Open in browser" fallback
- [ ] **Integration tests**:
  - Fetch article content from API
  - Cache content for offline reading
  - Open external links in browser
- [ ] **Manual testing checklist**:
  - [ ] Article opens in reader view when tapped
  - [ ] Title, author, date display correctly
  - [ ] Article content renders properly
  - [ ] Images load and display
  - [ ] Text is readable (font size, line height)
  - [ ] Dark mode works correctly
  - [ ] External links open in browser
  - [ ] "Open in browser" button works
  - [ ] Back button returns to bookmark list
  - [ ] Offline reading works (cached content)
  - [ ] Scroll performance is smooth
- [ ] **Accessibility tests**:
  - Screen reader reads article content
  - Text can be zoomed
  - Sufficient color contrast in light/dark mode

#### Test Cases
```typescript
describe('ArticleReader', () => {
  it('should display article content', async () => {
    const bookmark = createArticleBookmark();
    render(<ArticleReader bookmark={bookmark} onClose={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(bookmark.title)).toBeVisible();
    });
  });

  it('should show error and open browser button when content unavailable', () => {
    mockApiError();
    const bookmark = createArticleBookmark();
    render(<ArticleReader bookmark={bookmark} onClose={jest.fn()} />);

    expect(screen.getByText('Open in browser')).toBeVisible();
  });

  it('should work offline with cached content', async () => {
    const bookmark = createArticleBookmark();
    // Cache content
    await cacheArticleContent(bookmark.id);
    // Go offline
    mockOfflineMode();

    render(<ArticleReader bookmark={bookmark} onClose={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(bookmark.title)).toBeVisible();
    });
  });
});
```

#### Success Criteria
- ✅ Article content displays in clean, readable format
- ✅ Images render correctly within articles
- ✅ External links open in system browser
- ✅ Offline reading works with cached content
- ✅ Dark mode is supported
- ✅ "Open in browser" fallback works
- ✅ Performance is smooth (no lag when scrolling)
- ✅ Accessibility requirements met

---

### Phase 6: Integration Testing & Polish
**Duration**: 2-3 days
**Dependencies**: All previous phases
**Testable independently**: No (integration phase)

#### Objectives
- End-to-end testing of complete article feature
- Fix bugs and edge cases
- Performance optimization
- Documentation

#### Tasks
1. **End-to-end testing**
   - Test complete flow: paste URL → save → view in list → read article
   - Test with various article sources
   - Test error scenarios

2. **Edge case handling**
   - No author, no image, no date
   - Very long articles
   - Paywalled content
   - JavaScript-rendered articles

3. **Performance optimization**
   - Metadata extraction timeout handling
   - Image loading optimization
   - Database query optimization

4. **Documentation**
   - Update API documentation
   - Add code comments
   - Create user-facing documentation (if needed)

#### Testing Checklist
- [ ] **Article sources**:
  - [ ] Substack article
  - [ ] Medium article (free)
  - [ ] Medium article (paywalled)
  - [ ] Personal blog (WordPress, Ghost, custom)
  - [ ] News article (NYT, Guardian, etc.)
  - [ ] Technical blog (dev.to, Hashnode)
  - [ ] Academic article
- [ ] **Metadata variations**:
  - [ ] Article with full metadata
  - [ ] Article without author
  - [ ] Article without featured image
  - [ ] Article without publication date
  - [ ] Article without word count
  - [ ] Multi-author article
- [ ] **Content variations**:
  - [ ] Short article (<500 words)
  - [ ] Medium article (500-2000 words)
  - [ ] Long article (>5000 words)
  - [ ] Article with many images
  - [ ] Article with embedded videos
  - [ ] Article with code blocks
- [ ] **Error scenarios**:
  - [ ] Invalid URL
  - [ ] 404 page
  - [ ] Timeout during extraction
  - [ ] Network error during save
  - [ ] Offline mode
- [ ] **User flows**:
  - [ ] Save article from share extension (if implemented)
  - [ ] Save article by pasting URL
  - [ ] View article in list
  - [ ] Read article in-app
  - [ ] Open article in browser
  - [ ] Delete article bookmark

#### Performance Benchmarks
- Metadata extraction: <10 seconds (95th percentile)
- Full-text extraction: <15 seconds (95th percentile)
- Article card render: <100ms
- Article reader open: <500ms
- Offline article load: <200ms

#### Success Criteria
- ✅ All test cases pass
- ✅ No critical bugs
- ✅ Performance benchmarks met
- ✅ Documentation is complete
- ✅ Code is reviewed and approved

---

## Rollout Strategy

### Beta Testing
1. **Internal testing** (1 week)
   - Test with team members
   - Collect feedback on usability
   - Fix critical bugs

2. **Limited rollout** (1-2 weeks)
   - Enable for 10% of users
   - Monitor error rates and performance
   - Collect user feedback

3. **Full rollout** (1 week)
   - Enable for all users
   - Monitor adoption metrics
   - Iterate based on feedback

### Monitoring & Metrics
- **Adoption**: % of users who bookmark articles
- **Metadata quality**: % of articles with author, reading time, image
- **Error rates**: Failed metadata extractions
- **Performance**: p50, p95, p99 for extraction time
- **User satisfaction**: App store ratings, support tickets

---

## Risk Mitigation

### Technical Risks
1. **Metadata extraction failures**
   - **Mitigation**: Fallback to basic title + URL
   - **Monitoring**: Track extraction success rate

2. **Full-text extraction quality**
   - **Mitigation**: Use proven Readability algorithm
   - **Monitoring**: Manual spot checks of extraction quality

3. **Database storage limits**
   - **Mitigation**: Monitor D1 storage usage
   - **Plan**: Implement content cleanup for old articles if needed

4. **Performance degradation**
   - **Mitigation**: Set strict timeouts, optimize queries
   - **Monitoring**: Track p95 response times

### Product Risks
1. **Low adoption**
   - **Mitigation**: Promote feature in onboarding, release notes
   - **Monitoring**: Track bookmark creation by content type

2. **Poor metadata quality**
   - **Mitigation**: Test with diverse article sources
   - **Plan**: Iterate on extraction logic based on real data

3. **User confusion**
   - **Mitigation**: Clear UI labels, onboarding tooltips
   - **Monitoring**: Track support tickets, user feedback

---

## Dependencies & Prerequisites

### External Dependencies
- Cloudflare Workers (existing)
- Cloudflare D1 (existing)
- Clerk authentication (existing)
- Expo / React Native (existing)

### Internal Dependencies
- Enhanced metadata extractor (existing, needs updates)
- Content repository (existing, needs updates)
- Creator service (existing, needs updates)
- Mobile UI components (existing, needs updates)

### Team Dependencies
- **Backend engineer**: Phases 0-3
- **Mobile engineer**: Phases 4-5
- **QA engineer**: Phase 6
- **Product manager**: Acceptance testing, rollout

---

## Timeline Summary

| Phase | Duration | Team | Can Start |
|-------|----------|------|-----------|
| Phase 0: Database Schema | 1-2 days | Backend | Immediately |
| Phase 1: Metadata Extraction | 3-5 days | Backend | After Phase 0 |
| Phase 2: Author Deduplication | 2-3 days | Backend | After Phase 1 |
| Phase 3: Backend Storage | 2-3 days | Backend | After Phase 1-2 |
| Phase 4: Mobile Card UI | 3-4 days | Mobile | After Phase 3 |
| Phase 5: Mobile Reader UI | 4-5 days | Mobile | After Phase 4 |
| Phase 6: Integration Testing | 2-3 days | Full team | After Phase 5 |

**Total duration**: ~18-25 days (3-5 weeks)

**Parallelization opportunities**:
- Phase 2 and 3 can partially overlap (both depend on Phase 1)
- Phase 4 and 5 can have some overlap (UI work can start with mock data)

---

## Success Metrics (Post-Launch)

### Week 1
- [ ] 0 critical bugs reported
- [ ] <5% error rate on metadata extraction
- [ ] >50% of articles have author + reading time

### Month 1
- [ ] 30%+ of active users bookmark at least one article
- [ ] 80%+ of article bookmarks successfully extract author and reading time
- [ ] 70%+ of article bookmarks include thumbnail image
- [ ] <10% support tickets related to article bookmarks

### Month 3
- [ ] 50%+ of active users bookmark articles regularly
- [ ] Feature parity achieved with video/podcast bookmarks
- [ ] Positive user feedback on article reading experience

---

## Future Enhancements (Post-MVP)

Prioritized list for next iterations:

1. **Article highlights & annotations** (high user value)
2. **Reading progress tracking** (sync across devices)
3. **Article collections** (organize by topic)
4. **Article summarization** (AI-powered)
5. **Related articles** (content recommendations)
6. **RSS integration** (follow author feeds)
7. **Personalized reading speed** (adjust WPM)
8. **Manual metadata editing** (fix errors)

---

## Appendix

### Code Review Checklist
- [ ] All TypeScript types are correct
- [ ] Zod schemas validate all inputs
- [ ] Error handling is comprehensive
- [ ] Database queries are optimized
- [ ] UI components are accessible
- [ ] Tests have good coverage
- [ ] Code follows project conventions
- [ ] No security vulnerabilities

### Deployment Checklist
- [ ] Database migration tested
- [ ] Environment variables set
- [ ] API endpoints documented
- [ ] Mobile app builds successfully
- [ ] Release notes prepared
- [ ] Analytics events configured
- [ ] Error monitoring configured

### Rollback Plan
If critical issues are discovered:
1. **Immediate**: Disable article bookmarking in mobile app (feature flag)
2. **Short-term**: Fix bugs, test thoroughly
3. **Re-enable**: Gradual rollout (10% → 50% → 100%)
