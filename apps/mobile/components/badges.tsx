/**
 * Badge Components
 *
 * Shared badge components for displaying content providers and content types
 * throughout the app.
 */

import { View, Text, StyleSheet } from 'react-native';

import { ContentColors, ProviderColors, Typography, Spacing, Radius } from '@/constants/theme';

// =============================================================================
// Types
// =============================================================================

export type ProviderType = 'YOUTUBE' | 'SPOTIFY' | 'SUBSTACK' | 'X' | 'TWITTER' | 'WEB';
export type ContentTypeValue = 'VIDEO' | 'PODCAST' | 'ARTICLE' | 'POST';

// =============================================================================
// SourceBadge - Shows content provider (YouTube, Spotify, etc.)
// =============================================================================

export interface SourceBadgeProps {
  provider: ProviderType | string;
}

function getProviderConfig(provider: string): { color: string; label: string } {
  const map: Record<string, { color: string; label: string }> = {
    YOUTUBE: { color: ProviderColors.youtube, label: 'YouTube' },
    SPOTIFY: { color: ProviderColors.spotify, label: 'Spotify' },
    SUBSTACK: { color: ProviderColors.substack, label: 'Substack' },
    X: { color: ProviderColors.x, label: 'X' },
    TWITTER: { color: ProviderColors.x, label: 'X' },
    WEB: { color: '#6A6A6A', label: 'Web' },
  };
  return map[provider] ?? { color: '#6A6A6A', label: 'Web' };
}

/**
 * SourceBadge displays the content provider (YouTube, Spotify, etc.) as a colored pill badge.
 *
 * @example
 * ```tsx
 * <SourceBadge provider="SPOTIFY" />
 * <SourceBadge provider="YOUTUBE" />
 * ```
 */
export function SourceBadge({ provider }: SourceBadgeProps) {
  const config = getProviderConfig(provider);
  return (
    <View style={[styles.badge, { backgroundColor: config.color }]}>
      <Text style={styles.badgeText}>{config.label}</Text>
    </View>
  );
}

// =============================================================================
// TypeBadge - Shows content type (Video, Podcast, etc.)
// =============================================================================

export interface TypeBadgeProps {
  contentType: ContentTypeValue | string;
}

function getTypeConfig(contentType: string): { color: string; label: string } {
  const map: Record<string, { color: string; label: string }> = {
    VIDEO: { color: ContentColors.video, label: 'Video' },
    PODCAST: { color: ContentColors.podcast, label: 'Podcast' },
    ARTICLE: { color: ContentColors.article, label: 'Article' },
    POST: { color: ContentColors.post, label: 'Post' },
  };
  return map[contentType] ?? { color: '#6A6A6A', label: 'Content' };
}

/**
 * TypeBadge displays the content type (Video, Podcast, etc.) as a colored pill badge.
 *
 * @example
 * ```tsx
 * <TypeBadge contentType="PODCAST" />
 * <TypeBadge contentType="VIDEO" />
 * ```
 */
export function TypeBadge({ contentType }: TypeBadgeProps) {
  const config = getTypeConfig(contentType);
  return (
    <View style={[styles.badge, { backgroundColor: config.color }]}>
      <Text style={styles.badgeText}>{config.label}</Text>
    </View>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  badgeText: {
    ...Typography.labelMedium,
    color: '#FFFFFF',
  },
});
