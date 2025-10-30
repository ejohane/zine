# Content View - Technical Design Document

**Version**: 1.0  
**Last Updated**: 2025-10-29  
**Status**: Design  
**Owner**: Product & Engineering Team

---

## 1. Executive Summary

The Content View feature introduces a preview and save workflow for content that isn't yet bookmarked. This view will display rich metadata for any URL (videos, podcasts, articles, posts) and provide a streamlined "Save to Bookmarks" action as the primary CTA, similar to how users experience content before bookmarking on other platforms.

### Key Differences from Bookmark View

| Aspect | Bookmark View | Content View |
|--------|--------------|--------------|
| **Primary Action** | Open Link | Save Bookmark |
| **Action Icons Row** | Archive, Collections, Tags, Delete | **None** (removed) |
| **Open Link Button** | Primary action (top) | Secondary action (below Save) |
| **User Context** | Content already saved | Content being previewed |
| **Data Source** | User's bookmarks collection | Preview/enrichment API |
| **Navigation Source** | Bookmarks list, feed, search | Share extension, URL paste, deep links |

---

## 2. Background & Context

### Current State

The existing bookmark detail view (`apps/mobile/app/(app)/bookmark/[id].tsx`) serves users who have already saved content:
- **Hero image** with parallax scrolling
- **Title, creator, publish date** metadata
- **Action buttons**: Open Link (primary), Open in..., Archive, Collections, Tags, Delete
- **Metadata cards**: Content type, views, reading time, episode number, published date
- **Additional info**: Tags, notes, description

### Current Bug

**Issue**: Feed items route to `/bookmark/[id]` but feed item IDs are content IDs, not bookmark IDs.

**Location**: `apps/mobile/components/FeedSection.tsx:236`
```typescript
// CURRENT (INCORRECT):
router.push(`/bookmark/${item.feedItem.id}`);  
// Problem: feedItem.id is a content ID from the content table
// Bookmark detail screen expects a bookmark ID from the bookmarks table
```

**Why this fails**:
- Content table: Shared content from feed imports (no user-specific data)
- Bookmarks table: User-specific records linking users to content
- Feed items reference content IDs, not bookmark IDs
- User hasn't saved the content yet, so no bookmark exists

### Problem Statement

Users need a dedicated view for **viewing content that exists in the database but they haven't bookmarked**:

1. **Feed discovery** - Content imported from subscriptions (YouTube, Spotify, RSS)
2. **Metadata already enriched** - No need to re-fetch, already in content table
3. **Save workflow** - Simple "Save to Bookmarks" action creates bookmark record
4. **Duplicate handling** - If already saved, navigate to existing bookmark

### Use Cases

**Primary Use Case**: Feed Discovery
1. User has YouTube/Spotify subscriptions configured
2. Backend polls feeds and imports new content to `content` table
3. User sees "From Your Feed" section on home screen (shows content, not bookmarks)
4. User taps feed item → Content View opens (NEW)
5. User previews metadata → Taps "Save to Bookmarks"
6. Backend creates bookmark record (links user + content)
7. User navigates to saved bookmark detail view

### Architecture Insight

The database already separates content from bookmarks:

```
content table (shared, from feed imports)
  ├── id (content ID)
  ├── title, description, thumbnailUrl
  ├── creatorId, contentType
  └── metadata (duration, views, etc.)

bookmarks table (user-specific)
  ├── id (bookmark ID)
  ├── userId
  ├── contentId (FK to content.id)  ← Links user to content
  ├── notes, tags (user-specific)
  └── status, createdAt
```

**Key insight**: Content can exist without bookmarks (from feeds). Multiple users can bookmark the same content.

---

## 3. Goals & Success Metrics

### Goals

1. Create a preview experience that mirrors bookmark detail view's visual design
2. Simplify the save workflow by making it the primary action
3. Remove management actions (archive, delete, tags, collections) since content isn't saved yet
4. Maintain all visual and interaction patterns from bookmark view (parallax, metadata, etc.)
5. Enable seamless transition from content preview to saved bookmark

### Success Metrics

- **Save Conversion**: 60%+ of content views result in bookmark save
- **Preview Engagement**: 80%+ of users view metadata before saving (scroll past fold)
- **Error Rate**: < 5% of content previews fail to load metadata
- **Time to Save**: < 3 seconds from content view open to save completion

---

## 4. Architecture & Design

### 4.1 Component Reusability Strategy

**Philosophy**: Maximize code reuse between bookmark view and content view by extracting shared presentation logic while keeping distinct business logic separate.

#### Shared Components (Extract & Reuse)
```
BookmarkContentDisplay (NEW)
├── HeroSection (NEW)
│   ├── ParallaxImage
│   ├── DurationBadge
│   └── PlayOverlay
├── ContentMetadata (NEW)
│   ├── Title
│   ├── CreatorRow
│   └── PublishDate
├── MetadataCards (NEW)
│   ├── ContentTypeCard
│   ├── ViewCountCard
│   ├── ReadingTimeCard
│   └── EpisodeCard
├── ContentSections (NEW)
│   ├── TagsSection
│   ├── NotesSection
│   └── DescriptionSection
└── AlternateLinksList (NEW)
```

#### View-Specific Components
```
BookmarkDetailScreen (REFACTORED)
├── BookmarkContentDisplay
├── BookmarkActionButtons (archive, delete, collections, tags)
└── OpenLinkButton (primary)

ContentViewScreen (NEW)
├── BookmarkContentDisplay (same shared component)
├── SaveBookmarkButton (primary - NEW)
└── OpenLinkButton (secondary)
```

