import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  FlatList,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../../contexts/auth';
import { useTheme } from '../../../contexts/theme';
import { api } from '../../../lib/api';
import type { Bookmark, Creator } from '../../../types/bookmark';
import { PlatformIcon } from '../../../lib/platformIcons';
import { CompactBookmarkCard } from '../../../components/CompactBookmarkCard';


export default function CreatorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken, isSignedIn } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const [creator, setCreator] = useState<Creator | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    if (id && isSignedIn) {
      fetchCreatorBookmarks(1, true);
    }
  }, [id, isSignedIn]);

  const fetchCreatorBookmarks = async (pageNum: number = 1, reset: boolean = false) => {
    try {
      if (reset) {
        setLoading(true);
        setBookmarks([]);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }
      
      const data = await api.getBookmarksByCreatorWithDetails(id!, token, pageNum, 20);
      
      if (data.creator) {
        // Ensure required fields are present for Creator type
        const creatorData: Creator = {
          id: data.creator.id || id!,
          name: data.creator.name || 'Unknown Creator',
          handle: data.creator.handle,
          avatarUrl: data.creator.avatarUrl,
          verified: data.creator.verified,
          subscriberCount: data.creator.subscriberCount,
          platform: data.creator.platform || 'web',
          url: data.creator.url,
        };
        setCreator(creatorData);
      } else if (pageNum === 1) {
        // If no creator data on first page load, use fallback
        setCreator({
          id: id!,
          name: 'Unknown Creator',
          platform: 'web',
        });
      }
      
      // Set pagination info
      setHasNextPage(data.hasNextPage || false);
      setTotalCount(data.totalCount || 0);
      setPage(pageNum);
      
      if (data.bookmarks && data.bookmarks.length > 0) {
        // Map bookmarks ensuring required fields
        const mappedBookmarks: Bookmark[] = data.bookmarks.map((b: any) => ({
          id: b.id || '',
          title: b.title || 'Untitled',
          url: b.url || b.originalUrl || '',
          description: b.description,
          thumbnailUrl: b.thumbnailUrl,
          creator: data.creator ? {
            id: data.creator.id || id!,
            name: data.creator.name || 'Unknown Creator',
            handle: data.creator.handle,
            avatarUrl: data.creator.avatarUrl,
            verified: data.creator.verified,
            subscriberCount: data.creator.subscriberCount,
            platform: data.creator.platform || 'web',
            url: data.creator.url,
          } : undefined,
          contentType: b.contentType,
          createdAt: b.createdAt || new Date().toISOString(),
          publishedAt: typeof b.publishedAt === 'number' 
            ? new Date(b.publishedAt).toISOString() 
            : b.publishedAt,
          duration: b.duration,
        }));
        
        // Append or replace bookmarks depending on reset flag
        if (reset) {
          setBookmarks(mappedBookmarks);
        } else {
          setBookmarks(prev => [...prev, ...mappedBookmarks]);
        }
      } else if (reset) {
        setError('No bookmarks found for this creator');
      }
    } catch (err) {
      console.error('Error fetching creator bookmarks:', err);
      setError('Failed to load creator bookmarks');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleOpenCreatorProfile = async () => {
    if (creator?.url) {
      try {
        await Linking.openURL(creator.url);
      } catch (error) {
        Alert.alert('Error', 'Could not open creator profile');
      }
    }
  };

  const formatSubscriberCount = (count?: number) => {
    if (!count) return null;
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M subscribers`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K subscribers`;
    }
    return `${count} subscribers`;
  };

  const renderBookmarkItem = ({ item }: { item: Bookmark }) => (
    <View style={{ marginHorizontal: 16 }}>
      <CompactBookmarkCard
        bookmark={item}
        onPress={() => router.push(`/bookmark/${item.id}`)}
      />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: 'Creator',
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.foreground,
          }}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Loading creator bookmarks...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: 'Creator',
            headerStyle: { backgroundColor: colors.card },
            headerTintColor: colors.foreground,
          }}
        />
        <View style={styles.centered}>
          <Feather name="alert-circle" size={48} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.foreground }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => fetchCreatorBookmarks(1, true)}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen
        options={{
          title: creator?.name || 'Creator',
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.foreground,
        }}
      />
      
      {/* Creator Header */}
      {creator && (
        <View style={[styles.creatorHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.creatorInfo}>
            {/* Avatar */}
            <View style={styles.avatarContainer}>
              {creator.avatarUrl ? (
                <Image
                  source={{ 
                    uri: creator.avatarUrl,
                    cache: 'force-cache'
                  }}
                  style={styles.avatar}
                  resizeMode="cover"
                  onError={() => {}}
                />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.secondary }]}>
                  <Feather name="user" size={32} color={colors.mutedForeground} />
                </View>
              )}
              {creator.verified && (
                <View style={styles.verifiedBadgeContainer}>
                  <Feather name="check-circle" size={20} color="#1DA1F2" />
                </View>
              )}
            </View>

            {/* Creator Details */}
            <View style={styles.creatorDetails}>
              <View style={styles.nameRow}>
                <Text style={[styles.creatorName, { color: colors.foreground }]}>
                  {creator.name}
                </Text>
                {creator.platform && (
                  <View style={styles.platformIcon}>
                    <PlatformIcon source={creator.platform as any} size={18} />
                  </View>
                )}
              </View>
              
              {creator.handle && (
                <Text style={[styles.creatorHandle, { color: colors.mutedForeground }]}>
                  {creator.handle}
                </Text>
              )}
              
              {creator.subscriberCount && (
                <Text style={[styles.subscriberCount, { color: colors.mutedForeground }]}>
                  {formatSubscriberCount(creator.subscriberCount)}
                </Text>
              )}
            </View>
          </View>

          {/* Open Profile Button */}
          {creator.url && (
            <TouchableOpacity
              style={[styles.openProfileButton, { borderColor: colors.border }]}
              onPress={handleOpenCreatorProfile}
              activeOpacity={0.7}
            >
              <Feather name="external-link" size={16} color={colors.primary} />
              <Text style={[styles.openProfileText, { color: colors.primary }]}>
                View Profile
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Bookmarks Count */}
      <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Saved Bookmarks {totalCount > 0 ? `(${totalCount})` : `(${bookmarks.length})`}
        </Text>
      </View>

      {/* Bookmarks List */}
      <FlatList
        data={bookmarks}
        renderItem={renderBookmarkItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="bookmark" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No bookmarks from this creator
            </Text>
          </View>
        }
        onEndReached={() => {
          if (hasNextPage && !loadingMore) {
            fetchCreatorBookmarks(page + 1, false);
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingFooter}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingMoreText, { color: colors.mutedForeground }]}>
                Loading more bookmarks...
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  creatorHeader: {
    padding: 20,
    borderBottomWidth: 1,
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadgeContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 2,
  },
  creatorDetails: {
    flex: 1,
    marginLeft: 16,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  creatorName: {
    fontSize: 20,
    fontWeight: '700',
  },
  platformIcon: {
    marginLeft: 4,
  },
  creatorHandle: {
    fontSize: 14,
    marginTop: 2,
  },
  subscriberCount: {
    fontSize: 14,
    marginTop: 4,
  },
  openProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  openProfileText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 20,
  },
  separator: {
    height: 8,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
  },
  loadingFooter: {
    padding: 16,
    alignItems: 'center',
  },
  loadingMoreText: {
    marginTop: 8,
    fontSize: 14,
  },
});