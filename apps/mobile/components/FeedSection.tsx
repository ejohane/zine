import * as React from 'react';
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Card } from 'heroui-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFeedItems } from '../hooks/useFeedItems';
import { useAuth } from '../contexts/auth';
import { useTheme } from '../contexts/theme';
import { MediaRichBookmarkCard } from './MediaRichBookmarkCard';
import { feedItemToBookmark } from '../lib/contentCardAdapters';

const SkeletonCard = React.memo(() => {
  const { colors } = useTheme();
  return (
    <Card style={[styles.skeletonCard, { backgroundColor: colors.card }]}>
      <View style={styles.skeletonContent}>
        <View style={[styles.skeletonThumbnail, { backgroundColor: colors.secondary }]} />
        <View style={styles.skeletonInfo}>
          <View style={[styles.skeletonTitle, { backgroundColor: colors.secondary }]} />
          <View style={[styles.skeletonMeta, { backgroundColor: colors.secondary }]} />
        </View>
      </View>
    </Card>
  );
});

SkeletonCard.displayName = 'SkeletonCard';

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
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>From your Feed</Text>
      </View>
      <View style={styles.section}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          snapToInterval={312}
          snapToAlignment="start"
          decelerationRate="fast"
        >
          {feedItems.map((item, index) => (
            <View
              key={item.id}
              style={{
                marginRight: index === feedItems.length - 1 ? 0 : 12,
              }}
            >
              <MediaRichBookmarkCard
                bookmark={feedItemToBookmark(item)}
                onPress={() => {
                  router.push(`/content/${item.feedItem.contentId}?feedItemId=${item.id}`);
                }}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
});

FeedSection.displayName = 'FeedSection';

const styles = StyleSheet.create({
  sectionContainer: {
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  section: {
    paddingBottom: 16,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skeletonCard: {
    width: 300,
    height: 240,
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
  },
  skeletonContent: {
    flex: 1,
  },
  skeletonThumbnail: {
    width: '100%',
    height: 169,
    borderRadius: 8,
    marginBottom: 12,
  },
  skeletonInfo: {
    flex: 1,
  },
  skeletonTitle: {
    height: 16,
    borderRadius: 4,
    marginBottom: 8,
  },
  skeletonMeta: {
    height: 12,
    borderRadius: 4,
    width: '60%',
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