### 4.2 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Entry Point                           │
│  - Feed Item Tap (from "From Your Feed" section)        │
│    Current: router.push(`/bookmark/${feedItem.id}`)     │
│    Problem: feedItem.id is content ID, not bookmark ID  │
│    Solution: Route to content view instead              │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              ContentViewScreen (NEW)                     │
│  Route: /content/[id]                                   │
│  Params: { id: string } (content ID from feed)          │
│                                                          │
│  State:                                                  │
│  - contentId: string (from route param)                  │
│  - content: Content | null                              │
│  - isLoading: boolean                                    │
│  - isSaving: boolean                                     │
│  - error: Error | null                                   │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              useContentDetail Hook (NEW)                 │
│                                                          │
│  Fetches: GET /api/v1/content/{contentId}               │
│  Returns: Content metadata from database                │
│                                                          │
│  Features:                                               │
│  - Reads from content table (feed imports)              │
│  - Includes creator, metadata, thumbnails               │
│  - No user-specific data (no notes, tags)               │
│  - Already enriched from feed polling                   │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│          BookmarkContentDisplay Component                │
│  (Shared between Bookmark & Content views)              │
│                                                          │
│  Props:                                                  │
│  - data: Content | Bookmark (union type)                │
│  - scrollY: Animated.Value                              │
│  - onCreatorPress?: (creatorId) => void                 │
│  - children?: ReactNode (action buttons slot)           │
│  - showNotes?: boolean (false for content view)         │
│  - showTags?: boolean (false for content view)          │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              Action Buttons (View-Specific)              │
│                                                          │
│  ContentView:                                            │
│  - SaveBookmarkButton (primary, prominent)              │
│  - OpenLinkButton (secondary, below save)               │
│                                                          │
│  BookmarkView:                                           │
│  - OpenLinkButton (primary)                             │
│  - OpenInButton (secondary)                             │
│  - ActionIconsRow (archive, collections, tags, delete)  │
└─────────────────────────────────────────────────────────┘
                            ↓
                    (User taps Save)
                            ↓
┌─────────────────────────────────────────────────────────┐
│              useSaveBookmarkFromContent Hook (NEW)       │
│                                                          │
│  Mutation: POST /api/v1/bookmarks/from-content          │
│  Payload: { contentId: string }                         │
│                                                          │
│  On Success (New Bookmark):                             │
│  - Invalidate bookmarks queries                         │
│  - Mark feed item as read (if from feed)                │
│  - Navigate to saved bookmark detail view               │
│  - Show success toast (optional)                        │
│                                                          │
│  On Duplicate:                                           │
│  - Show "Already saved" toast                           │
│  - Navigate to existing bookmark                        │
└─────────────────────────────────────────────────────────┘
```

### 4.3 File Structure

```
apps/mobile/
├── app/(app)/
│   ├── bookmark/[id].tsx              # REFACTOR: Use shared components
│   └── content/
│       └── [id].tsx                   # NEW: Content view screen (content ID)
├── components/
│   ├── content-display/               # NEW: Shared components
│   │   ├── BookmarkContentDisplay.tsx # Main wrapper
│   │   ├── HeroSection.tsx           # Hero image + parallax
│   │   ├── ContentMetadata.tsx       # Title, creator, date
│   │   ├── MetadataCards.tsx         # Grid of info cards
│   │   ├── ContentSections.tsx       # Tags, notes, description
│   │   └── AlternateLinksList.tsx    # "Open in..." providers
│   ├── action-buttons/                # NEW: Action button components
│   │   ├── SaveBookmarkButton.tsx    # Primary save CTA
│   │   ├── OpenLinkButton.tsx        # Extracted from bookmark detail
│   │   └── BookmarkActionIcons.tsx   # Archive, delete, etc.
│   └── FeedSection.tsx                # MODIFY: Change route to /content/[id]
└── hooks/
    ├── useContentDetail.ts            # NEW: Fetch content by ID from DB
    ├── useSaveBookmarkFromContent.ts  # NEW: Create bookmark from content
    └── useBookmarkDetail.ts           # EXISTING: Fetch saved bookmark
