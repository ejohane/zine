# Creator Information Feature Implementation Plan

## Context

This feature adds creator information to bookmarks in the mobile app, enabling users to see details about content creators and browse all saved content from specific creators. The system already has a robust database structure with a `content` table that includes creator fields, and API enrichment services that fetch creator data from YouTube and Spotify APIs.

## Current State Analysis

### Database Schema
The `content` table already includes creator fields:
- `creatorId`: Platform-specific creator ID
- `creatorName`: Display name of the creator
- `creatorHandle`: Platform handle (e.g., @username)
- `creatorThumbnail`: Profile image URL
- `creatorVerified`: Verification status
- `creatorSubscriberCount`: Subscriber/follower count
- `creatorFollowerCount`: Alternative follower metric

The `creators` table exists for dedicated creator profiles:
- `id`: Platform-specific ID (e.g., youtube:UCabc123)
- `name`: Display name
- `handle`: Platform handle
- `avatarUrl`: Profile image
- `bio`: Description
- `url`: Canonical profile URL
- `platforms`: JSON array of platforms
- `externalLinks`: JSON array of {title, url} objects

### API Enrichment
The YouTube and Spotify extractors already collect creator information:
- **YouTube**: `channelId`, `channelTitle` from video snippet
- **Spotify**: `publisher` from show details
- Creator data is stored but not fully exposed through bookmark endpoints

### Mobile App
- Bookmark detail view exists at `/bookmark/[id].tsx`
- Basic creator name display exists (line 357): `bookmark.creator?.name || 'Unknown Author'`
- Creator avatar display exists (lines 350-355) but needs proper data
- Routing uses Expo Router with file-based routing

## Feature Specification

### 1. Creator Information in Bookmark View
Display creator information at the top of the page, with the hero image on the left and creator info to the right:
- Hero/thumbnail image on the left side
- To the right of the image:
  - Circular creator avatar (40x40)
  - Creator name next to the avatar
  - Both elements are clickable and navigate to creator page

### 2. Creator Page
New page at `/creator/[id].tsx` showing:
- **Header Section**:
  - Large circular avatar (80x80)
  - Creator name
  - Platform indicator (YouTube/Spotify icon)
  - Subscriber/follower count if available
  - Verified badge if applicable
  - External link button to creator's platform profile

- **Content Section**:
  - List of all saved bookmarks from this creator
  - Sorted by publish date (newest first)
  - Use existing bookmark card components
  - Show content type badges (video/podcast/article)

### 3. API Enhancements
Ensure creator data flows through the system:
- Bookmark endpoints must include full creator information
- New endpoint for fetching bookmarks by creator
- Ensure creator data is properly extracted and stored

## Implementation Status

### ✅ Phase 1: Backend - Enhance Bookmark Endpoints (COMPLETED)

**Status**: Fully implemented and tested
**Date Completed**: September 25, 2025
**Implementation Details**:
- Updated bookmark GET endpoints to include creator fields from content table
- Added `/api/v1/bookmarks/creator/:creatorId` endpoint for fetching bookmarks by creator
- Modified `mapRowToBookmark` method in D1Repository to include creator information
- All queries now join with content table and select creator fields

### ✅ Phase 2: Backend - Creator Management (COMPLETED)

**Status**: Fully implemented 
**Date Completed**: September 25, 2025
**Implementation Details**:
- Created `CreatorRepository` class at `/packages/api/src/repositories/creator-repository.ts`
- Implemented `upsertCreator` method for insert/update operations
- Implemented `getCreator` method for fetching creator by ID
- Implemented `getCreatorBookmarksCount` for counting bookmarks per creator
- Added creator data upsert to enriched bookmark save flow
- Creator data is now persisted to dedicated `creators` table when saving enriched content

## Implementation Phases

### Phase 1: Backend - Enhance Bookmark Endpoints

#### 1.1 Update Bookmark GET Endpoints
**File**: `/packages/api/src/index.ts`

Modify the `/api/v1/bookmarks` and `/api/v1/bookmarks/:id` endpoints to include creator information from the content table.

