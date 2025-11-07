# Creator Data Normalization - Epic Implementation Plan

## Epic: zine-e7r
**Normalize creator data to single source of truth in creators table**

### Problem Summary
When saving feed items as bookmarks, creator information (name, avatar, verification status, etc.) is being lost. This happens because:
- Feed items store creator data in `content` table columns (denormalized)
- Bookmarks query creator data from `creators` table (normalized)
- No sync exists between the two when bookmark is created from feed

### Solution
Remove redundant creator fields from `content` table and use `creators` table as single source of truth. This:
- ✅ Fixes the bookmark creator data bug
- ✅ Enables cross-platform creator identity matching
- ✅ Simplifies data model
- ✅ Ensures consistency across feed and bookmarks

---

## Task Breakdown (in execution order)

### Phase 1: Data Migration (Safe, Non-Breaking)

#### 1. zine-wh2: Write migration script
**Status:** Ready to start  
**Files:** `packages/api/migrations/migrate-creators-data.sql`

Create SQL script that:
- Copies all creator data from `content` table → `creators` table
- Handles duplicates (upsert with latest data)
- Is idempotent (safe to run multiple times)
- Preserves all creator information

**Acceptance Criteria:**
- Script successfully migrates all existing creator data
- No data loss
- Can be run multiple times without errors

---

### Phase 2: Code Changes (Breaking Changes - Requires Migration First)

#### 2. zine-uiv: Update D1FeedItemRepository  
**Status:** Blocked by zine-wh2  
**Files:** `packages/api/src/d1-feed-item-repository.ts`

Modify feed item creation to:
- Import `CreatorRepository`
- Upsert to `creators` table before creating content
- Stop storing creator fields in `content` table

**Changes:**
```typescript
// Before creating content
if (feedItem.creatorId && feedItem.creatorName) {
  const creatorRepo = new CreatorRepository(this.db)
  await creatorRepo.upsertCreator({
    id: feedItem.creatorId,
    name: feedItem.creatorName,
    avatarUrl: feedItem.creatorThumbnail,
    // ... other fields
  })
}
```

---

#### 3. zine-erp: Update feed queries to JOIN creators
**Status:** Blocked by zine-uiv  
**Files:** `packages/api/src/d1-feed-item-repository.ts`

Update queries:
- `getFeedItem()`
- `getFeedItemsBySubscription()`
- `getUserFeedItems()`

Add LEFT JOIN:
```sql
SELECT fi.*, c.*, cr.name, cr.avatar_url, cr.verified...
FROM feed_items fi
JOIN content c ON fi.content_id = c.id
LEFT JOIN creators cr ON c.creator_id = cr.id
```

---

#### 4. zine-4hg: Update mapFeedItemWithContent
**Status:** Blocked by zine-erp  
**Files:** `packages/api/src/d1-feed-item-repository.ts`

Change mapping function to read from JOIN:
```typescript
// Before
creatorName: contentRow.creatorName

// After
creatorName: creatorRow.name
```

---

#### 5. zine-akp: Remove creator fields from ContentRepository
**Status:** Blocked by zine-4hg  
**Files:** `packages/api/src/d1-feed-item-repository.ts`

Remove these from `contentData`:
- ❌ `creatorName`
- ❌ `creatorThumbnail`
- ❌ `creatorHandle`
- ❌ `creatorVerified`
- ❌ `creatorSubscriberCount`
- ❌ `creatorFollowerCount`
- ✅ Keep `creatorId` (foreign key)

---

### Phase 3: Testing & Validation

#### 6. zine-880: Run migration locally
**Status:** Blocked by zine-akp  
**Command:** `sqlite3 packages/api/local.db < migrations/migrate-creators-data.sql`

Verify:
- All creators copied successfully
- No errors in migration
- Data integrity maintained

---

#### 7. zine-n8g: Manual testing
**Status:** Blocked by zine-880

Test scenarios:
1. View feed items → Creator data displays
2. Save feed item as bookmark → Creator data preserved
3. View bookmark list → Creator info appears
4. Check bookmark detail → All creator fields present
5. Test YouTube content
6. Test Spotify content

---

### Phase 4: Schema Cleanup (After Everything Works)

#### 8. zine-3z4: Create migration to drop columns
**Status:** Blocked by zine-n8g  
**Files:** `packages/api/migrations/XXXX-drop-creator-columns.sql`

Create Drizzle migration:
```sql
ALTER TABLE content DROP COLUMN creator_name;
ALTER TABLE content DROP COLUMN creator_handle;
ALTER TABLE content DROP COLUMN creator_thumbnail;
ALTER TABLE content DROP COLUMN creator_verified;
ALTER TABLE content DROP COLUMN creator_subscriber_count;
ALTER TABLE content DROP COLUMN creator_follower_count;
```

---

#### 9. zine-0px: Update schema.ts
**Status:** Blocked by zine-3z4  
**Files:** `packages/api/src/schema.ts`

Remove field definitions:
```typescript
export const content = sqliteTable('content', {
  // ... other fields
  creatorId: text('creator_id'), // ✅ Keep this
  // ❌ Remove all other creator_* fields
})
```

---

## Dependency Graph

```
zine-wh2 (Migration Script)
    ↓
zine-uiv (Upsert Creators)
    ↓
zine-erp (Add JOINs)
    ↓
zine-4hg (Update Mapping)
    ↓
zine-akp (Remove Fields)
    ↓
zine-880 (Run Migration)
    ↓
zine-n8g (Test Everything)
    ↓
zine-3z4 (Drop Columns)
    ↓
zine-0px (Update Schema)
```

---

## Getting Started

Check ready work:
```bash
bd ready
```

Start with first task:
```bash
bd update zine-wh2 --status in_progress
```

When complete:
```bash
bd close zine-wh2 --reason "Migration script created and tested"
```

---

## Rollback Plan

If issues arise after Phase 2 code changes:
1. Revert code changes (git revert)
2. Migration script is safe to keep (data still in both places)
3. Only run Phase 4 (dropping columns) after full confidence

---

## Notes

- Migration is **idempotent** - safe to run multiple times
- Code changes are **atomic** - deploy all Phase 2 tasks together
- Schema cleanup is **optional** - can delay if needed
- All tasks use `--json` flag for automation
- Commit `.beads/issues.jsonl` with code changes
