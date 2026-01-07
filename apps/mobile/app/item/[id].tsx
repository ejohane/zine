/**
 * Item Detail Page
 *
 * Displays the full content of a saved item - Spotify podcasts or YouTube videos.
 * Accessible from all item cards throughout the app (Inbox, Library, Home).
 *
 * Features:
 * - Cover image with adaptive aspect ratio (1:1 podcast, 16:9 video)
 * - Title and creator display
 * - Open Link button (opens in browser/native app)
 * - Action Row with Check, Bookmark, Share, and Add to Collection buttons
 * - Full description with scrolling
 * - Loading, error, and not found states
 */

import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Linking,
  Share,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Typography, Spacing, Radius, Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useItem,
  useBookmarkItem,
  useUnbookmarkItem,
  useToggleFinished,
} from '@/hooks/use-items-trpc';
import { formatDuration, formatRelativeTime } from '@/lib/format';
import {
  getContentIcon,
  getContentAspectRatio,
  getProviderLabel,
  getProviderColor,
} from '@/lib/content-utils';
import { logger } from '@/lib/logger';
import { validateItemId } from '@/lib/route-validation';
import {
  ChevronRightIcon,
  CheckIcon,
  CheckOutlineIcon,
  BookmarkIcon,
  BookmarkOutlineIcon,
  ShareIcon,
  PlusIcon,
} from '@/components/icons';

// ============================================================================
// Loading State
// ============================================================================

function LoadingState({ colors }: { colors: typeof Colors.light }) {
  return (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading item...</Text>
    </View>
  );
}

// ============================================================================
// Error State
// ============================================================================

function ErrorState({
  colors,
  message,
  onRetry,
}: {
  colors: typeof Colors.light;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.centerContainer}>
      <Text style={[styles.errorTitle, { color: colors.text }]}>Something went wrong</Text>
      <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>{message}</Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.retryButtonText}>Try Again</Text>
        </Pressable>
      )}
    </View>
  );
}

// ============================================================================
// Not Found State
// ============================================================================