```

**Files to Create**: 14 new files
**Files to Modify**: 2 files (`bookmark/[id].tsx`, `FeedSection.tsx`)

---

## 5. Detailed Component Design

### 5.1 ContentViewScreen (`apps/mobile/app/(app)/content/[id].tsx`)

**Purpose**: Display content from feed imports that user hasn't bookmarked yet.

**Route**: `/content/[id]` (where `id` is content ID from database)

**Entry Point**: Feed item tap in "From Your Feed" section:
```typescript
// FeedSection.tsx (line 236)
// BEFORE: router.push(`/bookmark/${item.feedItem.id}`);  // WRONG - feedItem.id is content ID
// AFTER:  router.push(`/content/${item.feedItem.id}`);   // CORRECT - route to content view
```

**Props**: None (reads from route params)

**State**:
```typescript
interface ContentViewState {
  contentId: string;              // From route param
  content: Content | null;        // Content from database
  isLoading: boolean;             // Content fetch in progress
  isSaving: boolean;              // Save mutation in progress
  error: Error | null;            // Fetch or save error
}
```

**Behavior**:
1. On mount: Extract `id` from route params, fetch content from database
2. Display loading skeleton while fetching content
3. On success: Render `BookmarkContentDisplay` with save button
4. On save success: Navigate to `/bookmark/[bookmarkId]` (newly created bookmark)
5. On duplicate: Navigate to existing bookmark, show toast "Already saved"
6. On error: Show error state with retry button

**Key Differences from BookmarkDetailScreen**:
- Uses `useContentDetail` instead of `useBookmarkDetail`
- Fetches from `GET /api/v1/content/{id}` not `/api/v1/bookmarks/{id}`
- Primary action is "Save Bookmark" not "Open Link"
- No archive/delete/tags/collections actions
- No notes/tags sections (content isn't user's bookmark)
- Saves via `POST /api/v1/bookmarks/from-content` (links user to existing content)

**Code Skeleton**:
```typescript
export default function ContentViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scrollY = useRef(new Animated.Value(0)).current;
  
  const {
    data: content,
    isLoading,
    error,
    refetch
  } = useContentDetail(id);
  
  const saveMutation = useSaveBookmarkFromContent({
    onSuccess: (bookmark) => {
      // Mark feed item as read
      markFeedItemAsRead(id);
      // Navigate to saved bookmark
      router.replace(`/bookmark/${bookmark.id}`);
    },
    onDuplicate: (existingBookmarkId) => {
      router.replace(`/bookmark/${existingBookmarkId}`);
      showToast("Already saved");
    }
  });
  
  const handleSave = () => {
    saveMutation.mutate({ contentId: id });
  };
  
  return (
    <View>
      <Stack.Screen options={{ title: 'Content', headerBackTitle: 'Back' }} />
      
      {isLoading && <LoadingSkeleton />}
      {error && <ErrorState onRetry={refetch} />}
      
      {content && (
        <Animated.ScrollView onScroll={scrollY}>
          <BookmarkContentDisplay
            data={content}
            scrollY={scrollY}
            showNotes={false}
            showTags={false}
          >
            {/* Action buttons slot */}
            <SaveBookmarkButton
              onPress={handleSave}
              isLoading={saveMutation.isPending}
            />
            <OpenLinkButton url={content.url} secondary />
          </BookmarkContentDisplay>
        </Animated.ScrollView>
      )}
    </View>
  );
}
```

### 5.2 BookmarkContentDisplay (`components/content-display/BookmarkContentDisplay.tsx`)

**Purpose**: Shared presentation component for bookmark metadata display.

**Props**:
```typescript
interface BookmarkContentDisplayProps {
  bookmark: Bookmark;
  scrollY: Animated.Value;
  onCreatorPress?: (creatorId: string) => void;
  children?: ReactNode;  // Action buttons slot (view-specific)
  showNotes?: boolean;   // Default true for bookmark view, false for content view
  showTags?: boolean;    // Default true for bookmark view, false for content view
}
```

**Responsibilities**:
- Render hero image with parallax effect
- Display title, creator, publish date
- Show metadata cards (content type, views, reading time, etc.)
- Render tags, notes, description (conditional)
- Provide slot for view-specific action buttons

**Structure**:
```tsx
<View style={styles.container}>
  <HeroSection
    thumbnailUrl={bookmark.thumbnailUrl}
    contentType={bookmark.contentType}
    duration={duration}
    scrollY={scrollY}
  />
  
  <View style={styles.contentSection}>
    <ContentMetadata
      title={bookmark.title}
      creator={bookmark.creator}
      publishedAt={bookmark.publishedAt}
      onCreatorPress={onCreatorPress}
    />
    
    {/* Action buttons slot (injected by parent) */}
    {children}
    
    <MetadataCards
      bookmark={bookmark}
      platformColor={platformColor}
    />
    
    {showTags && bookmark.tags?.length > 0 && (
      <TagsSection tags={bookmark.tags} />
    )}
    
    {showNotes && bookmark.notes && (
      <NotesSection notes={bookmark.notes} />
    )}
    
    {bookmark.description && (
      <DescriptionSection description={bookmark.description} />
    )}
  </View>
</View>
```

### 5.3 SaveBookmarkButton (`components/action-buttons/SaveBookmarkButton.tsx`)

**Purpose**: Primary CTA for content view to save bookmark.

**Props**:
```typescript
interface SaveBookmarkButtonProps {
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}
```

**Visual Design**:
- **Style**: Prominent, full-width button
- **Icon**: `bookmark` (Feather) or `bookmark-plus`
- **Label**: "Save to Bookmarks"
- **Color**: Primary brand color (`colors.primary`)
- **Height**: 52px (same as current primary action button)
- **Loading state**: Spinner replaces icon, button disabled

**Behavior**:
- On press: Trigger save mutation with haptic feedback (medium impact)
- Loading: Show spinner, disable button, keep label
- Success: Handled by parent (navigation)
- Error: Handled by parent (show error toast)

**Code**:
```typescript
export function SaveBookmarkButton({
  onPress,
  isLoading = false,
  disabled = false,
  style
}: SaveBookmarkButtonProps) {
  const { colors } = useTheme();
  
  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };
  
  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: colors.primary },
        disabled && styles.disabled,
        style
      ]}
      onPress={handlePress}
      disabled={disabled || isLoading}
      activeOpacity={0.8}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.primaryForeground} />
      ) : (
        <Feather name="bookmark" size={20} color={colors.primaryForeground} />
      )}
      <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
        Save to Bookmarks
      </Text>
    </TouchableOpacity>
  );
}
```

### 5.4 useContentDetail Hook (`hooks/useContentDetail.ts`)

**Purpose**: Fetch content metadata from database (content imported from feeds).

**API Endpoint**: `GET /api/v1/content/{contentId}` (NEW - REQUIRED)

**Query Key**: `['content', contentId]`

**Behavior**:
- Fetch content from content table (not bookmarks)
- Content already enriched from feed polling
- No user-specific data (no notes, tags, status)
- Cache for 10 minutes (content rarely changes)
- No optimistic updates (read-only operation)

**Code**:
```typescript
export function useContentDetail(contentId: string | undefined) {
  const { getToken } = useAuth();
  
  return useQuery<Content | null>({
    queryKey: ['content', contentId],
    queryFn: async () => {
      if (!contentId) return null;
      
      const token = await getToken();
      if (!token) throw new Error('Authentication required');
      
      const content = await apiClient.get<Content>(`/api/v1/content/${contentId}`);
      return content;
    },
    enabled: !!contentId,
    staleTime: 10 * 60 * 1000,  // 10 minutes
    retry: 2,
  });
}

// Type definition
interface Content {
  id: string;
  externalId: string;
  provider: string;
  contentType: 'video' | 'podcast' | 'article' | 'post';
  title: string;
  description?: string;
  url: string;
  thumbnailUrl?: string;
  publishedAt?: number;
  creator?: {
    id: string;
    name: string;
    avatarUrl?: string;
    verified?: boolean;
  };
  videoMetadata?: {
    duration?: number;
    viewCount?: number;
  };
  podcastMetadata?: {
    duration?: number;
    episodeNumber?: number;
  };
  articleMetadata?: {
    readingTime?: number;
    wordCount?: number;
  };
  alternateLinks?: Array<{
    provider: string;
    url: string;
    externalId?: string;
  }>;
}
```

### 5.5 useSaveBookmarkFromContent Hook (`hooks/useSaveBookmarkFromContent.ts`)

**Purpose**: Create bookmark from existing content in database.

**API Endpoint**: `POST /api/v1/bookmarks/from-content` (NEW - REQUIRED)

**Mutation Config**:
```typescript
interface SaveBookmarkFromContentOptions {
  onSuccess?: (bookmark: Bookmark) => void;
  onDuplicate?: (existingBookmarkId: string) => void;
  onError?: (error: Error) => void;
}

