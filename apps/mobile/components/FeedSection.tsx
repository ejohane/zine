import * as React from 'react';
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { Card } from 'heroui-native';
import { useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useFeedItems } from '../hooks/useFeedItems';
import { useAuth } from '../contexts/auth';
import { useTheme } from '../contexts/theme';
import { formatDistanceToNow } from '../lib/dateUtils';

const SkeletonCard = React.memo(() => {
  const { colors } = useTheme();
  return (
    <Card className="w-[280px] h-[140px] p-4 mr-3" style={{ backgroundColor: colors.card }}>
      <View className="space-y-3">
        <View className="h-4 bg-gray-200 rounded-md w-3/4 animate-pulse" />
        <View className="h-3 bg-gray-200 rounded-md w-1/2 animate-pulse" />
        <View className="flex-row space-x-2 mt-auto">
          <View className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
          <View className="h-6 w-20 bg-gray-200 rounded-full animate-pulse" />
        </View>
      </View>
    </Card>
  );
});

SkeletonCard.displayName = 'SkeletonCard';

interface FeedCardProps {
  item: {
    id: string;
    feedItem: {
      id: string;
      title: string;
      thumbnailUrl?: string | null;
      publishedAt: string;
      contentType?: string;
      durationSeconds?: number | null;
      subscription: {
        id: string;
        providerId: string;
        externalId: string;
        title: string;
        creatorName: string;
        thumbnailUrl?: string | null;
      };
    };
  };
  onPress: () => void;
}

const FeedCard = React.memo<FeedCardProps>(({ item, onPress }) => {
  const { colors } = useTheme();
  const { feedItem } = item;

  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return null;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getContentIcon = () => {
    switch (feedItem.contentType) {
      case 'video':
        return { name: 'play-circle', color: '#FF0000' };
      case 'podcast':
        return { name: 'mic', color: '#1DB954' };
      default:
        return { name: 'file-text', color: colors.primary };
    }
  };

  const contentIcon = getContentIcon();
  const displayDuration = formatDuration(feedItem.durationSeconds);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.thumbnailContainer}>
        {feedItem.thumbnailUrl ? (
          <Image
            source={{ uri: feedItem.thumbnailUrl, cache: 'force-cache' }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumbnailPlaceholder, { backgroundColor: colors.secondary }]}>
            <Feather name="image" size={24} color={colors.mutedForeground} />
          </View>
        )}
        {displayDuration && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{displayDuration}</Text>
          </View>
        )}
      </View>

      <View style={styles.cardContent}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
          {feedItem.title}
        </Text>
        
        <View style={styles.meta}>
          <Feather 
            name={contentIcon.name as any} 
            size={14} 
            color={contentIcon.color} 
          />
          <Text style={[styles.creator, { color: colors.mutedForeground }]} numberOfLines={1}>
            {feedItem.subscription.creatorName}
          </Text>
        </View>

        <Text style={[styles.date, { color: colors.mutedForeground }]}>
          {formatDistanceToNow(feedItem.publishedAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

FeedCard.displayName = 'FeedCard';

interface FeedSectionProps {
  onRefresh?: () => void;
}

export const FeedSection = React.memo<FeedSectionProps>(({ onRefresh }) => {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const { 
    data, 
    isLoading, 
    error, 
    refetch 
  } = useFeedItems({
    enabled: isSignedIn,
    limit: 10,
    unreadOnly: true,
  });

  const handleRefresh = () => {
    refetch();
    onRefresh?.();
  };

  if (!isSignedIn) {
    return null;
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Card style={[styles.errorCard, { backgroundColor: colors.card }]}>
          <View style={styles.errorContent}>
            <Ionicons name="alert-circle" size={24} color="#EF4444" />
            <View style={styles.errorTextContainer}>
              <Text style={[styles.errorTitle, { color: colors.foreground }]}>
                Failed to load feed
              </Text>
              <Text style={[styles.errorMessage, { color: colors.mutedForeground }]}>
                {error.message || 'Please try again later'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleRefresh}
              style={styles.retryButton}
            >
              <Text style={[styles.retryButtonText, { color: colors.primary }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        </Card>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.section}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </ScrollView>
      </View>
    );
  }

  const feedItems = data?.feedItems || [];

  if (feedItems.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        snapToInterval={296}
        snapToAlignment="start"
        decelerationRate="fast"
      >
        {feedItems.map((item, index) => (
          <View
            key={item.id}
            style={{
              marginRight: index === feedItems.length - 1 ? 0 : 16,
            }}
          >
            <FeedCard
              item={item}
              onPress={() => {
                router.push(`/bookmark/${item.feedItem.id}`);
              }}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
});

FeedSection.displayName = 'FeedSection';

const styles = StyleSheet.create({
  section: {
    paddingBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  card: {
    width: 280,
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbnailContainer: {
    width: '100%',
    height: 120,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  durationText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  cardContent: {
    padding: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 20,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  creator: {
    fontSize: 13,
    flex: 1,
  },
  date: {
    fontSize: 12,
  },
  errorContainer: {
    marginHorizontal: 16,
    paddingBottom: 16,
  },
  errorCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  errorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorTextContainer: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 12,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
