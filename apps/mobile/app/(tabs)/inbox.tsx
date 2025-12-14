import { Surface } from 'heroui-native';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Colors, Typography, Spacing, Radius, Shadows, ContentColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useInboxItems,
  useBookmarkItem,
  useArchiveItem,
  formatDuration,
  mapContentType,
} from '@/hooks/use-items-trpc';

// Inbox arrow icon
function InboxArrowIcon({ size = 64, color = '#6366F1' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path
        fillRule="evenodd"
        d="M5.478 5.559A1.5 1.5 0 0 1 6.912 4.5H9A.75.75 0 0 0 9 3H6.912a3 3 0 0 0-2.868 2.118l-2.411 7.838a3 3 0 0 0-.133.882V18a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-4.162a3 3 0 0 0-.133-.882l-2.412-7.838A3 3 0 0 0 17.088 3H15a.75.75 0 0 0 0 1.5h2.088a1.5 1.5 0 0 1 1.434 1.059l2.213 7.191H17.89a3 3 0 0 0-2.684 1.658l-.256.513a1.5 1.5 0 0 1-1.342.829h-3.216a1.5 1.5 0 0 1-1.342-.829l-.256-.513A3 3 0 0 0 6.11 13.75H2.765l2.213-7.191Z"
        clipRule="evenodd"
      />
      <Path
        fillRule="evenodd"
        d="M12 2.25a.75.75 0 0 1 .75.75v6.44l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 1.06-1.06l1.72 1.72V3a.75.75 0 0 1 .75-.75Z"
        clipRule="evenodd"
      />
    </Svg>
  );
}

// Bookmark icon
function BookmarkIcon({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path
        fillRule="evenodd"
        d="M6.32 2.577a49.255 49.255 0 0 1 11.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 0 1-1.085.67L12 18.089l-7.165 3.583A.75.75 0 0 1 3.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93Z"
        clipRule="evenodd"
      />
    </Svg>
  );
}

// Archive icon
function ArchiveIcon({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M3.375 3C2.339 3 1.5 3.84 1.5 4.875v.75c0 1.036.84 1.875 1.875 1.875h17.25c1.035 0 1.875-.84 1.875-1.875v-.75C22.5 3.839 21.66 3 20.625 3H3.375Z" />
      <Path
        fillRule="evenodd"
        d="m3.087 9 .54 9.176A3 3 0 0 0 6.62 21h10.757a3 3 0 0 0 2.995-2.824L20.913 9H3.087Zm6.163 3.75A.75.75 0 0 1 10 12h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1-.75-.75Z"
        clipRule="evenodd"
      />
    </Svg>
  );
}

type InboxItem = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  contentType: 'VIDEO' | 'PODCAST' | 'ARTICLE' | 'POST';
  creator: string;
  publisher: string | null;
  duration: number | null;
};

function InboxItemCard({
  item,
  colors,
  onBookmark,
  onArchive,
  isBookmarking,
  isArchiving,
}: {
  item: InboxItem;
  colors: (typeof Colors)['light'];
  onBookmark: () => void;
  onArchive: () => void;
  isBookmarking: boolean;
  isArchiving: boolean;
}) {
  const contentType = mapContentType(item.contentType as 'VIDEO' | 'PODCAST' | 'ARTICLE' | 'POST');
  const contentColor = ContentColors[contentType];

  return (
    <Animated.View entering={FadeInDown.duration(300)} style={styles.cardWrapper}>
      <Pressable
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.card },
          Shadows.md,
          pressed && { opacity: 0.95 },
        ]}
      >
        {/* Thumbnail */}
        <View style={styles.thumbnailContainer}>
          {item.thumbnailUrl ? (
            <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
          ) : (
            <View
              style={[styles.thumbnailPlaceholder, { backgroundColor: colors.backgroundTertiary }]}
            >
              <Text style={[styles.thumbnailPlaceholderText, { color: colors.textTertiary }]}>
                {item.contentType.charAt(0)}
              </Text>
            </View>
          )}
          {/* Duration badge */}
          {item.duration && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
            </View>
          )}
          {/* Content type badge */}
          <View style={[styles.typeBadge, { backgroundColor: contentColor }]}>
            <Text style={styles.typeText}>{contentType}</Text>
          </View>
        </View>

        {/* Content */}
        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.cardCreator, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.creator}
            {item.publisher && ` · ${item.publisher}`}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.cardActions}>
          <Pressable
            onPress={onArchive}
            disabled={isArchiving}
            style={({ pressed }) => [
              styles.actionButton,
              styles.archiveButton,
              { backgroundColor: colors.backgroundTertiary },
              pressed && { opacity: 0.8 },
            ]}
          >
            {isArchiving ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <ArchiveIcon size={18} color={colors.textSecondary} />
            )}
          </Pressable>
          <Pressable
            onPress={onBookmark}
            disabled={isBookmarking}
            style={({ pressed }) => [
              styles.actionButton,
              styles.bookmarkButton,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.8 },
            ]}
          >
            {isBookmarking ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <BookmarkIcon size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function EmptyState({ colors }: { colors: (typeof Colors)['light'] }) {
  return (
    <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.backgroundSecondary }]}>
        <InboxArrowIcon size={48} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Your inbox is clear</Text>
      <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
        New content from your sources will appear here. Bookmark what you want to keep, archive the
        rest.
      </Text>
      <View style={[styles.emptyHint, { backgroundColor: colors.backgroundSecondary }]}>
        <Text style={[styles.emptyHintText, { color: colors.textTertiary }]}>
          Connect sources in Settings to start receiving content
        </Text>
      </View>
    </Animated.View>
  );
}