**Current query** (simplified):
```sql
SELECT b.*, c.url, c.title, c.description, c.thumbnail_url
FROM bookmarks b
JOIN content c ON b.content_id = c.id
WHERE b.user_id = ?
```

**Updated query**:
```sql
SELECT 
  b.*,
  c.url,
  c.title,
  c.description,
  c.thumbnail_url,
  c.creator_id,
  c.creator_name,
  c.creator_handle,
  c.creator_thumbnail,
  c.creator_verified,
  c.creator_subscriber_count,
  c.provider as creator_platform
FROM bookmarks b
JOIN content c ON b.content_id = c.id
WHERE b.user_id = ?
```

#### 1.2 Create Bookmarks-by-Creator Endpoint
**File**: `/packages/api/src/index.ts`

Add new endpoint:
```typescript
app.get('/api/v1/bookmarks/creator/:creatorId', async (c) => {
  // Get all bookmarks for a specific creator
  // Query joins bookmarks -> content filtering by creatorId
  // Returns array of bookmarks with full metadata
})
```

#### 1.3 Enhance Creator Data Extraction
**File**: `/packages/api/src/services/api-enrichment-service.ts`

Update `transformYouTubeApiResponse` method to include:
```typescript
creatorThumbnail: // Extract from channel snippet if available
creatorHandle: // Format from channel custom URL if available
creatorVerified: // Check channel status
creatorSubscriberCount: // Get from channel statistics if available
```

Update `transformSpotifyApiResponse` method to include:
```typescript
creatorId: episode.show?.id,
creatorThumbnail: episode.show?.images?.[0]?.url,
creatorHandle: // Format from show name
```

### Phase 2: Backend - Creator Management ✅ COMPLETED

#### 2.1 Create Creator Repository ✅
**File**: `/packages/api/src/repositories/creator-repository.ts`

**Implementation**: Complete with full TypeScript interfaces and D1 database integration.

#### 2.2 Update Content Saving Flow ✅
**Files Modified**: 
- `/packages/api/src/routes/enriched-bookmarks.ts` - Added creator upsert when saving enriched content
- Creator data is automatically upserted to the `creators` table when bookmarks are saved with creator information

### Phase 3: Mobile App - Update Data Types

