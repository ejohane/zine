/**
 * LatestContentCard Component
 *
 * Displays a single content item in a vertical list row.
 * Shows thumbnail, title, published date, duration, and chevron indicator.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View, Text, Image, Pressable, Linking, StyleSheet } from 'react-native';

import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { analytics } from '@/lib/analytics';
import { formatRelativeTime, formatDuration } from '@/lib/format';

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
  /** Internal item ID when available */
  itemId?: string | null;
  /** Whether this content is already bookmarked */
  isBookmarked?: boolean;
}

export interface LatestContentCardProps {
  /** The content item to display */
  item: LatestContentItem;
  /** The creator ID for analytics tracking */
  creatorId: string;
  /** The provider for analytics tracking */
  provider: string;
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
 *   creatorId="creator-123"
 *   provider="YOUTUBE"
 * />
 * ```
 */
export function LatestContentCard({ item, creatorId, provider }: LatestContentCardProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const handlePress = () => {
    const hasInternalItem = !!item.itemId;

    // Track content opened
    analytics.track('creator_content_opened', {
      creatorId,
      contentType: 'latest',
      provider,
      itemId: item.itemId ?? null,
      destination: hasInternalItem ? 'internal' : 'external',
      externalUrl: hasInternalItem ? undefined : item.url,
    });

    if (hasInternalItem) {
      router.push(`/item/${item.itemId}` as any);
      return;
    }

    if (item.url) {
      Linking.openURL(item.url);
    }
  };

  // Build metadata line (date · duration)
  const metaParts: string[] = [];
  if (item.publishedAt) {
    metaParts.push(formatRelativeTime(item.publishedAt));
  }
  if (item.duration) {
    metaParts.push(formatDuration(item.duration));
  }
  const metaLine = metaParts.join(' · ');

  const showMetaRow = metaLine.length > 0 || item.isBookmarked;

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.container, { opacity: pressed ? 0.7 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.title}`}
      accessibilityHint="Opens content"
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
        {showMetaRow && (
          <View style={styles.metaRow}>
            {metaLine ? (
              <Text style={[styles.meta, { color: colors.textSecondary }]}>{metaLine}</Text>
            ) : null}
            {item.isBookmarked ? (
              <View
                style={[
                  styles.savedBadge,
                  { backgroundColor: colors.success, marginLeft: metaLine ? Spacing.sm : 0 },
                ]}
                accessibilityLabel="Saved"
              >
                <Ionicons name="bookmark" size={12} color="#FFFFFF" />
                <Text style={styles.savedText}>Saved</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>

      {/* Chevron */}
      <View style={styles.chevronContainer}>
        <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
      </View>
    </Pressable>
  );
}

// ============================================================================
// Styles
// ============================================================================

const THUMBNAIL_SIZE = 64;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: Radius.sm,
    resizeMode: 'cover',
  },
  thumbnailPlaceholder: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailPlaceholderText: {
    fontSize: 20,
  },
  content: {
    flex: 1,
    marginLeft: Spacing.md,
    marginRight: Spacing.sm,
  },
  title: {
    ...Typography.bodyMedium,
    fontWeight: '500',
  },
  meta: {
    ...Typography.bodySmall,
    marginTop: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
    flexWrap: 'wrap',
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.full,
  },
  savedText: {
    ...Typography.labelSmall,
    marginLeft: Spacing.xs,
    color: '#FFFFFF',
  },
  chevronContainer: {
    paddingLeft: Spacing.sm,
  },
});
