/**
 * LinkPreviewCard Component
 *
 * Displays a preview of a link before the user saves it as a bookmark.
 * Shows thumbnail, title, creator, content type badge, provider indicator,
 * duration badge (for video/audio), and "Connected" badge when source is provider_api.
 *
 * Features:
 * - FadeIn animation on mount
 * - 16:9 aspect ratio thumbnail with placeholder
 * - Content type color coding
 * - Provider color dot
 * - Duration badge for video/podcast content
 * - "Connected" badge for provider_api sources
 * - Dark mode support
 * - Accessibility labels
 */

import { Image } from 'expo-image';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Colors, Typography, Spacing, Radius, Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatDuration } from '@/lib/format';
import {
  getContentIcon,
  getContentColor,
  getContentTypeLabel,
  getProviderColor,
  getProviderLabel,
} from '@/lib/content-utils';
import { CheckIcon } from '@/components/icons';
import type { LinkPreview } from '@/hooks/use-bookmarks';

// ============================================================================
// Types
// ============================================================================

export interface LinkPreviewCardProps {
  /** Preview data from the bookmarks.preview endpoint */
  preview: LinkPreview;
  /** Optional custom styles for the container */
  style?: ViewStyle;
}

// ============================================================================
// Component
// ============================================================================

export function LinkPreviewCard({ preview, style }: LinkPreviewCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Get content type styling
  const contentColor = getContentColor(preview.contentType);
  const contentTypeLabel = getContentTypeLabel(preview.contentType);
  const providerColor = getProviderColor(preview.provider);
  const providerLabel = getProviderLabel(preview.provider);

  // Format duration for video/podcast
  const durationText = formatDuration(preview.duration);
  const showDuration =
    durationText && (preview.contentType === 'VIDEO' || preview.contentType === 'PODCAST');

  // Format reading time for articles
  const showReadingTime = preview.readingTimeMinutes && preview.contentType === 'ARTICLE';
  const readingTimeText = showReadingTime ? `${preview.readingTimeMinutes} min read` : null;

  // Check if this is from a connected provider (provider_api source)
  const isConnected = preview.source === 'provider_api';

  // Build accessibility label
  const accessibilityLabel = [
    contentTypeLabel,
    preview.title,
    `by ${preview.creator}`,
    `from ${providerLabel}`,
    showDuration ? durationText : null,
    showReadingTime ? readingTimeText : null,
    isConnected ? 'Connected source' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={[styles.container, { backgroundColor: colors.card }, Shadows.md, style]}
      accessible={true}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
    >
      {/* Thumbnail */}
      <View style={styles.thumbnailContainer}>
        {preview.thumbnailUrl ? (
          <Image
            source={{ uri: preview.thumbnailUrl }}
            style={styles.thumbnail}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View
            style={[styles.thumbnailPlaceholder, { backgroundColor: colors.backgroundTertiary }]}
          >
            {getContentIcon(preview.contentType, 48, colors.textTertiary)}
          </View>
        )}

        {/* Content type badge - top left */}
        <View style={[styles.typeBadge, { backgroundColor: contentColor }]}>
          {getContentIcon(preview.contentType, 12, '#fff')}
          <Text style={styles.typeBadgeText}>{contentTypeLabel}</Text>
        </View>

        {/* Duration badge - bottom right (for video/podcast) */}
        {showDuration && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{durationText}</Text>
          </View>
        )}

        {/* Reading time badge - bottom right (for articles) */}
        {showReadingTime && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{readingTimeText}</Text>
          </View>
        )}

        {/* Connected badge - top right (for provider_api sources) */}
        {isConnected && (
          <View style={[styles.connectedBadge, { backgroundColor: colors.success }]}>
            <CheckIcon size={10} color="#fff" />
            <Text style={styles.connectedText}>Connected</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Title */}
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {preview.title}
        </Text>

        {/* Creator with provider indicator */}
        <View style={styles.metaRow}>
          <View style={[styles.providerDot, { backgroundColor: providerColor }]} />
          <Text style={[styles.creator, { color: colors.textSecondary }]} numberOfLines={1}>
            {preview.creator}
          </Text>
          <Text style={[styles.providerLabel, { color: colors.textTertiary }]}>
            {' '}
            · {providerLabel}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },

  // Thumbnail
  thumbnailContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
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

  // Content type badge
  typeBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    gap: Spacing.xs,
  },
  typeBadgeText: {
    ...Typography.labelSmall,
    color: '#fff',
    textTransform: 'none',
    letterSpacing: 0,
  },

  // Duration badge
  durationBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
  },
  durationText: {
    ...Typography.labelSmall,
    color: '#fff',
    textTransform: 'none',
    letterSpacing: 0,
  },

  // Connected badge
  connectedBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
    gap: Spacing.xs,
  },
  connectedText: {
    ...Typography.labelSmall,
    color: '#fff',
    textTransform: 'none',
    letterSpacing: 0,
  },

  // Content section
  content: {
    padding: Spacing.md,
  },
  title: {
    ...Typography.titleMedium,
    marginBottom: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: Spacing.xs,
  },
  creator: {
    ...Typography.bodyMedium,
    flex: 1,
  },
  providerLabel: {
    ...Typography.bodySmall,
  },
});

export default LinkPreviewCard;
