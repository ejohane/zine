# Creator Extraction Enhancement

## Problem
The metadata extractor was unable to extract creator/author information from articles that lacked structured metadata (JSON-LD, article:author meta tags), such as personal blogs built with static site generators.

**Example**: `seangoedecke.com/good-times-are-over/` had no author metadata despite the author name being visible in the site header.

## Solution
Implemented a **confidence-based fallback chain** with 4 tiers of creator extraction:

### Tier 1: Structured Metadata (Confidence: 95%)
- JSON-LD `author`/`creator` fields
- JSON-LD `publisher` field (for personal blogs using Organization schema)
- `article:author` meta tag
- Generic `author` meta tag

### Tier 2: Semantic HTML (Confidence: 75-85%)
- `[rel="author"]` links
- Common author selectors: `.author`, `.byline`, `.post-author`, `.article-author`
- `[itemprop="author"]` schema.org markup
- `<address>` in `<article>` context

### Tier 3: Heuristic Patterns (Confidence: 50-70%)
- "By [Name]" patterns in article headers
- Copyright statements in footer (`© 2025 Name`)

### Tier 4: Domain-based (Confidence: 40-60%)
**Personal sites only** - skipped for news organizations
- Site header/branding extraction (`<header h1 a>`, `.site-title`, etc.)
- Domain name parsing (e.g., `seangoedecke.com` → `Sean Goedecke`)
- Cross-validation with multiple signals for confidence boosting

## Key Features

### Context-Aware Extraction
The system analyzes the site type before extraction:
- **Personal blogs**: Site header becomes a valid author source
- **News organizations**: Site header is NOT used (e.g., "CNN" ≠ article author)

### Confidence Scoring
Each extraction returns a confidence score (0-100):
```typescript
{
  name: "Sean Goedecke",
  extractionMethod: "domain",
  confidence: 70
}
```

### Cross-Validation
For domain-based extraction, the system validates:
- Site header name matches domain structure
- Personal site indicators (domain pattern, single author)
- Reasonable name length and format

## Implementation

### Type Updates
Added to `packages/shared/src/types.ts`:
```typescript
export const CreatorExtractionMethodEnum = z.enum([
  'json-ld',
  'meta-tag', 
  'semantic-html',
  'heuristic',
  'domain'
])

// Added to CreatorSchema:
extractionMethod: CreatorExtractionMethodEnum.optional(),
confidence: z.number().min(0).max(100).optional()
```

### Enhanced Extraction Logic
Updated `packages/shared/src/enhanced-metadata-extractor.ts`:
- `extractCreator()` - Main extraction with 4-tier fallback
- `analyzeContentContext()` - Determines if site is personal blog vs. news org
- `extractFromStructuredData()` - Tier 1
- `extractFromSemanticHtml()` - Tier 2
- `extractFromHeuristics()` - Tier 3
- `extractFromDomain()` - Tier 4 with confidence calculation

## Testing

To test the enhancement:

1. Start dev server: `bun dev`
2. Bookmark this URL: `https://www.seangoedecke.com/good-times-are-over/`
3. Check API logs for:
   ```
   [CreatorExtraction] Context: { isPersonalSite: true, ... }
   [CreatorExtraction] ✅ TIER 4: Found creator via domain: Sean Goedecke (confidence: 70)
   ```
4. Verify in mobile app that creator is displayed

## Example Output

### Example 1: seangoedecke.com
**Before**:
```
[EnrichedBookmark] Creator Name: MISSING
```

**After**:
```
[CreatorExtraction] ✅ TIER 4: Found creator via domain: Sean Goedecke (confidence: 70)
[EnrichedBookmark] Creator Name: Sean Goedecke
```

### Example 2: mitchellh.com
**Before**:
```
[EnrichedBookmark] Creator Name: MISSING
```

**After** (with publisher field fix):
```
[CreatorExtraction] ✅ TIER 1: Found creator via structured data: Mitchell Hashimoto
[EnrichedBookmark] Creator Name: Mitchell Hashimoto
```

## Bug Fixes

### mitchellh.com Issue
The site uses JSON-LD with `publisher` field instead of `author`:
```json
{
  "@type": "Article",
  "publisher": {
    "@type": "Organization",
    "name": "Mitchell Hashimoto"
  }
}
```

**Fix**: Added publisher field extraction for personal blogs. The extractor now checks if:
- The JSON-LD is an Article
- The publisher name looks like a person's name (2-4 capitalized words)
- Or the publisher type is explicitly "Person"

This pattern is common for personal blogs built with static site generators.

## Future Improvements

1. **Avatar Extraction**: Try to find author images from site footer/about pages
2. **Machine Learning**: Train a model to identify author patterns in HTML
3. **Domain Database**: Maintain a database of known personal blogs with author mappings
4. **Social Media Links**: Extract and validate author social profiles for additional confidence
5. **User Feedback Loop**: Allow users to correct wrong extractions, improving heuristics over time