function NotFoundState({ colors }: { colors: typeof Colors.light }) {
  const router = useRouter();

  return (
    <View style={styles.centerContainer}>
      <Text style={[styles.errorTitle, { color: colors.text }]}>Item not found</Text>
      <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>
        This item may have been deleted or does not exist.
      </Text>
      <Pressable
        onPress={() => router.back()}
        style={[styles.retryButton, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.retryButtonText}>Go Back</Text>
      </Pressable>
    </View>
  );
}

// ============================================================================
// Invalid Parameter State
// ============================================================================

function InvalidParamState({ colors, message }: { colors: typeof Colors.light; message: string }) {
  const router = useRouter();

  return (
    <View style={styles.centerContainer}>
      <Text style={[styles.errorTitle, { color: colors.text }]}>Invalid Link</Text>
      <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>{message}</Text>
      <Pressable
        onPress={() => router.back()}
        style={[styles.retryButton, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.retryButtonText}>Go Back</Text>
      </Pressable>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Validate the id parameter early
  const idValidation = validateItemId(id);

  // Fetch item data - only if id is valid
  const {
    data: item,
    isLoading,
    error,
    refetch,
  } = useItem(idValidation.success ? idValidation.data : '');

  // Bookmark mutations
  const bookmarkMutation = useBookmarkItem();
  const unbookmarkMutation = useUnbookmarkItem();
  const toggleFinishedMutation = useToggleFinished();

  // Render invalid param state if id is invalid
  if (!idValidation.success) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: '',
            headerBackButtonDisplayMode: 'minimal',
            headerTransparent: true,
            headerTintColor: colors.text,
          }}
        />
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <InvalidParamState colors={colors} message={idValidation.message} />
        </SafeAreaView>
      </View>
    );
  }

  // Handle open in browser/app
  const handleOpenLink = async () => {
    if (!item?.canonicalUrl) return;

    try {
      const supported = await Linking.canOpenURL(item.canonicalUrl);
      if (supported) {
        await Linking.openURL(item.canonicalUrl);
      }
    } catch (err) {
      logger.error('Failed to open URL', { error: err });
    }
  };

  // Handle share action
  const handleShare = async () => {
    if (!item) return;

    try {
      await Share.share({
        title: item.title,
        url: item.canonicalUrl,
        message: `Check out "${item.title}"`,
      });
    } catch (err) {
      logger.error('Failed to share', { error: err });
    }
  };

  // Handle mark as finished toggle
  const handleToggleFinished = () => {
    if (!item) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleFinishedMutation.mutate({ id: item.id });
  };

  // Handle bookmark toggle
  const handleToggleBookmark = () => {
    if (!item) return;

    if (item.state === 'BOOKMARKED') {
      // Unbookmark: move back to INBOX
      unbookmarkMutation.mutate({ id: item.id });
    } else {
      // Bookmark: move to BOOKMARKED (Library)
      bookmarkMutation.mutate({ id: item.id });
    }
  };

  // Handle add to collection (placeholder)
  const handleAddToCollection = () => {
    // No-op placeholder for future functionality
    logger.debug('Add to collection - placeholder');
  };

  // Render loading state
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: '',
            headerBackButtonDisplayMode: 'minimal',
            headerTransparent: true,
            headerTintColor: colors.text,
          }}
        />
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <LoadingState colors={colors} />
        </SafeAreaView>
      </View>
    );
  }

  // Render error state
  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: '',
            headerBackButtonDisplayMode: 'minimal',
            headerTransparent: true,
            headerTintColor: colors.text,
          }}
        />
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <ErrorState colors={colors} message={error.message} onRetry={() => refetch()} />
        </SafeAreaView>
      </View>
    );
  }

  // Render not found state
  if (!item) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: '',
            headerBackButtonDisplayMode: 'minimal',
            headerTransparent: true,
            headerTintColor: colors.text,
          }}
        />
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <NotFoundState colors={colors} />
        </SafeAreaView>
      </View>
    );
  }

  // Calculate aspect ratio based on content type
  const aspectRatio = getContentAspectRatio(item.contentType);
  const providerLabel = getProviderLabel(item.provider);
  const providerColor = getProviderColor(item.provider);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: '',
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: true,
          headerTintColor: colors.text,
        }}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover Image */}
        <Animated.View entering={FadeIn.duration(400)}>
          <View style={[styles.coverContainer, { aspectRatio }]}>
            {item.thumbnailUrl ? (
              <Image
                source={{ uri: item.thumbnailUrl }}
                style={styles.coverImage}
                contentFit="cover"
                transition={300}
              />
            ) : (
              <View
                style={[styles.coverPlaceholder, { backgroundColor: colors.backgroundTertiary }]}
              >
                {getContentIcon(item.contentType, 64, colors.textTertiary)}
              </View>
            )}
            {/* Duration badge */}
            {item.duration && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Content */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(400)}
          style={styles.contentContainer}
        >
          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>

          {/* Creator and Provider */}
          <View style={styles.metaRow}>
            <View style={[styles.providerDot, { backgroundColor: providerColor }]} />
            <Text style={[styles.creator, { color: colors.textSecondary }]}>{item.creator}</Text>
            {providerLabel && (
              <>
                <Text style={[styles.separator, { color: colors.textTertiary }]}>{' on '}</Text>
                <Text style={[styles.provider, { color: colors.textSecondary }]}>
                  {providerLabel}
                </Text>
              </>
            )}
          </View>

          {/* Reading Time */}
          {item.readingTimeMinutes && (
            <Text style={[styles.readingTime, { color: colors.textTertiary }]}>
              {item.readingTimeMinutes} min read
            </Text>
          )}

          {/* Published date */}
          {item.publishedAt && (
            <Text style={[styles.publishedAt, { color: colors.textTertiary }]}>
              Published {formatRelativeTime(item.publishedAt)}
            </Text>
          )}

          {/* Open Button */}
          <Pressable
            onPress={handleOpenLink}
            style={({ pressed }) => [
              styles.openButton,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.openButtonText}>
              {providerLabel ? `Open in ${providerLabel}` : 'Open'}
            </Text>
            <ChevronRightIcon size={20} color="#fff" />
          </Pressable>

          {/* Action Row */}
          <View style={styles.actionRow}>
            {/* Mark as Finished */}
            <Pressable
              onPress={handleToggleFinished}
              disabled={toggleFinishedMutation.isPending}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: colors.backgroundSecondary },
                pressed && { opacity: 0.7 },
                toggleFinishedMutation.isPending && { opacity: 0.5 },
              ]}
            >
              {item.isFinished ? (
                <CheckIcon size={24} color={colors.success} />
              ) : (
                <CheckOutlineIcon size={24} color={colors.textSecondary} />
              )}
            </Pressable>

            {/* Bookmark */}
            <Pressable
              onPress={handleToggleBookmark}
              disabled={bookmarkMutation.isPending || unbookmarkMutation.isPending}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: colors.backgroundSecondary },
                pressed && { opacity: 0.7 },
                (bookmarkMutation.isPending || unbookmarkMutation.isPending) && { opacity: 0.5 },
              ]}
            >
              {item.state === 'BOOKMARKED' ? (
                <BookmarkIcon size={24} color={colors.primary} />
              ) : (
                <BookmarkOutlineIcon size={24} color={colors.textSecondary} />
              )}
            </Pressable>

            {/* Share */}
            <Pressable
              onPress={handleShare}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: colors.backgroundSecondary },
                pressed && { opacity: 0.7 },
              ]}
            >
              <ShareIcon size={24} color={colors.textSecondary} />
            </Pressable>

            {/* Add to Collection */}
            <Pressable
              onPress={handleAddToCollection}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: colors.backgroundSecondary },
                pressed && { opacity: 0.7 },
              ]}
            >
              <PlusIcon size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Description */}
          {item.summary && (
            <View style={styles.descriptionContainer}>
              <Text style={[styles.descriptionLabel, { color: colors.text }]}>Description</Text>
              <Text style={[styles.description, { color: colors.textSecondary }]}>
                {item.summary}
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing['3xl'],
  },

  // Cover Image - extends edge-to-edge, top to top of screen
  coverContainer: {
    width: '100%',
    position: 'relative',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
  },
  durationText: {
    ...Typography.labelMedium,
    color: '#fff',
    textTransform: 'none',
    letterSpacing: 0,
  },

  // Content
  contentContainer: {
    padding: Spacing.xl,
  },
  title: {
    ...Typography.headlineMedium,
    marginBottom: Spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  providerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  creator: {
    ...Typography.bodyMedium,
  },
  separator: {
    ...Typography.bodyMedium,
  },
  provider: {
    ...Typography.bodyMedium,
    fontWeight: '500',
  },
  publishedAt: {
    ...Typography.bodySmall,
    marginBottom: Spacing.lg,
  },
  readingTime: {
    ...Typography.bodySmall,
    marginBottom: Spacing.xs,
  },

  // Open Button
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
    gap: Spacing.xs,
    ...Shadows.sm,
  },
  openButtonText: {
    ...Typography.labelLarge,
    color: '#fff',
  },

  // Action Row
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  actionButton: {
    width: 52,
    height: 52,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Description
  descriptionContainer: {
    marginTop: Spacing.md,
  },
  descriptionLabel: {
    ...Typography.titleSmall,
    marginBottom: Spacing.sm,
  },
  description: {
    ...Typography.bodyMedium,
    lineHeight: 24,
  },

  // Center Container (for loading/error/not found)
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    ...Typography.bodyMedium,
    marginTop: Spacing.md,
  },
  errorTitle: {
    ...Typography.headlineSmall,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  errorMessage: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  retryButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.md,
  },
  retryButtonText: {
    ...Typography.labelMedium,
    color: '#fff',
  },
});
