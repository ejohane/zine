# Article Bookmarking - Implementation Summary

This document provides a quick reference for implementing article bookmarking based on the decisions made in the PRD and Design documents.

## Key Decisions Summary

| Decision Area | Choice | Rationale |
|--------------|--------|-----------|
| **Multiple Authors** | Store primary in `creator`, others in `extendedMetadata.secondaryAuthors` | Simple for MVP, extensible later |
| **Reading Speed** | Standard 200 WPM for everyone | Predictable, simple implementation |
| **Paywalled Content** | Extract what's available + show "Limited preview" indicator | Best user experience without complexity |
| **Article Categories** | Generic "article" type only | Avoid premature categorization |
| **Featured Image** | `og:image` → content img → author avatar → favicon | Balance quality with availability |
| **Author Deduplication** | Fuzzy matching (85% similarity threshold) | Unified author experience |
| **Missing Reading Time** | Show nothing | Don't show inaccurate estimates |
| **Full-Text Storage** | Add schema fields, extract content | Enable future offline reading |
| **Publication Dates** | Relative < 30 days, absolute ≥ 30 days | Standard UX pattern |
| **Update Tracking** | Out of scope | Defer complexity |

## Schema Changes Required

### Migration: `XXXX_add_article_full_text.sql`

```sql
-- Add full-text content storage for articles
ALTER TABLE content ADD COLUMN full_text_content TEXT;
ALTER TABLE content ADD COLUMN full_text_extracted_at INTEGER;

-- Add index for faster full-text searches (future feature)
CREATE INDEX idx_content_full_text ON content(full_text_content) 
WHERE full_text_content IS NOT NULL;
```

### Updated Content Table Structure

```typescript
// New fields in content table
{
  // ... existing fields ...
  
  // NEW: Full-text content (for future offline reading)
  fullTextContent?: string,      // Cleaned article HTML/markdown
  fullTextExtractedAt?: timestamp,
  
  // Extended metadata (JSON field) - UPDATED
  extendedMetadata: {
    authorName?: string,          // Primary author
    secondaryAuthors?: string[],  // Additional authors
    wordCount?: number,
    readingTime?: number,         // In minutes (200 WPM standard)
    isPaywalled?: boolean,        // Limited metadata indicator
  }
}
```

## Implementation Phases

### Phase 0: Database Migration ✅
- [ ] Create migration file
- [ ] Add `full_text_content` and `full_text_extracted_at` columns
- [ ] Add index for full-text searches
- [ ] Test migration locally

### Phase 1: Metadata Extraction ⚠️
**File:** `packages/shared/src/enhanced-metadata-extractor.ts`

**Tasks:**
- [ ] Enhance `extractEnhancedWebMetadata()`:
  - [ ] Prioritize article-specific OG tags
  - [ ] Extract word count from visible text
  - [ ] Calculate reading time (200 WPM)
  - [ ] Implement featured image priority logic
  - [ ] Extract full-text content (cleaned HTML)
- [ ] Update `extractCreator()`:
  - [ ] Parse `article:author` meta tag
  - [ ] Handle multiple authors
  - [ ] Create unique author IDs
- [ ] Add paywalled content detection:
  - [ ] Detect login walls, subscription prompts
  - [ ] Set `isPaywalled` flag

### Phase 2: Storage & Repository ⚠️
**Files:** `packages/api/src/d1-repository.ts`, `packages/api/src/repositories/content-repository.ts`

**Tasks:**
- [ ] Update `createWithMetadata()`:
  - [ ] Map `articleMetadata` to `extendedMetadata` JSON
  - [ ] Store `fullTextContent` and `fullTextExtractedAt`
  - [ ] Ensure `creatorId` linkage
- [ ] Update `mapRowToBookmark()`:
  - [ ] Parse `extendedMetadata` to `articleMetadata`
  - [ ] Extract `isPaywalled` flag

### Phase 3: UI Components ⚠️
**Files:** 
- `apps/mobile/components/MediaRichBookmarkCard.tsx`
- `apps/mobile/components/CompactBookmarkCard.tsx`
- `apps/mobile/lib/dateUtils.ts`

**Tasks:**
- [ ] Update `MediaRichBookmarkCard`:
  - [ ] Show reading time instead of duration for articles
  - [ ] Display author avatar/name
  - [ ] Add "Limited preview" indicator for paywalled content
- [ ] Update `CompactBookmarkCard`:
  - [ ] Show reading time badge
  - [ ] Display author avatar
  - [ ] Show paywalled indicator
- [ ] Add `formatPublicationDate()` utility:
  - [ ] Relative for < 30 days
  - [ ] Absolute for ≥ 30 days

### Phase 4: Author Deduplication ⚠️
**File:** `packages/shared/src/creator-service.ts`

**Tasks:**
- [ ] Implement name similarity algorithm:
  - [ ] Normalize names (lowercase, remove punctuation)
  - [ ] Calculate Levenshtein distance or similar
  - [ ] Match with 85% threshold
- [ ] Update `resolveCreator()`:
  - [ ] Check existing creators before creating new
  - [ ] Handle name variations (John Doe ↔ J. Doe)
  - [ ] Consider domain-based matching

## Code Snippets

### Featured Image Priority Logic

```typescript
// In extractImages() method
const getArticleThumbnail = (jsonLdData, metaTags, document, url) => {
  // 1. Try og:image first
  let thumbnailUrl = metaTags.get('og:image');
  
  // 2. Fall back to first content image
  if (!thumbnailUrl) {
    const images = document.querySelectorAll('article img, .post-content img, main img');
    for (const img of images) {
      const src = img.getAttribute('src');
      if (src && !src.includes('icon') && !src.includes('logo') && !src.includes('avatar')) {
        thumbnailUrl = this.resolveUrl(src, url);
        break;
      }
    }
  }
  
  // 3. Fall back to author avatar (extracted separately)
  // 4. Fall back to favicon (existing logic)
  
  return thumbnailUrl;
}
```