function LoadingState({ colors }: { colors: (typeof Colors)['light'] }) {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function ErrorState({ colors, message }: { colors: (typeof Colors)['light']; message: string }) {
  return (
    <View style={styles.errorState}>
      <Text style={[styles.errorText, { color: colors.error }]}>{message}</Text>
    </View>
  );
}

export default function InboxScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const { data, isLoading, error, status, fetchStatus } = useInboxItems();
  const bookmarkMutation = useBookmarkItem();
  const archiveMutation = useArchiveItem();

  // Debug logging
  console.log('[Inbox] Query status:', status, 'fetchStatus:', fetchStatus);
  console.log('[Inbox] Data:', JSON.stringify(data, null, 2));
  console.log('[Inbox] Error:', error);

  const handleBookmark = (id: string) => {
    bookmarkMutation.mutate({ id });
  };

  const handleArchive = (id: string) => {
    archiveMutation.mutate({ id });
  };

  const renderItem = ({ item }: { item: InboxItem }) => (
    <InboxItemCard
      item={item}
      colors={colors}
      onBookmark={() => handleBookmark(item.id)}
      onArchive={() => handleArchive(item.id)}
      isBookmarking={bookmarkMutation.isPending && bookmarkMutation.variables?.id === item.id}
      isArchiving={archiveMutation.isPending && archiveMutation.variables?.id === item.id}
    />
  );

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Inbox</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {data?.items && data.items.length > 0
              ? `${data.items.length} item${data.items.length === 1 ? '' : 's'} to triage`
              : 'Decide what to keep'}
          </Text>
        </View>

        {/* Content */}
        {isLoading ? (
          <LoadingState colors={colors} />
        ) : error ? (
          <ErrorState colors={colors} message={error.message} />
        ) : !data?.items || data.items.length === 0 ? (
          <EmptyState colors={colors} />
        ) : (
          <FlatList
            data={data.items as InboxItem[]}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  headerTitle: {
    ...Typography.displayMedium,
    marginBottom: Spacing.xs,
  },
  headerSubtitle: {
    ...Typography.bodyMedium,
  },
  // List
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },
  // Card
  cardWrapper: {
    marginBottom: Spacing.md,
  },
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  thumbnailContainer: {
    position: 'relative',
    aspectRatio: 16 / 9,
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
  thumbnailPlaceholderText: {
    fontSize: 32,
    fontWeight: '600',
  },
  durationBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  durationText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  typeBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  typeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardContent: {
    padding: Spacing.md,
  },
  cardTitle: {
    ...Typography.titleMedium,
    marginBottom: Spacing.xs,
  },
  cardCreator: {
    ...Typography.bodySmall,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveButton: {},
  bookmarkButton: {},
  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['3xl'],
    paddingBottom: 100,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['2xl'],
  },
  emptyTitle: {
    ...Typography.headlineSmall,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  emptyDescription: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing['2xl'],
  },
  emptyHint: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  emptyHintText: {
    ...Typography.bodySmall,
    textAlign: 'center',
  },
  // Loading state
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Error state
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['3xl'],
  },
  errorText: {
    ...Typography.bodyMedium,
    textAlign: 'center',
  },
});
