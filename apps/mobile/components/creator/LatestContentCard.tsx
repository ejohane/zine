/**
 * LatestContentCard Component
 *
 * Displays a single content item in the "More from this Creator" horizontal carousel.
 * Shows thumbnail, title, published date, and "Saved" badge if bookmarked.
 */

import { View, Text, Image, Pressable, Linking, StyleSheet } from 'react-native';

import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatRelativeTime } from '@/lib/format';

// ============================================================================
// Types
// ============================================================================

export interface LatestContentItem {
  /** Provider-specific ID */
  providerId: string;
  /** Content title */
  title: string;
  /** Thumbnail URL (optional) */
  thumbnailUrl: string | null;
  /** Duration in seconds (for videos/podcasts) */
  duration: number | null;
  /** ISO 8601 publish date */
  publishedAt: string | null;
  /** External URL to open in browser/app */
  url: string;
  /** Whether this content is already bookmarked */
  isBookmarked?: boolean;
}

export interface LatestContentCardProps {
  /** The content item to display */
  item: LatestContentItem;
}

// ============================================================================
// Component
// ============================================================================

/**
 * LatestContentCard displays a single content item in a horizontal carousel.
 * Tapping the card opens the external URL in the appropriate app.
 *
 * @example
 * ```tsx
 * <LatestContentCard
 *   item={{
 *     providerId: 'abc123',
 *     title: 'My Video',
 *     thumbnailUrl: 'https://example.com/thumb.jpg',
 *     duration: 600,
 *     publishedAt: '2024-01-15T10:00:00Z',
 *     url: 'https://youtube.com/watch?v=abc123',
 *     isBookmarked: false,
 *   }}
 * />
 * ```
 */
export function LatestContentCard({ item }: LatestContentCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const handlePress = () => {
    if (item.url) {
      Linking.openURL(item.url);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: colors.card, opacity: pressed ? 0.8 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.title}`}
      accessibilityHint="Opens content in external app"
    >
      {/* Thumbnail */}
      {item.thumbnailUrl ? (
        <Image
          source={{ uri: item.thumbnailUrl }}
          style={styles.thumbnail}
          accessibilityLabel={`Thumbnail for ${item.title}`}
        />
      ) : (
        <View style={[styles.thumbnailPlaceholder, { backgroundColor: colors.backgroundTertiary }]}>
          <Text style={[styles.thumbnailPlaceholderText, { color: colors.textTertiary }]}>📺</Text>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2} ellipsizeMode="tail">
          {item.title}
        </Text>
        {item.publishedAt && (
          <Text style={[styles.publishedAt, { color: colors.textSecondary }]}>
            {formatRelativeTime(item.publishedAt)}
          </Text>
        )}
      </View>

      {/* Bookmarked indicator */}
      {item.isBookmarked && (
        <View style={[styles.savedBadge, { backgroundColor: colors.primary }]}>
          <Text style={[styles.savedBadgeText, { color: colors.buttonPrimaryText }]}>Saved</Text>
        </View>
      )}
    </Pressable>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    width: 160,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: 90,
    resizeMode: 'cover',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailPlaceholderText: {
    fontSize: 24,
  },
  content: {
    padding: Spacing.sm,
  },
  title: {
    ...Typography.bodySmall,
    fontWeight: '500',
  },
  publishedAt: {
    ...Typography.labelMedium,
    marginTop: Spacing.xs,
  },
  savedBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.xs,
  },
  savedBadgeText: {
    ...Typography.labelSmall,
    textTransform: 'none',
    letterSpacing: 0,
  },
});
