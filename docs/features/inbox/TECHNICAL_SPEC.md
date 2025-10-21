# Inbox Feature - Technical Specification

Technical details for engineering implementation.

---

## Component Hierarchy

```
InboxScreen
│
├─ SafeAreaView (wrapper)
│  │
│  ├─ View (container with background color)
│  │  │
│  │  ├─ CategoryTabs (filter chips - MOVED from homepage)
│  │  │  └─ ScrollView (horizontal)
│  │  │     └─ TouchableOpacity[] (chips)
│  │  │
│  │  └─ FlatList (bookmark list)
│  │     │
│  │     ├─ ListHeaderComponent (optional section header)
│  │     │
│  │     ├─ renderItem: SwipeableBookmarkItem[]
│  │     │  │
│  │     │  ├─ Animated.View (swipe container)
│  │     │  │  │
│  │     │  │  ├─ SwipeActionView (background layer)
│  │     │  │  │  └─ TouchableOpacity[] (action buttons)
│  │     │  │  │
│  │     │  │  └─ BookmarkListItem (foreground layer)
│  │     │  │     ├─ Image (thumbnail 60x60)
│  │     │  │     ├─ View (content container)
│  │     │  │     │  ├─ Text (title, max 2 lines)
│  │     │  │     │  ├─ View (metadata row)
│  │     │  │     │  │  ├─ Image (platform icon 16x16)
│  │     │  │     │  │  ├─ Text (creator name)
│  │     │  │     │  │  └─ Text (duration badge)
│  │     │  │     │  └─ View (separator)
│  │     │
│  │     ├─ ListEmptyComponent (empty state)
│  │     │  └─ EmptyState
│  │     │     ├─ Image (illustration)
│  │     │     ├─ Text (title)
│  │     │     ├─ Text (description)
│  │     │     └─ Button (CTA)
│  │     │
│  │     └─ RefreshControl (pull-to-refresh)
│  │
│  └─ Toast (undo notification - portal/overlay)
│     ├─ View (container)
│     ├─ Text (message)
│     └─ Button (undo)
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         InboxScreen                         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ State: selectedCategory (CategoryType)              │   │
│  │        undoBookmarkId (string | null)                │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ useInboxBookmarks(selectedCategory)                 │   │
│  │   ├─ queryKey: ['bookmarks', 'inbox', filter]       │   │
│  │   ├─ queryFn: fetch + filter bookmarks              │   │
│  │   └─ returns: { bookmarks, isLoading, refetch }     │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ API Call: bookmarksApi.getAll()                      │   │
│  │   GET /api/v1/bookmarks?status=active&sort=...      │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Filter Logic (client-side)                           │   │
│  │   if (filter !== 'all')                              │   │
│  │     bookmarks.filter(b => b.contentType === filter) │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Render FlatList                                      │   │
│  │   data={filteredBookmarks}                           │   │
│  │   renderItem={(item) => SwipeableBookmarkItem}      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  User swipes left on bookmark                               │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ handleArchive(bookmarkId)                            │   │
│  │   ├─ archiveMutation.mutateAsync(id)                │   │
│  │   ├─ Optimistic update (remove from UI)              │   │
│  │   └─ showUndoToast(id)                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ API Call: bookmarksApi.archive(id)                  │   │
│  │   PUT /api/v1/bookmarks/:id/archive                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ onSuccess:                                           │   │
│  │   ├─ invalidateQueries(['bookmarks'])               │   │
│  │   ├─ invalidateQueries(['recent-bookmarks'])        │   │
│  │   └─ animate item removal                            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  User taps "Undo" (optional)                                │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ handleUndo(bookmarkId)                               │   │
│  │   ├─ unarchiveMutation.mutateAsync(id)              │   │
│  │   └─ hide toast                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ API Call: bookmarksApi.unarchive(id)                │   │
│  │   PUT /api/v1/bookmarks/:id/unarchive               │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ onSuccess:                                           │   │
│  │   ├─ invalidateQueries(['bookmarks'])               │   │
│  │   └─ animate item re-insertion                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Type Definitions

### CategoryType
```typescript
// From apps/mobile/components/CategoryTabs.tsx
export type CategoryType = 'all' | 'videos' | 'podcasts' | 'articles' | 'posts';
```

### Bookmark (from packages/shared/src/types.ts)
```typescript
export interface Bookmark {
  id: string;
  userId: string;
  url: string;
  originalUrl: string;
  title: string;
  description?: string;
  source?: 'youtube' | 'spotify' | 'twitter' | 'substack' | 'web';
  contentType?: 'video' | 'podcast' | 'article' | 'post' | 'link';
  thumbnailUrl?: string;
  faviconUrl?: string;
  publishedAt?: number;
  status: 'active' | 'archived' | 'deleted';