### Reading Time Display Logic

```typescript
// In MediaRichBookmarkCard.tsx
const displayTime = bookmark.contentType === 'article'
  ? bookmark.articleMetadata?.readingTime 
    ? `${bookmark.articleMetadata.readingTime} min read`
    : null  // Show nothing if unavailable
  : formatDuration(duration);
```

### Publication Date Formatting

```typescript
// In dateUtils.ts
export function formatPublicationDate(timestamp: number): string {
  const now = Date.now();
  const daysSince = (now - timestamp) / (1000 * 60 * 60 * 24);
  
  if (daysSince < 30) {
    // Show relative time for recent articles
    return formatDistanceToNow(timestamp); // "2 days ago"
  } else {
    // Show absolute date for older articles
    return format(new Date(timestamp), 'MMM d, yyyy'); // "Jan 15, 2023"
  }
}
```

### Paywalled Content Indicator

```typescript
// In MediaRichBookmarkCard.tsx
{bookmark.articleMetadata?.isPaywalled && (
  <View style={styles.paywallIndicator}>
    <Lock size={12} color={colors.mutedForeground} />
    <Text style={styles.paywallText}>Limited preview</Text>
  </View>
)}
```

### Author Deduplication Algorithm

```typescript
// In creator-service.ts
function calculateNameSimilarity(name1: string, name2: string): number {
  // Normalize names
  const n1 = name1.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const n2 = name2.toLowerCase().replace(/[^\w\s]/g, '').trim();
  
  // Exact match
  if (n1 === n2) return 1.0;
  
  // Check if one is substring of other
  if (n1.includes(n2) || n2.includes(n1)) return 0.9;
  
  // Calculate Levenshtein distance
  const distance = levenshteinDistance(n1, n2);
  const maxLen = Math.max(n1.length, n2.length);
  const similarity = 1 - (distance / maxLen);
  
  return similarity;
}

function findMatchingCreator(authorName: string, existingCreators: Creator[]): Creator | null {
  for (const creator of existingCreators) {
    const similarity = calculateNameSimilarity(authorName, creator.name);
    if (similarity >= 0.85) {
      return creator;
    }
  }
  return null;
}
```

## Testing Checklist

### Unit Tests
- [ ] Article metadata extraction from various HTML structures
- [ ] Reading time calculation (various word counts)
- [ ] Featured image priority selection
- [ ] Paywalled content detection
- [ ] Name similarity matching
- [ ] Publication date formatting

### Integration Tests
- [ ] Article bookmark creation flow
- [ ] Metadata persistence and retrieval
- [ ] Creator linkage and deduplication
- [ ] Full-text content storage

### Manual Testing
- [ ] Substack article
- [ ] Medium article
- [ ] Personal blog
- [ ] News site (NYT, Guardian)
- [ ] Paywalled article
- [ ] Article without author
- [ ] Article without image
- [ ] Very long article (10k+ words)
- [ ] Very short article (< 500 words)
- [ ] Multi-author article

### Visual/UI Testing
- [ ] Article card display (with all metadata)
- [ ] Article card display (minimal metadata)
- [ ] Paywalled indicator appearance
- [ ] Reading time badge placement
- [ ] Publication date formatting
- [ ] Author avatar display
- [ ] Dark mode compatibility
- [ ] Accessibility (screen readers)

## Performance Targets

- **Metadata extraction**: < 10 seconds for 95% of articles
- **Full-text extraction**: < 15 seconds (with 10s timeout)
- **Author deduplication**: < 100ms per author lookup
- **UI rendering**: 60fps smooth scrolling with article cards

## Success Criteria

✅ **Ready to Ship When:**
1. ✅ Database migration deployed
2. ✅ Article metadata extraction works for 80%+ of common article platforms
3. ✅ Article bookmarks display correctly in mobile app
4. ✅ Author deduplication works with 85%+ accuracy
5. ✅ Paywalled content gracefully handled
6. ✅ All unit and integration tests passing
7. ✅ Manual testing completed across diverse article sources

## Rollout Plan

1. **Alpha** (Internal testing): Test with 10-20 diverse article URLs
2. **Beta** (Limited users): Release to 5% of users, monitor metadata quality
3. **GA** (General availability): Full release after validating success metrics

## Monitoring & Metrics

Track after launch:
- **Adoption rate**: % of users bookmarking articles
- **Metadata quality**: % of articles with author, reading time, image
- **Paywalled content rate**: % of articles flagged as paywalled
- **Author deduplication accuracy**: Manual audit of merged authors
- **User feedback**: Quality of article display in app

## Future Work (Post-MVP)

1. **Offline reading**: Display stored `fullTextContent` when offline
2. **Reading progress**: Track user's position in articles
3. **Author profiles**: Dedicated pages for authors with all their articles
4. **Article categories**: Auto-detect and tag article types
5. **Manual metadata editing**: Allow users to correct/enhance metadata
6. **Personalized reading speed**: User-configurable WPM settings

## Questions or Issues?

Refer to:
- **PRD**: `docs/features/articles/PRD.md` - Product requirements and decisions
- **Design Doc**: `docs/features/articles/DESIGN.md` - Technical implementation details
- **Schema**: `packages/api/src/schema.ts` - Database structure
- **Types**: `packages/shared/src/types.ts` - TypeScript definitions