#### 3.1 Update TypeScript Types
**File**: `/apps/mobile/types/bookmark.ts` (create if doesn't exist)

```typescript
export interface Creator {
  id: string;
  name: string;
  handle?: string;
  avatarUrl?: string;
  verified?: boolean;
  subscriberCount?: number;
  platform: 'youtube' | 'spotify' | 'twitter' | 'web';
  url?: string;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  description?: string;
  thumbnailUrl?: string;
  creator?: Creator;
  contentType?: string;
  createdAt: string;
  // ... other existing fields
}
```

#### 3.2 Update API Client
**File**: `/apps/mobile/lib/api.ts`

Update response types to include creator information and add new method:
```typescript
getBookmarksByCreator: async (creatorId: string, token: string): Promise<Bookmark[]>
```

### Phase 4: Mobile App - Bookmark Detail View

#### 4.1 Update Bookmark Detail Screen
**File**: `/apps/mobile/app/(app)/bookmark/[id].tsx`

**Lines to modify**: Replace the entire hero section (lines 307-337) and the section below it

Instead of a full-width hero image, create a new layout with image on the left and creator info on the right:

```tsx
{/* Header Section with Image and Creator Info */}
<View style={styles.headerSection}>
  {/* Left: Hero Image */}
  <View style={styles.heroImageContainer}>
    {bookmark.thumbnailUrl && !imageError ? (
      <Image
        source={{ uri: bookmark.thumbnailUrl }}
        style={styles.heroImage}
        resizeMode="cover"
        onError={() => setImageError(true)}
      />
    ) : (
      <View style={[styles.heroImagePlaceholder, { backgroundColor: colors.secondary }]}>
        <Feather name="image" size={32} color={colors.mutedForeground} />
      </View>
    )}
    {formattedDuration && (
      <View style={styles.durationBadge}>
        <Text style={styles.durationText}>{formattedDuration}</Text>
      </View>
    )}
  </View>
  
  {/* Right: Creator Info */}
  <TouchableOpacity 
    style={styles.creatorSection}
    onPress={() => {
      if (bookmark.creator?.id) {
        router.push(`/creator/${bookmark.creator.id}`)
      }
    }}
    activeOpacity={0.7}
  >
    {bookmark.creator?.avatarUrl ? (
      <Image
        source={{ uri: bookmark.creator.avatarUrl }}
        style={styles.creatorAvatar}
        onError={() => {}}
      />
    ) : (
      <View style={[styles.creatorAvatarPlaceholder, { backgroundColor: colors.secondary }]}>
        <Feather name="user" size={20} color={colors.mutedForeground} />
      </View>
    )}
    <Text style={[styles.creatorName, { color: colors.foreground }]} numberOfLines={2}>
      {bookmark.creator?.name || 'Unknown Creator'}
    </Text>
    {bookmark.creator?.verified && (
      <Feather name="check-circle" size={14} color={colors.primary} style={styles.verifiedBadge} />
    )}
  </TouchableOpacity>
</View>
```

Add/update styles:
```typescript
headerSection: {
  flexDirection: 'row',
  padding: 20,
  gap: 16,
},
heroImageContainer: {
  width: 120,
  height: 120,
  position: 'relative',
},
heroImage: {
  width: '100%',
  height: '100%',
  borderRadius: 12,
},
heroImagePlaceholder: {
  width: '100%',
  height: '100%',
  borderRadius: 12,
  alignItems: 'center',
  justifyContent: 'center',
},
durationBadge: {
  position: 'absolute',
  bottom: 8,
  right: 8,
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderRadius: 4,
},
durationText: {
  color: '#fff',
  fontSize: 11,
  fontWeight: '600',
},
creatorSection: {
  flex: 1,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
},
creatorAvatar: {
  width: 40,
  height: 40,
  borderRadius: 20,
},
creatorAvatarPlaceholder: {
  width: 40,
  height: 40,
  borderRadius: 20,
  alignItems: 'center',
  justifyContent: 'center',
},
creatorName: {
  flex: 1,
  fontSize: 16,
  fontWeight: '600',
},
verifiedBadge: {
  marginLeft: 4,
},
```

### Phase 5: Mobile App - Creator Page

#### 5.1 Create Creator Page Component
**File**: `/apps/mobile/app/(app)/creator/[id].tsx`

```tsx
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  FlatList,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/auth';
import { useTheme } from '../../../contexts/theme';
import { api } from '../../../lib/api';
import { BookmarkCard } from '../../../components/BookmarkCard';
import { PlatformIcon } from '../../../lib/platformIcons';
import type { Bookmark, Creator } from '../../../types/bookmark';

export default function CreatorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();
  const { colors } = useTheme();
  const [creator, setCreator] = useState<Creator | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Implementation details:
  // 1. Fetch creator details from first bookmark or dedicated endpoint
  // 2. Fetch all bookmarks for this creator
  // 3. Display creator header with avatar, name, stats
  // 4. List bookmarks using existing card components
  // 5. Handle loading and error states
}
```

#### 5.2 Create useCreatorBookmarks Hook
**File**: `/apps/mobile/hooks/useCreatorBookmarks.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../contexts/auth';

export function useCreatorBookmarks(creatorId: string | undefined) {
  const { getToken, isSignedIn } = useAuth();
  
  return useQuery({
    queryKey: ['creator-bookmarks', creatorId],
    queryFn: async () => {
      const token = await getToken();
      if (!token || !creatorId) throw new Error('Missing requirements');
      return api.getBookmarksByCreator(creatorId, token);
    },
    enabled: isSignedIn && !!creatorId,
  });
}
```

### Phase 6: Mobile App - UI Components

#### 6.1 Create Compact Bookmark Card for Creator Page
**File**: `/apps/mobile/components/CompactBookmarkCard.tsx`

Create a more compact version of bookmark card specifically for the creator page list, showing:
- Small thumbnail (60x60)
- Title (max 2 lines)
- Content type badge
- Duration/reading time
- Published date

#### 6.2 Add Platform Icons
Ensure platform icons properly display for:
- YouTube (red play button)
- Spotify (green circle)
- Other platforms

### Phase 7: Testing & Polish

#### 7.1 Test Data Flow
1. Save a YouTube video bookmark
2. Verify creator data is stored in content table
3. Check bookmark detail shows creator info
4. Test navigation to creator page
5. Verify all bookmarks from creator are listed

#### 7.2 Edge Cases
- Handle bookmarks without creator info (older bookmarks, web articles)
- Handle creators with no avatar
- Handle very long creator names
- Test with creators who have many bookmarks (pagination may be needed)

#### 7.3 Performance Optimization
- Consider caching creator data
- Implement pagination for creator bookmarks if list is long
- Optimize image loading for creator avatars

## Migration Considerations

### Existing Bookmarks
Bookmarks created before this feature won't have creator information. Options:
1. Run a migration to enrich existing content with creator data
2. Show "Unknown Creator" for legacy bookmarks
3. Fetch creator data on-demand when viewing old bookmarks

### Database Indexes
Add indexes for efficient querying:
```sql
CREATE INDEX idx_content_creator_id ON content(creator_id);
CREATE INDEX idx_content_creator_name ON content(creator_name);
```

## API Response Examples

### GET /api/v1/bookmarks/:id Response
```json
{
  "id": "bookmark-123",
  "userId": "user-456",
  "contentId": "youtube-abc",
  "title": "Building a React Native App",
  "url": "https://youtube.com/watch?v=abc",
  "thumbnailUrl": "https://i.ytimg.com/...",
  "creator": {
    "id": "youtube:UC123",
    "name": "Tech Channel",
    "handle": "@techchannel",
    "avatarUrl": "https://yt3.ggpht.com/...",
    "verified": true,
    "subscriberCount": 150000,
    "platform": "youtube"
  },
  "contentType": "video",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### GET /api/v1/bookmarks/creator/:creatorId Response
```json
{
  "creator": {
    "id": "youtube:UC123",
    "name": "Tech Channel",
    "handle": "@techchannel",
    "avatarUrl": "https://yt3.ggpht.com/...",
    "verified": true,
    "subscriberCount": 150000,
    "platform": "youtube",
    "url": "https://youtube.com/@techchannel"
  },
  "bookmarks": [
    {
      "id": "bookmark-123",
      "title": "Building a React Native App",
      "thumbnailUrl": "https://i.ytimg.com/...",
      "contentType": "video",
      "duration": 1250,
      "publishedAt": "2024-01-10T08:00:00Z",
      "createdAt": "2024-01-15T10:30:00Z"
    },
    {
      "id": "bookmark-124",
      "title": "Advanced TypeScript Patterns",
      "thumbnailUrl": "https://i.ytimg.com/...",
      "contentType": "video",
      "duration": 980,
      "publishedAt": "2024-01-05T12:00:00Z",
      "createdAt": "2024-01-14T09:15:00Z"
    }
  ],
  "totalCount": 2
}
```

## Success Metrics

Feature is complete when:
1. ✅ Creator information displays in bookmark detail view
2. ✅ Clicking creator navigates to creator page
3. ✅ Creator page shows all saved bookmarks from that creator
4. ✅ Creator data is properly extracted from YouTube and Spotify
5. ✅ API endpoints return complete creator information
6. ✅ UI handles all edge cases gracefully
7. ✅ Performance is acceptable (page loads < 2 seconds)

## Notes for Implementation

- Start with Phase 1-2 (backend) to ensure data availability
- Phases can be worked on in parallel by different developers
- Mobile app changes (Phases 3-6) depend on backend being ready
- Consider using mock data for mobile development while backend is being built
- Test with real YouTube and Spotify content to ensure extractors work properly
- The creator ID format should be consistent: `{platform}:{platformCreatorId}`