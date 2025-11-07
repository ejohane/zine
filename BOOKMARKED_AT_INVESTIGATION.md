# Investigation: `bookmarked_at` Inconsistent Date Formats

## Executive Summary

The `bookmarked_at` field in production has **two different formats**:
- **ISO strings** (TEXT): `"2025-10-02T02:55:34.961Z"` 
- **Unix timestamps** (INTEGER): `1762428767082`

This inconsistency stems from **one buggy code path** that was introduced on **October 13, 2024** and has persisted since then.

## Root Cause Analysis

### The Bug Location

**File**: `packages/api/src/routes/enriched-bookmarks.ts:878`

```typescript
// ❌ WRONG: Storing ISO string in INTEGER column
await c.env.DB.prepare(
  `INSERT INTO bookmarks (id, user_id, content_id, notes, bookmarked_at, status)
   VALUES (?, ?, ?, ?, ?, ?)`
).bind(
  bookmarkId,
  auth.userId,
  contentIdForBookmark,
  validatedData.notes || null,
  new Date().toISOString(),  // 🐛 BUG: ISO string instead of timestamp
  'active'
).run()
```

### Correct Implementation Examples

All other bookmark creation paths use the correct format:

**1. `packages/api/src/d1-repository.ts:183`** (create method)
```typescript
// ✅ CORRECT: Using Date.now() for INTEGER timestamp
const now = Date.now()
await this.db.prepare(`
  INSERT INTO bookmarks (
    id, user_id, content_id, user_tags, status, bookmarked_at
  ) VALUES (?, ?, ?, ?, ?, ?)
`).bind(
  bookmarkId,
  bookmark.userId,
  contentId,
  bookmark.tags ? JSON.stringify(bookmark.tags) : null,
  'active',
  now  // ✅ Integer timestamp
).first()
```

**2. `packages/api/src/d1-repository.ts:703`** (createWithMetadata method)
```typescript
// ✅ CORRECT: Using Date.now() for INTEGER timestamp
const now = Date.now()
await this.db.prepare(`
  INSERT INTO bookmarks (
    id, user_id, content_id, user_tags, notes, status, bookmarked_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).bind(
  bookmarkId,
  bookmarkData.userId,
  contentId,
  bookmarkData.tags ? JSON.stringify(bookmarkData.tags) : null,
  bookmarkData.notes || null,
  bookmarkData.status || 'active',
  now  // ✅ Integer timestamp
).first()
```

**3. `packages/api/src/index.ts:2146`** (simple bookmark creation)
```typescript
// ✅ CORRECT: Using Date.getTime() for INTEGER timestamp
const now = new Date()
await c.env.DB.prepare(`
  INSERT INTO bookmarks (
    id, user_id, content_id, notes, user_tags, status, bookmarked_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`).bind(
  bookmarkId,
  auth.userId,
  contentId,
  notes || null,
  tags ? JSON.stringify(tags) : null,
  'active',
  now.getTime()  // ✅ Integer timestamp
).run()
```

## Schema Definition

The schema clearly defines `bookmarked_at` as an INTEGER:

**`packages/api/src/schema.ts:280`**
```typescript
bookmarkedAt: integer('bookmarked_at', { mode: 'timestamp' }).notNull(),
```

**Migration: `packages/api/migrations/0000_broken_wasp.sql:11`**
```sql
`bookmarked_at` integer NOT NULL,
```

## Timeline of Introduction

| Date | Commit | Event |
|------|--------|-------|
| Oct 13, 2024 | `db103167` | **Bug introduced** in enriched-bookmarks route with `new Date().toISOString()` |
| Oct 29, 2024 | `c50fcbc` | Bug persisted through content view feature implementation |
| Oct 19, 2024 | `8aa8fe0` | Bug still present in codebase |
| Present | - | Bug **still active** in production code |

The bug was introduced in commit `db103167` which added the comprehensive search UI and multi-platform bookmark links feature. The enriched bookmarks route was created at that time with the incorrect date format.

## Impact Analysis

### Which Bookmarks Are Affected?

**Affected bookmarks** (ISO string format):
- Created via the **enriched bookmarks endpoint** (`POST /api/v1/enriched-bookmarks`)
- This endpoint is used when saving bookmarks with enhanced metadata and duplicate detection
- Likely used by the **search/discovery UI** flow

**Unaffected bookmarks** (correct INTEGER format):
- Created via `D1BookmarkRepository.create()` 
- Created via `D1BookmarkRepository.createWithMetadata()`
- Created via the simple bookmark endpoint in `index.ts`
- Likely used by the **main bookmark creation flow**

### Data Characteristics

**ISO String Format** (stored as TEXT):
```
"2025-10-02T02:55:34.961Z"
```
- SQLite stores this as TEXT
- When read back, it's a string that needs parsing
- Sort order works correctly (lexicographic sort of ISO strings matches chronological order)
- **Precision**: Milliseconds

**INTEGER Format** (correct):
```
1762428767082
```
- Unix timestamp in milliseconds
- SQLite stores as INTEGER
- Direct numeric comparison
- **Precision**: Milliseconds

## Why `last_accessed_at` Is Always INTEGER

`last_accessed_at` is only set by the repository methods that correctly use timestamps:

**`packages/api/src/d1-repository.ts:766-767`**
```typescript
createdAt: row.bookmarked_at ? Number(row.bookmarked_at) : Date.now(),
updatedAt: row.bookmarked_at ? Number(row.bookmarked_at) : Date.now(),
```

The `last_accessed_at` field is not set during bookmark creation, only during updates, and all update paths use proper timestamp handling.

## Production Query Impact

### Reading Bookmarks

The repository's `mapRowToBookmark` method attempts to handle both formats:

```typescript
createdAt: row.bookmarked_at ? Number(row.bookmarked_at) : Date.now(),
```

- **For INTEGER values**: `Number(1762428767082)` → `1762428767082` ✅
- **For ISO strings**: `Number("2025-10-02T02:55:34.961Z")` → `NaN` ❌

This means bookmarks with ISO string format return `Date.now()` as their `createdAt`, which is **incorrect**.

### Sorting

SQL queries use `ORDER BY b.bookmarked_at DESC`:
- **Mixed types**: SQLite will sort TEXT and INTEGER separately
- **Result**: Incorrect chronological ordering in queries that mix both types

## Solution Strategy

### Phase 1: Fix the Bug (Immediate)

**File**: `packages/api/src/routes/enriched-bookmarks.ts:878`

```typescript
// Change from:
new Date().toISOString(),