interface SaveBookmarkFromContentPayload {
  contentId: string;
  notes?: string;
  tags?: string[];
}

export function useSaveBookmarkFromContent(options?: SaveBookmarkFromContentOptions) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (payload: SaveBookmarkFromContentPayload) => {
      return apiClient.post<{
        data: Bookmark;
        duplicate: boolean;
        existingBookmarkId?: string;
      }>('/api/v1/bookmarks/from-content', payload);
    },
    onSuccess: (response) => {
      if (response.duplicate && response.existingBookmarkId) {
        options?.onDuplicate?.(response.existingBookmarkId);
      } else {
        // Invalidate relevant queries
        queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
        queryClient.invalidateQueries({ queryKey: ['recent-bookmarks'] });
        queryClient.invalidateQueries({ queryKey: ['feed-items'] });
        options?.onSuccess?.(response.data);
      }
    },
    onError: (error) => {
      options?.onError?.(error);
    }
  });
}
```

---

## 6. Backend Requirements

### 6.1 New API Endpoints (Required)

**Get Content by ID Endpoint** (NEW - REQUIRED):
```
GET /api/v1/content/{contentId}
Response: {
  id: string,                    // Content ID (from feed imports)
  externalId: string,
  provider: string,
  contentType: 'video' | 'podcast' | 'article' | 'post',
  title: string,
  description?: string,
  thumbnailUrl?: string,
  publishedAt?: number,
  creatorId?: string,
  creatorName?: string,
  creatorThumbnail?: string,
  videoMetadata?: {
    duration?: number,
    viewCount?: number
  },
  podcastMetadata?: {
    duration?: number,
    episodeNumber?: number
  },
  articleMetadata?: {
    readingTime?: number,
    wordCount?: number
  },
  alternateLinks?: Array<{
    provider: string,
    url: string,
    externalId?: string
  }>
}
```

**Save Bookmark from Content Endpoint** (NEW - REQUIRED):
```
POST /api/v1/bookmarks/from-content
Body: { 
  contentId: string,     // Existing content from feed/DB
  notes?: string,        // Optional user notes
  tags?: string[]        // Optional user tags
}
Response: {
  data: Bookmark,        // Full bookmark with user-specific data
  duplicate: boolean,    // True if user already bookmarked this content
  existingBookmarkId?: string  // If duplicate, ID of existing bookmark
}
```

### 6.2 Existing Endpoints (Used)

**Mark Feed Item as Read** (already exists):
```
PATCH /api/v1/feed-items/{feedItemId}/read
Response: { success: boolean }
```

### 6.3 Backend Logic

**GET /api/v1/content/{contentId}**:
1. Query `content` table by ID
2. Join with `creators` table for creator data
3. Return enriched content metadata
4. No user-specific data (no bookmark, tags, notes)

**POST /api/v1/bookmarks/from-content**:
1. Verify content exists in `content` table
2. Check if user already has bookmark for this content
   - Query: `SELECT * FROM bookmarks WHERE userId = ? AND contentId = ?`
3. If duplicate: Return existing bookmark with `duplicate: true`
4. If new: Create bookmark record linking user + content
   ```sql
   INSERT INTO bookmarks (userId, contentId, notes, tags, status, createdAt)
   VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
   ```
5. Return new bookmark with `duplicate: false`

### 6.4 Database Schema (No Changes Needed)

Content and bookmarks are already separated:

```sql
-- Content table (shared across users, from feed imports)
CREATE TABLE content (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  provider TEXT,
  content_type TEXT,
  title TEXT,
  description TEXT,
  thumbnail_url TEXT,
  published_at INTEGER,
  creator_id TEXT,
  ...
);

-- Bookmarks table (user-specific, links user to content)
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  content_id TEXT NOT NULL,  -- FK to content.id
  notes TEXT,
  tags TEXT,
  status TEXT DEFAULT 'active',
  created_at INTEGER,
  FOREIGN KEY (content_id) REFERENCES content(id)
);
```

This architecture already supports:
- ✅ Content exists independently (from feed imports)
- ✅ Multiple users can bookmark same content
- ✅ User-specific metadata (notes, tags) in bookmarks table
- ✅ Content metadata (title, creator) in content table

---

## 7. UI/UX Specifications

### 7.1 Screen Layout Comparison

**Bookmark Detail View**:
```
┌─────────────────────────────────┐
│  ← Bookmark            [share]  │  ← Header
├─────────────────────────────────┤
│                                 │
│    [Hero Image - Parallax]      │  ← Hero (300px)
│                                 │
├─────────────────────────────────┤
│  Title                          │
│  👤 Creator • 2 days ago        │
│                                 │
│  ┌─────────────────────────┐   │
│  │ 🔗 Open Link            │   │  ← Primary action
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ 📱 Open in...           │   │  ← Secondary
│  └─────────────────────────┘   │
│  📦  📁  🏷️  🗑️              │  ← Action icons
│                                 │
│  [Metadata Cards]               │
│  [Tags] [Notes] [Description]   │
└─────────────────────────────────┘
```

**Content Preview View** (NEW):
```
┌─────────────────────────────────┐
│  ← Preview             [share]  │  ← Header
├─────────────────────────────────┤
│                                 │
│    [Hero Image - Parallax]      │  ← Hero (300px) - SAME
│                                 │
├─────────────────────────────────┤
│  Title                          │  ← SAME
│  👤 Creator • 2 days ago        │  ← SAME
│                                 │
│  ┌─────────────────────────┐   │
│  │ 🔖 Save to Bookmarks    │   │  ← PRIMARY (NEW)
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ 🔗 Open Link            │   │  ← Secondary (moved)
│  └─────────────────────────┘   │
│                                 │  ← NO action icons row
│  [Metadata Cards]               │  ← SAME
│  [Description]                  │  ← SAME (no tags/notes)
└─────────────────────────────────┘
```

### 7.2 Visual Specifications

**Save Button (Primary)**:
- Background: `colors.primary` (#f97316 - orange)
- Foreground: `colors.primaryForeground` (#ffffff)
- Height: 52px
- Border radius: 14px
- Icon: `bookmark` (20px)
- Text: "Save to Bookmarks" (16px, weight 700)
- Padding: 16px vertical
- Gap: 8px (icon to text)

**Open Link Button (Secondary)**:
- Background: `colors.secondary` (#f4f4f5 - light gray)
- Foreground: `colors.foreground` (#171717 - dark)
- Height: 48px
- Border radius: 14px
- Icon: `external-link` (18px)
- Text: "Open Link" (15px, weight 600)
- Padding: 14px vertical
- Gap: 8px

**Button Spacing**:
- Gap between buttons: 12px
- Margin top (from creator row): 16px
- Margin bottom (to metadata cards): 20px

**Removed Elements**:
- ❌ Action icons row (archive, collections, tags, delete)
- ❌ "Open in..." button (unless multiple providers available)
- ❌ Tags section (content not saved yet)
- ❌ Notes section (content not saved yet)

### 7.3 Interaction States

**Save Button States**:
1. **Default**: Orange background, "Save to Bookmarks" label, bookmark icon
2. **Pressed**: Scale to 0.98, medium haptic feedback
3. **Loading**: Spinner replaces icon, button disabled, label unchanged
4. **Success**: Immediately navigate to saved bookmark detail
5. **Duplicate**: Navigate to existing bookmark, show toast "Already saved"
6. **Error**: Show error toast, button returns to default state

**Navigation Flow**:
```
Share Extension → Content Preview → [Save] → Bookmark Detail
                                 ↓
                            [Already Saved]
                                 ↓
                           Existing Bookmark