  videoMetadata?: {
    duration?: number;
    viewCount?: number;
    likeCount?: number;
    channelId?: string;
    categoryId?: string;
  };

  podcastMetadata?: {
    episodeTitle?: string;
    episodeNumber?: number;
    seriesName?: string;
    duration?: number;
  };

  articleMetadata?: {
    authorName?: string;
    wordCount?: number;
    readingTime?: number;
    isPaywalled?: boolean;
    secondaryAuthors?: string[];
  };

  postMetadata?: {
    postText?: string;
    likeCount?: number;
    repostCount?: number;
  };

  tags?: string[];
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
  archivedAt?: number;

  creator: Creator | null;
}
```

### SwipeAction
```typescript
// From apps/mobile/components/bookmark-list/swipe-actions/SwipeActionView.tsx
export interface SwipeAction {
  id: string;
  icon: string;              // Feather icon name
  iconColor?: string;
  backgroundColor: string;
  onPress: (bookmarkId: string) => void;
  label?: string;
}
```

---

## Hook Specifications

### useInboxBookmarks

**File**: `apps/mobile/hooks/useInboxBookmarks.ts` (NEW)

```typescript
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { Bookmark } from '@zine/shared';
import { bookmarksApi } from '@/lib/api';
import { CategoryType } from '@/components/CategoryTabs';

