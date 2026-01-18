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
 * - Skeleton loading state
 * - Dark mode support
 * - Accessibility labels
 */

import { Image } from 'expo-image';
import { View, Text, StyleSheet, Linking, type ViewStyle } from 'react-native';
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
  preview?: LinkPreview | null;
  /** Show skeleton loading state */
  isLoading?: boolean;
  /** Optional custom styles for the container */
  style?: ViewStyle;
}

// ============================================================================
// Text Parsing Helpers
// ============================================================================

type TextPart = { type: 'text'; content: string } | { type: 'link'; content: string; url: string };

/**
 * Parse text to identify URLs and @mentions
 */
function parseTextWithLinks(text: string): TextPart[] {
  // Match URLs and @mentions
  const linkRegex = /(https?:\/\/[^\s]+)|(@[\w_]+)|([\w-]+\.(?:com|dev|io|org|net|co|app)[^\s]*)/gi;
  const parts: TextPart[] = [];
  let lastIndex = 0;

  let match;
  while ((match = linkRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    const matchedText = match[0];
    let url: string;

    if (matchedText.startsWith('@')) {
      // Twitter mention
      url = `https://twitter.com/${matchedText.slice(1)}`;
    } else if (matchedText.startsWith('http')) {
      url = matchedText;
    } else {
      // Domain without protocol
      url = `https://${matchedText}`;
    }

    parts.push({ type: 'link', content: matchedText, url });
    lastIndex = match.index + matchedText.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
}

/**
 * Render text with clickable links
 */
function LinkedText({
  text,
  style,
  linkStyle,
  numberOfLines,
}: {
  text: string;
  style: object;
  linkStyle: object;
  numberOfLines?: number;
}) {
  const parts = parseTextWithLinks(text);

  const handleLinkPress = (url: string) => {
    Linking.openURL(url).catch(() => {
      // Silently fail if URL can't be opened
    });
  };

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, index) =>
        part.type === 'link' ? (
          <Text
            key={index}
            style={linkStyle}
            onPress={() => handleLinkPress(part.url)}
            accessibilityRole="link"
            accessibilityHint={`Opens ${part.url}`}
          >
            {part.content}
          </Text>
        ) : (
          <Text key={index}>{part.content}</Text>
        )
      )}
    </Text>
  );
}

// ============================================================================
// Skeleton Component
// ============================================================================

function LinkPreviewCardSkeleton({ style }: { style?: ViewStyle }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[styles.container, { backgroundColor: colors.card }, Shadows.md, style]}
      accessible={true}
      accessibilityLabel="Loading preview"
    >
      {/* Skeleton Thumbnail */}
      <View style={[styles.thumbnailContainer, { backgroundColor: colors.backgroundTertiary }]} />

      {/* Skeleton Content */}
      <View style={styles.content}>
        {/* Skeleton Meta Row - at top */}
        <View style={styles.metaRow}>
          <View style={[styles.skeletonAvatar, { backgroundColor: colors.backgroundTertiary }]} />
          <View
            style={[
              styles.skeletonLine,
              { backgroundColor: colors.backgroundTertiary, width: 120, marginBottom: 0 },
            ]}
          />
        </View>

        {/* Skeleton Tweet text - two lines */}
        <View
          style={[
            styles.skeletonLine,
            { backgroundColor: colors.backgroundTertiary, width: '90%' },
          ]}
        />
        <View
          style={[
            styles.skeletonLine,
            { backgroundColor: colors.backgroundTertiary, width: '60%', marginBottom: 0 },
          ]}
        />
      </View>
    </Animated.View>
  );
}

// ============================================================================
// Component
// ============================================================================

export function LinkPreviewCard({ preview, isLoading, style }: LinkPreviewCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Show skeleton when loading
  if (isLoading || !preview) {
    return <LinkPreviewCardSkeleton style={style} />;
  }

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
        {/* Creator with avatar or provider indicator - Twitter style, at top */}
        <View style={styles.metaRow}>
          {preview.creatorImageUrl ? (
            <Image
              source={{ uri: preview.creatorImageUrl }}
              style={styles.creatorAvatar}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[styles.providerDot, { backgroundColor: providerColor }]} />
          )}
          <Text style={[styles.creator, { color: colors.text }]} numberOfLines={1}>
            {preview.creator}
          </Text>
        </View>

        {/* Title/Tweet text - below creator, smaller */}
        <LinkedText
          text={preview.title}
          style={[styles.tweetText, { color: '#fff' }]}
          linkStyle={{ color: colors.textTertiary }}
          numberOfLines={3}
        />
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  tweetText: {
    ...Typography.bodyMedium,
    lineHeight: 20,
  },
  providerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: Spacing.xs,
  },
  creatorAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: Spacing.xs,
  },
  creator: {
    ...Typography.bodyMedium,
    flex: 1,
  },
  providerLabel: {
    ...Typography.bodySmall,
  },

  // Skeleton styles
  skeletonLine: {
    height: 16,
    borderRadius: Radius.xs,
    marginBottom: Spacing.xs,
  },
  skeletonAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: Spacing.xs,
  },
});

export default LinkPreviewCard;