// To:
Date.now(),
```

### Phase 2: Data Migration (Required)

Create a migration to normalize existing ISO strings to INTEGER timestamps:

```sql
-- Migration: Fix bookmarked_at format inconsistency
UPDATE bookmarks
SET bookmarked_at = (
  CAST((julianday(bookmarked_at) - 2440587.5) * 86400000.0 AS INTEGER)
)
WHERE typeof(bookmarked_at) = 'text';
```

This converts ISO strings to Unix timestamps in milliseconds.

### Phase 3: Add Validation (Prevention)

Consider adding a constraint or trigger to prevent TEXT values:

```sql
-- Add CHECK constraint (requires table rebuild)
ALTER TABLE bookmarks ADD CONSTRAINT bookmarked_at_integer 
  CHECK (typeof(bookmarked_at) = 'integer');
```

## Recommendations

### Immediate Actions

1. ✅ **Fix the bug** in `enriched-bookmarks.ts:878` (change `toISOString()` to `Date.now()`)
2. ⚠️ **Run data migration** to normalize existing ISO strings to INTEGER
3. 🧪 **Add tests** to verify all bookmark creation paths use INTEGER timestamps

### Long-term Improvements

1. **Centralize date handling**: Use the existing `date-normalization.ts` utility
   - Use `formatForDatabase()` instead of manual `Date.now()` or `getTime()`
   - Ensures consistency across all code paths

2. **Add type guards**: Create a validation layer that checks timestamp types before insertion

3. **Monitoring**: Add logging to detect if TEXT values appear in `bookmarked_at` field

4. **Documentation**: Add comments to schema definition explaining the INTEGER requirement

## Testing Strategy

### Unit Tests

Add tests to verify all bookmark creation paths:

```typescript
describe('Bookmark creation date formats', () => {
  it('should use INTEGER timestamp in enriched-bookmarks route', async () => {
    // Test POST /api/v1/enriched-bookmarks
  })
  
  it('should use INTEGER timestamp in D1Repository.create', async () => {
    // Test repository method
  })
  
  it('should use INTEGER timestamp in D1Repository.createWithMetadata', async () => {
    // Test repository method
  })
})
```

### Integration Tests

Verify sorting and querying work correctly:

```typescript
describe('Bookmark queries with timestamps', () => {
  it('should sort bookmarks chronologically', async () => {
    // Create bookmarks and verify ORDER BY works
  })
  
  it('should parse bookmarked_at as number', async () => {
    // Verify Number(row.bookmarked_at) returns valid timestamp
  })
})
```

## Migration Script Example

```typescript
// packages/api/migrations/0013_fix_bookmarked_at_format.sql
-- Fix bookmarked_at column to use INTEGER timestamps consistently
-- This migration normalizes any TEXT ISO strings to INTEGER Unix timestamps

UPDATE bookmarks
SET bookmarked_at = (
  CASE 
    WHEN typeof(bookmarked_at) = 'text' THEN
      -- Convert ISO string to Unix timestamp (milliseconds)
      CAST((julianday(bookmarked_at) - 2440587.5) * 86400000.0 AS INTEGER)
    ELSE
      -- Already an integer, keep as-is
      bookmarked_at
  END
)
WHERE typeof(bookmarked_at) != 'integer';

-- Verify the fix
SELECT 
  COUNT(*) as total_bookmarks,
  SUM(CASE WHEN typeof(bookmarked_at) = 'integer' THEN 1 ELSE 0 END) as integer_count,
  SUM(CASE WHEN typeof(bookmarked_at) = 'text' THEN 1 ELSE 0 END) as text_count
FROM bookmarks;
```

## Files Requiring Changes

### 1. Bug Fix
- `packages/api/src/routes/enriched-bookmarks.ts:878`

### 2. Migration
- Create `packages/api/migrations/0013_fix_bookmarked_at_format.sql`

### 3. Tests
- Add to `packages/api/src/routes/__tests__/enriched-bookmarks.test.ts`
- Add to `packages/api/src/__tests__/d1-repository.test.ts`

### 4. Documentation
- Update `packages/api/src/schema.ts` with comment explaining INTEGER requirement

## Conclusion

The `bookmarked_at` inconsistency is caused by a **single buggy code path** in the enriched bookmarks route that has existed since **October 13, 2024**. 

**The intended format is**: INTEGER (Unix timestamp in milliseconds)

**The fix is simple**: Change `new Date().toISOString()` to `Date.now()` in one location.

**Data migration is required**: Convert existing ISO strings to INTEGER timestamps to ensure consistent querying and sorting.

This bug affects bookmarks created through the enriched bookmarks endpoint (likely from search/discovery flows) but not bookmarks created through the main repository methods.