```

---

## 8. Refactoring Plan

### 8.0 Phase 0: Backend API Development (Week 1)

**Objective**: Create new backend endpoints for content view.

**Tasks**:
1. **Create GET /api/v1/content/{contentId} endpoint**
   - Location: `packages/api/src/index.ts` or new route file
   - Query content table by ID
   - Join with creators table for creator data
   - Return content metadata (no user-specific data)
   - Response type: `Content` (similar to Bookmark but without user fields)

2. **Create POST /api/v1/bookmarks/from-content endpoint**
   - Location: `packages/api/src/index.ts` or new route file
   - Accept: `{ contentId: string, notes?: string, tags?: string[] }`
   - Check for duplicate: `SELECT * FROM bookmarks WHERE userId = ? AND contentId = ?`
   - If duplicate: Return existing bookmark with `duplicate: true`
   - If new: Create bookmark record
   - Return: `{ data: Bookmark, duplicate: boolean, existingBookmarkId?: string }`

3. **Add TypeScript types to shared package**
   - Location: `packages/shared/src/types.ts`
   - Add `Content` type (similar to Bookmark but without user fields)
   - Add `CreateBookmarkFromContentRequest` and `CreateBookmarkFromContentResponse` types

**Testing**:
- [ ] Unit tests for both endpoints
- [ ] Integration tests with test database
- [ ] Test duplicate detection logic
- [ ] Verify content table joins work correctly

**Deliverables**:
- Working `GET /api/v1/content/{contentId}` endpoint
- Working `POST /api/v1/bookmarks/from-content` endpoint
- TypeScript types in shared package
- API tests passing

**Dependencies**: None - can start immediately

---

### 8.1 Phase 1: Extract Shared Components (Week 1-2)

**Objective**: Create reusable components from bookmark detail screen.

**Tasks**:
1. Create `components/content-display/` directory
2. Extract `HeroSection` component
   - Hero image, parallax animation, duration badge
   - Props: `thumbnailUrl`, `contentType`, `duration`, `scrollY`
3. Extract `ContentMetadata` component
   - Title, creator info, publish date
   - Props: `title`, `creator`, `publishedAt`, `onCreatorPress`
4. Extract `MetadataCards` component
   - Grid of info cards (type, views, reading time, etc.)
   - Props: `bookmark`, `platformColor`
5. Extract `ContentSections` component
   - Tags, notes, description sections
   - Props: `tags?`, `notes?`, `description?`
6. Create `BookmarkContentDisplay` wrapper
   - Compose all extracted components
   - Add children slot for action buttons

**Testing**:
- Verify bookmark detail screen still works identically after refactor
- Visual regression testing (screenshots before/after)
- No functional changes, pure refactor

### 8.2 Phase 2: Refactor Bookmark Detail Screen (Week 1)

**Objective**: Update bookmark detail to use shared components.

**Tasks**:
1. Replace inline JSX with `BookmarkContentDisplay`
2. Move action buttons outside shared component
3. Pass action buttons as children to `BookmarkContentDisplay`
4. Maintain existing behavior (archive, delete, etc.)

**File Changes**:
```diff
// apps/mobile/app/(app)/bookmark/[id].tsx

