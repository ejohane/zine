/**
 * LatestContentCard Component
 *
 * Displays a single content item in a vertical list row.
 * Shows thumbnail, title, published date, duration, and chevron indicator.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { View, Image, Pressable, StyleSheet } from 'react-native';

import { Badge, Text } from '@/components/primitives';
import { IconSizes, Radius, Spacing, Typography } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { analytics } from '@/lib/analytics';
import { formatRelativeTime, formatDuration } from '@/lib/format';
import { logger } from '@/lib/logger';
import { trpc } from '@/lib/trpc';

// ============================================================================
// Types
// ============================================================================

export interface LatestContentItem {
  /** Provider-specific ID */
  providerId: string;
  /** Content title */
  title: string;
  /** Content description when available */
  description?: string | null;
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
 * Tapping the card opens the in-app content detail when an internal ID exists,
 * and falls back to the external URL when the item is not yet in-app.
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
  const { colors, motion } = useAppTheme();
  const ensureLatestContentItemMutation = trpc.creators.ensureLatestContentItem.useMutation();

  const handlePress = async () => {
    let userItemId = item.itemId ?? null;

    try {
      const publishedAtMs = item.publishedAt ? Date.parse(item.publishedAt) : null;
      const result = await ensureLatestContentItemMutation.mutateAsync({
        creatorId,
        providerId: item.providerId,
        title: item.title,
        externalUrl: item.url,
        thumbnailUrl: item.thumbnailUrl,
        duration: item.duration,
        publishedAt: Number.isFinite(publishedAtMs) ? publishedAtMs : null,
        description: item.description ?? null,
      });
      userItemId = result.userItemId;
    } catch (error) {
      logger.error('Failed to resolve latest creator content item', {
        error,
        creatorId,
        provider,
        providerId: item.providerId,
      });

      if (!userItemId) {
        return;
      }
    }

    analytics.track('creator_content_opened', {
      creatorId,
      contentType: 'latest',
      provider,
      itemId: userItemId,
      destination: 'internal',
    });

    router.push(`/item/${userItemId}` as any);
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
      disabled={ensureLatestContentItemMutation.isPending}
      style={({ pressed }) => [styles.container, { opacity: pressed ? motion.opacity.pressed : 1 }]}
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
        <Text style={styles.title} tone="primary" numberOfLines={2} ellipsizeMode="tail">
          {item.title}
        </Text>
        {showMetaRow && (
          <View style={styles.metaRow}>
            {metaLine ? (
              <Text style={styles.meta} tone="secondary">
                {metaLine}
              </Text>
            ) : null}
            {item.isBookmarked ? (
              <Badge
                label="Saved"
                tone="success"
                shape="pill"
                leadingAccessory={
                  <Ionicons name="bookmark" size={12} color={colors.overlayForeground} />
                }
                style={[styles.savedBadge, metaLine ? styles.savedBadgeWithMeta : null]}
                accessibilityLabel="Saved"
              />
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
    fontSize: IconSizes.lg,
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
    paddingVertical: 2,
  },
  savedBadgeWithMeta: {
    marginLeft: Spacing.sm,
  },
  chevronContainer: {
    paddingLeft: Spacing.sm,
  },
});