interface UseInboxBookmarksReturn {
  bookmarks: Bookmark[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useInboxBookmarks(
  filter: CategoryType = 'all'
): UseInboxBookmarksReturn {
  const query = useQuery({
    queryKey: ['bookmarks', 'inbox', filter],
    queryFn: async () => {
      // Fetch all active bookmarks sorted by creation date (newest first)
      const allBookmarks = await bookmarksApi.getAll({
        status: 'active',
        sort: 'createdAt:desc'
      });

      // Client-side filtering by content type
      if (filter === 'all') {
        return allBookmarks;
      }

      // Map filter to contentType
      const contentTypeMap: Record<CategoryType, string | null> = {
        'all': null,
        'videos': 'video',
        'podcasts': 'podcast',
        'articles': 'article',
        'posts': 'post',
      };

      const contentType = contentTypeMap[filter];
      if (!contentType) return allBookmarks;

      return allBookmarks.filter(
        (bookmark) => bookmark.contentType === contentType
      );
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  return {
    bookmarks: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
```

### useUnarchiveBookmark

**File**: `apps/mobile/hooks/useUnarchiveBookmark.ts` (NEW)

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bookmark } from '@zine/shared';
import { bookmarksApi } from '@/lib/api';

export function useUnarchiveBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookmarkId: string) => {
      return bookmarksApi.unarchive(bookmarkId);
    },
    onSuccess: (data: Bookmark, bookmarkId: string) => {
      // Invalidate all bookmark-related queries
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarks', bookmarkId] });
      queryClient.invalidateQueries({ queryKey: ['recent-bookmarks'] });
    },
    onError: (error, bookmarkId) => {
      console.error('Failed to unarchive bookmark:', bookmarkId, error);
      // Optionally show error toast
    },
  });
}
```

---

## Component Specifications

### InboxScreen

**File**: `apps/mobile/app/(app)/(tabs)/inbox.tsx` (NEW)

```typescript
import React, { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { Bookmark } from '@zine/shared';

import { CategoryTabs, CategoryType } from '@/components/CategoryTabs';
import { SwipeableBookmarkItem } from '@/components/bookmark-list/SwipeableBookmarkItem';
import { SwipeAction } from '@/components/bookmark-list/swipe-actions/SwipeActionView';
import { useInboxBookmarks } from '@/hooks/useInboxBookmarks';
import { useArchiveBookmark } from '@/hooks/useArchiveBookmark';
import { useUnarchiveBookmark } from '@/hooks/useUnarchiveBookmark';
import { useColors } from '@/hooks/useColors';

export default function InboxScreen() {
  // Auth
  const { isSignedIn } = useAuth();
  const colors = useColors();

  // State
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('all');
  const [undoBookmarkId, setUndoBookmarkId] = useState<string | null>(null);

  // Data fetching
  const { bookmarks, isLoading, refetch } = useInboxBookmarks(selectedCategory);

  // Mutations
  const archiveMutation = useArchiveBookmark();
  const unarchiveMutation = useUnarchiveBookmark();

  // Handlers
  const handleArchive = useCallback(async (bookmarkId: string) => {
    try {
      await archiveMutation.mutateAsync(bookmarkId);

      // Show undo toast
      setUndoBookmarkId(bookmarkId);

      // Auto-hide toast after 5 seconds
      setTimeout(() => {
        setUndoBookmarkId(null);
      }, 5000);
    } catch (error) {
      console.error('Failed to archive bookmark:', error);
      // Show error toast
    }
  }, [archiveMutation]);

  const handleUndo = useCallback(async () => {
    if (!undoBookmarkId) return;

    try {
      await unarchiveMutation.mutateAsync(undoBookmarkId);
      setUndoBookmarkId(null);
    } catch (error) {
      console.error('Failed to unarchive bookmark:', error);
    }
  }, [undoBookmarkId, unarchiveMutation]);

  const handleBookmarkPress = useCallback((bookmarkId: string) => {
    router.push(`/bookmark/${bookmarkId}`);
  }, []);

  // Swipe actions configuration
  const swipeActions: { right: SwipeAction[] } = {
    right: [
      {
        id: 'archive',
        icon: 'archive',
        iconColor: '#ffffff',
        backgroundColor: '#f97316', // Brand orange
        onPress: handleArchive,
        label: 'Archive',
      },
    ],
  };

  // Render functions
  const renderItem = useCallback(({ item }: { item: Bookmark }) => (
    <SwipeableBookmarkItem
      bookmark={item}
      variant="compact"
      rightActions={swipeActions.right}
      onPress={() => handleBookmarkPress(item.id)}
      enableHaptics={true}
    />
  ), [swipeActions, handleBookmarkPress]);

  const renderEmpty = useCallback(() => {
    const emptyMessages: Record<CategoryType, { title: string; description: string }> = {
      all: {
        title: 'No bookmarks yet',
        description: 'Start saving content to see it here',
      },
      videos: {
        title: 'No videos saved yet',
        description: 'Tap + to add your first video',
      },
      podcasts: {
        title: 'No podcasts saved yet',
        description: 'Tap + to add your first podcast',
      },
      articles: {
        title: 'No articles saved yet',
        description: 'Tap + to add your first article',
      },
      posts: {
        title: 'No posts saved yet',
        description: 'Tap + to add your first post',
      },
    };

    const message = emptyMessages[selectedCategory];

    return (
      <View style={styles.emptyState}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          {message.title}
        </Text>
        <Text style={[styles.emptyDescription, { color: colors.secondaryText }]}>
          {message.description}
        </Text>
      </View>
    );
  }, [selectedCategory, colors]);

  const keyExtractor = useCallback((item: Bookmark) => item.id, []);

  const getItemLayout = useCallback(
    (_data: unknown, index: number) => ({
      length: 84,
      offset: 84 * index,
      index,
    }),
    []
  );

  if (!isSignedIn) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Text>Please sign in to view your inbox</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Inbox</Text>
      </View>

      <CategoryTabs
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
      />

      <FlatList
        data={bookmarks}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={bookmarks.length === 0 ? styles.emptyContainer : undefined}
        windowSize={10}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={true}
      />

      {/* Undo Toast */}
      {undoBookmarkId && (
        <View style={[styles.toast, { backgroundColor: colors.card }]}>
          <Text style={[styles.toastText, { color: colors.text }]}>
            Bookmark archived
          </Text>
          <TouchableOpacity onPress={handleUndo}>
            <Text style={[styles.undoButton, { color: colors.primary }]}>
              Undo
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    textAlign: 'center',
  },
  toast: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '500',
  },
  undoButton: {
    fontSize: 14,
    fontWeight: '600',
  },
});
```

---

## API Client Updates

### bookmarksApi.getAll

**File**: `apps/mobile/lib/api.ts` (UPDATE)

```typescript
export const bookmarksApi = {
  // Update getAll to support query parameters
  getAll: async (params?: {
    status?: 'active' | 'archived' | 'deleted';
    sort?: string;
    contentType?: string;
    page?: number;
    limit?: number;
  }): Promise<Bookmark[]> => {
    const queryString = params
      ? '?' + new URLSearchParams(params as any).toString()
      : '';

    return apiClient.get<Bookmark[]>(`/api/v1/bookmarks${queryString}`);
  },

  // Add unarchive method if not exists
  unarchive: async (id: string): Promise<Bookmark> => {
    return apiClient.put<Bookmark>(`/api/v1/bookmarks/${id}/unarchive`);
  },

  // Existing methods...
  archive: async (id: string): Promise<Bookmark> => {
    return apiClient.put<Bookmark>(`/api/v1/bookmarks/${id}/archive`);
  },
  // ... other methods
};
```

---

## Navigation Configuration

### Tab Layout Update

**File**: `apps/mobile/app/(app)/(tabs)/_layout.tsx` (UPDATE)

```typescript
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Feather name="home" size={24} color={color} />
          ),
        }}
      />

      {/* NEW: Inbox Tab */}
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color }) => (
            <Feather name="inbox" size={24} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="collections"
        options={{
          title: 'Collections',
          tabBarIcon: ({ color }) => (
            <Feather name="folder" size={24} color={color} />
          ),
        }}
      />

      {/* ... other tabs */}
    </Tabs>
  );
}
```

---

## Performance Considerations

### FlatList Optimizations

```typescript
<FlatList
  // Required for virtualization
  getItemLayout={(data, index) => ({
    length: 84,        // Fixed item height
    offset: 84 * index,
    index,
  })}

  // Render optimization
  windowSize={10}              // Number of screens to render
  maxToRenderPerBatch={10}     // Items per render batch
  updateCellsBatchingPeriod={50} // ms between batches
  initialNumToRender={15}      // Items on initial load

  // Memory optimization
  removeClippedSubviews={true} // Unmount off-screen items

  // Key extraction
  keyExtractor={(item) => item.id}
/>
```

### Query Caching Strategy

```typescript
// useInboxBookmarks configuration
useQuery({
  queryKey: ['bookmarks', 'inbox', filter],

  // Cache for 5 minutes
  staleTime: 5 * 60 * 1000,

  // Refetch on focus/mount
  refetchOnWindowFocus: true,
  refetchOnMount: true,

  // Keep previous data while refetching
  keepPreviousData: true,
});
```

### Animation Performance

```typescript
// Swipe gesture uses useSharedValue + Reanimated 2
const translateX = useSharedValue(0);

const animatedStyle = useAnimatedStyle(() => ({
  transform: [{ translateX: translateX.value }],
}));

// Spring animation for snap-back
translateX.value = withSpring(0, {
  damping: 30,
  stiffness: 300,
  mass: 1,
});
```

---

## Error Handling

### Archive Failure

```typescript
const handleArchive = async (bookmarkId: string) => {
  try {
    // Optimistic update
    queryClient.setQueryData(['bookmarks', 'inbox', selectedCategory], (old) =>
      old?.filter((b) => b.id !== bookmarkId)
    );

    await archiveMutation.mutateAsync(bookmarkId);
    setUndoBookmarkId(bookmarkId);
  } catch (error) {
    // Revert optimistic update
    queryClient.invalidateQueries(['bookmarks', 'inbox']);

    // Show error toast
    showToast({
      type: 'error',
      message: 'Failed to archive bookmark',
    });
  }
};
```

### Network Failure

```typescript
useQuery({
  queryKey: ['bookmarks', 'inbox', filter],
  queryFn: fetchBookmarks,

  // Retry configuration
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

  // Error handling
  onError: (error) => {
    console.error('Failed to fetch bookmarks:', error);
    showToast({
      type: 'error',
      message: 'Failed to load bookmarks',
    });
  },
});
```

---

## Accessibility

### VoiceOver Support

```typescript
<SwipeableBookmarkItem
  bookmark={bookmark}
  accessibilityLabel={`${bookmark.title} by ${bookmark.creator?.name}`}
  accessibilityHint="Double tap to open, swipe left to archive"
  accessibilityActions={[
    { name: 'archive', label: 'Archive bookmark' },
  ]}
  onAccessibilityAction={(event) => {
    if (event.nativeEvent.actionName === 'archive') {
      handleArchive(bookmark.id);
    }
  }}
/>
```

### Dynamic Font Sizing

```typescript
import { useWindowDimensions, PixelRatio } from 'react-native';

const { fontScale } = useWindowDimensions();

<Text
  style={{
    fontSize: 16 * Math.min(fontScale, 1.3), // Cap at 130%
  }}
  numberOfLines={2}
  adjustsFontSizeToFit
>
  {bookmark.title}
</Text>
```

---

## Testing Strategy

### Unit Tests

```typescript
// useInboxBookmarks.test.ts
describe('useInboxBookmarks', () => {
  it('returns all bookmarks when filter is "all"', async () => {
    const { result } = renderHook(() => useInboxBookmarks('all'));
    await waitFor(() => expect(result.current.bookmarks).toHaveLength(10));
  });

  it('filters bookmarks by content type', async () => {
    const { result } = renderHook(() => useInboxBookmarks('articles'));
    await waitFor(() => {
      expect(result.current.bookmarks.every(b => b.contentType === 'article')).toBe(true);
    });
  });

  it('excludes archived bookmarks', async () => {
    const { result } = renderHook(() => useInboxBookmarks('all'));
    await waitFor(() => {
      expect(result.current.bookmarks.every(b => b.status === 'active')).toBe(true);
    });
  });
});
```

### Integration Tests

```typescript
// InboxScreen.test.tsx
describe('InboxScreen', () => {
  it('archives bookmark on swipe left', async () => {
    const { getByText, queryByText } = render(<InboxScreen />);

    const bookmarkItem = getByText('Test Bookmark');
    fireEvent(bookmarkItem, 'swipeLeft');

    await waitFor(() => {
      expect(queryByText('Test Bookmark')).toBeNull();
      expect(getByText('Bookmark archived')).toBeTruthy();
    });
  });

  it('restores bookmark on undo', async () => {
    const { getByText } = render(<InboxScreen />);

    // Archive
    const bookmarkItem = getByText('Test Bookmark');
    fireEvent(bookmarkItem, 'swipeLeft');

    // Undo
    const undoButton = await waitFor(() => getByText('Undo'));
    fireEvent.press(undoButton);

    await waitFor(() => {
      expect(getByText('Test Bookmark')).toBeTruthy();
    });
  });
});
```

---

## Migration Checklist

- [ ] Create `apps/mobile/app/(app)/(tabs)/inbox.tsx`
- [ ] Create `apps/mobile/hooks/useInboxBookmarks.ts`
- [ ] Create `apps/mobile/hooks/useUnarchiveBookmark.ts`
- [ ] Update `apps/mobile/lib/api.ts` (add `unarchive`, update `getAll`)
- [ ] Update `apps/mobile/app/(app)/(tabs)/_layout.tsx` (add inbox tab)
- [ ] Move/duplicate `CategoryTabs` to inbox screen
- [ ] Create toast notification component (or use library)
- [ ] Create empty state components
- [ ] Add analytics tracking
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Update documentation

---

## Dependencies

### Required (All Existing)
- `@tanstack/react-query` - Data fetching
- `react-native-reanimated` - Swipe animations
- `react-native-gesture-handler` - Swipe gestures
- `expo-router` - Navigation
- `@expo/vector-icons` - Icons
- `@clerk/clerk-expo` - Authentication

### Optional (For Enhancements)
- `react-native-toast-message` - Toast notifications
- `@gorhom/bottom-sheet` - Bottom sheet for filter options

---

## File Size Impact

Estimated additions:
- `inbox.tsx`: ~400 lines
- `useInboxBookmarks.ts`: ~60 lines
- `useUnarchiveBookmark.ts`: ~30 lines
- `api.ts` updates: ~20 lines

**Total**: ~510 new lines of code

---

## Performance Benchmarks

Target performance metrics:
- **Initial load**: < 300ms from tab tap to first render
- **Filter switch**: < 100ms to update list
- **Swipe gesture**: < 16ms latency (60fps)
- **Archive action**: < 300ms from swipe to UI update
- **List scroll**: 60fps with 1000 items
- **Memory usage**: < 100MB for 1000 items

---

**Last Updated**: 2025-10-21