- {/* Inline hero section JSX */}
+ <BookmarkContentDisplay
+   bookmark={bookmark}
+   scrollY={scrollY}
+   onCreatorPress={(id) => router.push(`/creator/${id}`)}
+ >
+   <OpenLinkButton url={bookmark.url} onPress={handleOpenLink} />
+   <OpenInButton visible={hasAlternateLinks} onPress={handleOpenAlternateLink} />
+   <BookmarkActionIcons
+     onArchive={handleArchive}
+     onAddToCollection={handleAddToCollection}
+     onAddTag={handleAddTag}
+     onDelete={handleDelete}
+     isDeleting={isDeleting}
+     isArchiving={archiveMutation.isPending}
+   />
+ </BookmarkContentDisplay>
```

**Testing**:
- Regression testing: all bookmark detail features work
- Archive, delete, tags, collections actions functional
- Creator navigation works
- Alternate links work

### 8.3 Phase 3: Implement Content View Components (Week 2)

**Objective**: Build new components for content view flow.

**Tasks**:
1. Create `SaveBookmarkButton` component
   - Design, implement, test loading states
2. Extract `OpenLinkButton` from bookmark detail
   - Support `primary` and `secondary` variants
3. Create `useContentDetail` hook
   - Connect to new `GET /api/v1/content/{id}` endpoint
   - Handle loading, error, success states
4. Create `useSaveBookmarkFromContent` hook
   - Connect to new `POST /api/v1/bookmarks/from-content` endpoint
   - Handle duplicate detection
   - Invalidate queries on success

**Testing**:
- Unit tests for `useContentDetail` hook
- Unit tests for `useSaveBookmarkFromContent` hook
- Visual testing for `SaveBookmarkButton` (all states)
- Mock API responses for content fetch and save

**Dependencies**: Phase 0 (Backend APIs) must be complete

---

### 8.4 Phase 4: Build Content View Screen (Week 2-3)

**Objective**: Create new content view screen using shared components.

**Tasks**:
1. Create `/app/(app)/content/[id].tsx`
2. Implement route param handling (content ID from route)
3. Use `useContentDetail` for data fetching from database
4. Render `BookmarkContentDisplay` with content data
5. Add `SaveBookmarkButton` as primary action
6. Add `OpenLinkButton` as secondary action
7. Implement error and loading states
8. Add navigation logic (save → bookmark detail)
9. **Update `FeedSection.tsx` to route to `/content/[id]`** instead of `/bookmark/[id]`

**File Changes**:
```diff
// apps/mobile/components/FeedSection.tsx (line 236)

- router.push(`/bookmark/${item.feedItem.id}`);
+ router.push(`/content/${item.feedItem.id}`);
```

**File Structure**:
```
apps/mobile/app/(app)/content/
└── [id].tsx                    # NEW
```

**Testing**:
- E2E test: Feed item tap → Content View → Save → Bookmark Detail
- E2E test: Feed item tap → Content View → Already Saved → Navigate to Existing
- E2E test: Invalid content ID → Error State → Retry
- E2E test: Content View → Open Link (without saving)

**Dependencies**: Phase 3 (Hooks and components) must be complete

---

### 8.5 Phase 5: Integration & Polish (Week 3-4)

**Objective**: Polish UX and fix edge cases.

**Tasks**:
1. Add toast notifications (save success, duplicate, error)
2. Mark feed items as read after viewing
3. Implement analytics tracking (content view, save, open link)
4. Accessibility testing (VoiceOver, dynamic type)
5. Performance optimization (lazy loading, caching)
6. Handle edge cases (no creator, missing metadata)
7. Dark mode testing

**Testing**:
- Full user journey testing (feed → content → save)
- Performance benchmarking (content load time)
- Analytics validation (events firing correctly)
- Cross-platform testing (iOS, Android)
- Visual regression testing (compare to bookmark view)

---

## 9. Data Contracts

### 9.1 Preview API Response

**Endpoint**: `POST /api/v1/bookmarks/preview`

**Request**:
```typescript
{
  url: string
}
```

**Response** (Success):
```typescript
{
  data: {
    // Not a real bookmark (no id, userId, createdAt)
    url: string,
    title: string,
    description?: string,
    contentType: 'video' | 'podcast' | 'article' | 'post' | 'link',
    thumbnailUrl?: string,
    publishedAt?: number,
    creator?: {
      id: string,
      name: string,
      avatarUrl?: string,
      verified?: boolean
    },
    videoMetadata?: {
      duration?: number,
      viewCount?: number
    },
    podcastMetadata?: {
      duration?: number,
      episodeNumber?: number
    },
    articleMetadata?: {
      readingTime?: number,
      wordCount?: number
    },
    alternateLinks?: Array<{
      provider: string,
      url: string,
      externalId?: string
    }>
  },
  source: 'youtube' | 'spotify' | 'web' | 'cache',
  cached: boolean
}
```

**Response** (Error):
```typescript
{
  error: string,
  message: string
}
```

### 9.2 Save API Response

**Endpoint**: `POST /api/v1/enriched-bookmarks/save-enriched`

**Request**:
```typescript
{
  url: string
}
```

**Response** (Success - New Bookmark):
```typescript
{
  data: {
    id: string,          // Bookmark ID
    userId: string,
    url: string,
    title: string,
    // ... all bookmark fields
  },
  duplicate: false,
  enrichmentSource: 'youtube' | 'spotify' | 'web'
}
```

**Response** (Duplicate):
```typescript
{
  data: {
    id: string,          // Existing bookmark ID
    // ... full bookmark data
  },
  duplicate: true,
  duplicateContentId: string,
  duplicateReasons: ['url', 'title', 'externalId']
}
```

**Response** (Error):
```typescript
{
  error: string,
  message: string
}
```

---

## 10. Testing Strategy

### 10.1 Unit Tests

**Components**:
- [ ] `BookmarkContentDisplay`: Renders correctly with all props
- [ ] `HeroSection`: Parallax animation works
- [ ] `SaveBookmarkButton`: All states (default, loading, disabled)
- [ ] `ContentMetadata`: Creator press handler works
- [ ] `MetadataCards`: Correct cards shown for different content types

**Hooks**:
- [ ] `useContentPreview`: Fetches preview data correctly
- [ ] `useContentPreview`: Handles errors, retries
- [ ] `useSaveBookmark`: Saves bookmark, invalidates queries
- [ ] `useSaveBookmark`: Handles duplicate detection
- [ ] `useSaveBookmark`: Error handling

### 10.2 Integration Tests

**Shared Components**:
- [ ] Bookmark detail screen works with refactored components
- [ ] Content preview screen renders correctly with shared components
- [ ] Both screens maintain visual consistency

**Data Flow**:
- [ ] Preview fetch → Display → Save → Navigate
- [ ] Duplicate detection → Navigate to existing
- [ ] Preview error → Error state → Retry

### 10.3 E2E Tests

**User Journeys**:
- [ ] Share URL → Preview → Save → View bookmark
- [ ] Share URL → Preview → Already saved → View existing
- [ ] Paste URL → Preview → Open link (no save)
- [ ] Deep link → Preview → Save → Success
- [ ] Preview → Save error → Retry

**Entry Points**:
- [ ] Share extension triggers preview
- [ ] URL input triggers preview
- [ ] Deep links trigger preview or existing bookmark

### 10.4 Visual Regression Tests

**Screenshots**:
- [ ] Bookmark detail before refactor
- [ ] Bookmark detail after refactor (should match exactly)
- [ ] Content preview screen (all states)
- [ ] Save button (default, loading, disabled)

### 10.5 Manual Testing Checklist

**Content Types**:
- [ ] YouTube video preview + save
- [ ] Spotify podcast preview + save
- [ ] Web article preview + save
- [ ] Twitter/X post preview + save
- [ ] Generic link preview + save

**Edge Cases**:
- [ ] Invalid URL (404, malformed)
- [ ] Paywalled content (limited metadata)
- [ ] Content without image/creator
- [ ] Very long titles (truncation)
- [ ] Offline behavior (cached previews)

**Platforms**:
- [ ] iOS (simulator + device)
- [ ] Android (emulator + device)
- [ ] Dark mode vs light mode
- [ ] Different screen sizes (small, large)

---

## 11. Performance Considerations

### 11.1 Preview Fetch Optimization

- **Timeout**: 10 seconds max for enrichment
- **Caching**: Cache preview results for 5 minutes
- **Parallel fetching**: If preview already in cache, show immediately
- **Fallback**: Show basic metadata if enrichment times out

### 11.2 Component Rendering

- **Lazy loading**: Load `BookmarkContentDisplay` components on demand
- **Memoization**: Memoize expensive computations (duration formatting, date parsing)
- **Image optimization**: Use `OptimizedBookmarkImage` for thumbnails
- **Virtualization**: Not needed (single item view)

### 11.3 Navigation Performance

- **Route preloading**: Prefetch bookmark data when save completes
- **Transition animations**: Use native transitions (no custom animations)
- **Memory management**: Clean up preview cache on navigation away

---

## 12. Accessibility

### 12.1 Screen Reader Support

- [ ] Save button: "Save to Bookmarks, button"
- [ ] Open link button: "Open link, button, opens in external browser"
- [ ] Hero image: Alt text from bookmark title
- [ ] Creator row: "Created by {name}, {timeAgo}"
- [ ] Metadata cards: Announce card type and value

### 12.2 Dynamic Type

- [ ] All text respects system font size settings
- [ ] Buttons scale appropriately with text
- [ ] Metadata cards reflow for large text sizes

### 12.3 Color Contrast

- [ ] Save button: 4.5:1 contrast ratio (WCAG AA)
- [ ] Secondary button: 4.5:1 contrast ratio
- [ ] Metadata text: 7:1 contrast ratio (WCAG AAA)

### 12.4 Haptic Feedback

- [ ] Save button press: Medium impact
- [ ] Open link press: Light impact
- [ ] Error state: Notification feedback (error)
- [ ] Success state: Notification feedback (success)

---

## 13. Analytics

### 13.1 Events to Track

**Preview Events**:
- `content_preview_viewed`: User opens content preview
  - Properties: `url`, `contentType`, `source` (share/input/deeplink)
- `content_preview_loaded`: Preview data loaded successfully
  - Properties: `url`, `contentType`, `loadTime`, `enrichmentSource`
- `content_preview_failed`: Preview fetch failed
  - Properties: `url`, `error`

**Save Events**:
- `content_save_initiated`: User taps save button
  - Properties: `url`, `contentType`
- `content_save_completed`: Bookmark saved successfully
  - Properties: `url`, `contentType`, `isDuplicate`, `saveTime`
- `content_save_failed`: Save failed
  - Properties: `url`, `error`
- `content_duplicate_detected`: Duplicate bookmark found
  - Properties: `url`, `existingBookmarkId`

**Interaction Events**:
- `content_open_link`: User opens link from preview (without saving)
  - Properties: `url`, `contentType`
- `content_creator_tapped`: User taps creator profile
  - Properties: `creatorId`, `creatorName`

### 13.2 Metrics to Monitor

- **Preview Load Time**: p50, p95, p99
- **Save Success Rate**: % of save attempts that succeed
- **Duplicate Rate**: % of saves that are duplicates
- **Conversion Rate**: % of previews that result in saves
- **Time to Save**: Duration from preview load to save completion

---

## 14. Error Handling

### 14.1 Preview Errors

**Scenarios**:
1. **Invalid URL**: Malformed, unreachable, 404
2. **Enrichment timeout**: Provider API slow or unavailable
3. **Network error**: No internet connection
4. **Auth error**: Token expired or invalid

**Handling**:
- Show error state with icon, message, retry button
- Log error to analytics with context
- Provide helpful message (e.g., "URL not found" vs "Network error")

**Error Messages**:
- Invalid URL: "This URL couldn't be previewed. Please check the link."
- Timeout: "Preview timed out. Tap to retry."
- Network: "No internet connection. Check your network and try again."
- Auth: "Session expired. Please sign in again."

### 14.2 Save Errors

**Scenarios**:
1. **Network error**: Request failed mid-flight
2. **Quota exceeded**: User hit bookmark limit
3. **Content policy violation**: URL flagged as malicious
4. **Duplicate conflict**: Race condition with concurrent saves

**Handling**:
- Show toast notification with error message
- Keep save button enabled (allow retry)
- Log error for debugging
- Provide actionable guidance

**Error Messages**:
- Network: "Save failed. Please try again."
- Quota: "Bookmark limit reached. Upgrade to save more."
- Policy: "This content cannot be saved."
- Conflict: "Already saved. Opening bookmark..."

### 14.3 Retry Logic

**Preview Fetch**:
- Auto-retry: 2 attempts (exponential backoff)
- Manual retry: User taps retry button
- Cache on success: Avoid re-fetch on retry

**Save Mutation**:
- Auto-retry: 1 attempt
- Manual retry: User taps save again
- Idempotent: Duplicate detection handles re-saves

---

## 15. Migration & Rollout

### 15.1 Phase 1: Backend (Week 1)

**Tasks**:
- No backend changes required (APIs exist)
- Verify preview and save endpoints work as documented
- Test duplicate detection logic
- Monitor API performance (add metrics if needed)

**Testing**:
- API contract validation (Postman/curl)
- Load testing (preview endpoint under traffic)

### 15.2 Phase 2: Component Refactor (Week 1-2)

**Tasks**:
- Extract shared components from bookmark detail
- Refactor bookmark detail to use shared components
- Visual regression testing

**Deployment**:
- Deploy refactored bookmark detail
- Monitor for regressions (user reports, analytics)
- Rollback plan: Revert to original implementation

### 15.3 Phase 3: Content Preview Implementation (Week 2-3)

**Tasks**:
- Build content preview screen
- Implement hooks (useContentPreview, useSaveBookmark)
- Create SaveBookmarkButton and related components
- Wire up entry points (share, input, deep links)

**Deployment**:
- Beta testing with internal team
- A/B test with 10% of users (if applicable)
- Monitor conversion rates, errors, performance

### 15.4 Phase 4: Full Rollout (Week 4)

**Tasks**:
- Roll out to 100% of users
- Monitor analytics (save rates, errors)
- Collect user feedback
- Address bugs and polish issues

**Success Criteria**:
- 60%+ preview-to-save conversion rate
- < 5% preview error rate
- < 3 seconds average save time
- No increase in crash rate
- Positive user feedback (qualitative)

---

## 16. Open Questions

### Resolved

1. **Should preview show tags/notes sections?**
   - ✅ No - content isn't saved yet, so no user-generated metadata

2. **Should we show "Open in..." button?**
   - ✅ Yes, but only if alternate links exist (same logic as bookmark view)

3. **What happens if user taps save on duplicate?**
   - ✅ Navigate to existing bookmark, show toast "Already saved"

4. **Should preview cache persist across app restarts?**
   - ✅ No - preview cache is ephemeral (5 min TTL)

5. **Should save button show "Saving..." text or just spinner?**
   - ✅ Spinner replaces icon, text stays "Save to Bookmarks"

### Remaining

1. **Should we show a "Saved" checkmark animation before navigating?**
   - Recommendation: No - immediate navigation feels faster
   - Alternative: 300ms checkmark + fade, then navigate

2. **Should preview support editing metadata before saving?**
   - Recommendation: Not for MVP - add in future enhancement
   - Use case: Correct title, add tags/notes before saving

3. **Should we support "Save and Open" action (single button)?**
   - Recommendation: Not for MVP - two separate actions is clearer
   - Use case: Power users who want to save + open immediately

4. **Should preview be dismissible with swipe down gesture?**
   - Recommendation: Yes - standard iOS pattern for modal screens
   - Implementation: Use modal presentation style

---

## 17. Future Enhancements

### v1.1 Enhancements

1. **Edit Metadata Before Save**: Allow users to modify title, add tags/notes before saving
2. **Save and Open**: Single button to save and immediately open link
3. **Quick Save to Collection**: Dropdown to select collection during save
4. **Preview History**: Show recently previewed (but unsaved) content

### v1.2 Enhancements

5. **Batch Preview**: Preview multiple URLs at once (bulk import)
6. **Smart Suggestions**: Suggest tags/collections based on content
7. **Preview Sharing**: Share preview link with others (non-bookmarked content)
8. **Offline Preview**: Cache preview data for offline viewing

### v2.0 Enhancements

9. **Preview Annotations**: Add notes to preview before saving
10. **Preview Comparison**: Compare multiple versions of same content (updated articles)
11. **Preview Scheduling**: Schedule save for later (remind me in 1 hour)
12. **Preview Recommendations**: "Similar content you might like"

---

## 18. Success Criteria

### MVP Launch Criteria

- [ ] Content preview screen accessible from all entry points
- [ ] Preview loads and displays all metadata correctly
- [ ] Save button works and creates bookmark
- [ ] Duplicate detection navigates to existing bookmark
- [ ] Error states display and allow retry
- [ ] Bookmark detail screen refactored without regressions
- [ ] Visual consistency between preview and bookmark views
- [ ] < 3 seconds average preview load time
- [ ] 60%+ preview-to-save conversion rate
- [ ] VoiceOver support for all interactions

### Post-Launch Success (30 days)

- 60%+ of content saves originate from preview flow
- 30%+ of previews result in saves (conversion rate)
- < 5% preview error rate
- < 2 seconds average save time
- 4.5+ star rating for preview feature (user feedback)

---

## 19. Dependencies & Risks

### Dependencies

- `POST /api/v1/bookmarks/preview` endpoint (exists)
- `POST /api/v1/enriched-bookmarks/save-enriched` endpoint (exists)
- `BookmarkListItem` component (exists)
- `OptimizedBookmarkImage` component (exists)
- `useBookmarks` hook (exists)
- TanStack Query for data fetching (exists)

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Refactor breaks bookmark detail | High | Comprehensive visual regression testing, feature parity checklist |
| Preview API slow (> 5s) | Medium | Timeout after 10s, show cached/basic metadata as fallback |
| High duplicate rate confuses users | Medium | Clear messaging, smooth navigation to existing bookmark |
| Save failures due to network | Medium | Retry logic, clear error messages, allow manual retry |
| Shared components diverge over time | Low | Regular code reviews, enforce usage via linting rules |

---

## 20. References

- Existing bookmark detail: `apps/mobile/app/(app)/bookmark/[id].tsx`
- Bookmark list item: `apps/mobile/components/bookmark-list/BookmarkListItem.tsx`
- API client: `apps/mobile/lib/api.ts`
- Preview API: `packages/api/src/index.ts` (line 1525-1548)
- Save API: `packages/api/src/index.ts` (line 1850-1920)
- Similar features: Inbox PRD (`docs/features/inbox/PRD.md`)

---

**Document History**
- 2025-10-29: Initial design document (v1.0)
