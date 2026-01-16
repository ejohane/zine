/**
 * Channel Item Component
 *
 * Reusable channel/show row component for selection lists.
 * Supports both multi-select (checkbox) and single-action (subscribe button) modes.
 */

import { memo } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator, StyleSheet } from 'react-native';

import type { Colors } from '@/constants/theme';
import { Spacing, Radius, Typography, ProviderColors } from '@/constants/theme';
import { CheckboxIcon } from '@/components/icons';

// ============================================================================
// Types
// ============================================================================

export type Provider = 'YOUTUBE' | 'SPOTIFY';

/**
 * Unified channel data shape that works for both onboarding and discovery.
 */
export interface Channel {
  /** Provider-specific channel ID */
  providerChannelId: string;
  /** Display name */
  name: string;
  /** Optional description */
  description?: string | null;
  /** Optional thumbnail URL */
  imageUrl?: string | null;
  /** Optional subscriber count */
  subscriberCount?: number | null;
  /** Whether already subscribed (for discovery mode) */
  isSubscribed?: boolean;
}

export interface ChannelItemProps {
  channel: Channel;
  provider: Provider;
  colors: typeof Colors.light;

  // Multi-select mode props
  /** Whether this item is selected (multi-select mode) */
  isSelected?: boolean;
  /** Toggle selection callback (multi-select mode) */
  onToggle?: () => void;

  // Single-action mode props
  /** Whether subscribe is in progress */
  isSubscribing?: boolean;
  /** Whether already subscribed */
  isAlreadySubscribed?: boolean;
  /** Subscribe callback (single-action mode) */
  onSubscribe?: () => void;

  /** Selection mode: 'multi' shows checkbox, 'single' shows subscribe button */
  mode: 'multi' | 'single';
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format subscriber count to human-readable string
 */
function formatSubscriberCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Get provider color
 */
function getProviderColor(provider: Provider): string {
  return provider === 'YOUTUBE' ? ProviderColors.youtube : ProviderColors.spotify;
}

/**
 * Get provider description text
 */
function getProviderDescription(provider: Provider): string {
  return provider === 'YOUTUBE' ? 'YouTube Channel' : 'Spotify Podcast';
}

// ============================================================================
// Component
// ============================================================================

function ChannelItemComponent({
  channel,
  provider,
  colors,
  isSelected = false,
  onToggle,
  isSubscribing = false,
  isAlreadySubscribed = false,
  onSubscribe,
  mode,
}: ChannelItemProps) {
  const providerColor = getProviderColor(provider);
  const isSubscribed = channel.isSubscribed || isAlreadySubscribed;

  // Multi-select mode: entire card is pressable, shows checkbox
  if (mode === 'multi') {
    return (
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.card },
          isSelected && { borderColor: providerColor, borderWidth: 2 },
          pressed && styles.cardPressed,
        ]}
      >
        {/* Checkbox */}
        <View style={styles.checkboxContainer}>
          <CheckboxIcon checked={isSelected} color={isSelected ? providerColor : colors.border} />
        </View>

        {/* Channel Image */}
        <View style={styles.imageContainer}>
          {channel.imageUrl ? (
            <Image source={{ uri: channel.imageUrl }} style={styles.image} />
          ) : (
            <View
              style={[styles.imagePlaceholder, { backgroundColor: colors.backgroundSecondary }]}
            >
              <Text style={[styles.imagePlaceholderText, { color: colors.textTertiary }]}>
                {channel.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* Channel Info */}
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {channel.name}
          </Text>
          <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={1}>
            {channel.description || getProviderDescription(provider)}
          </Text>
        </View>
      </Pressable>
    );
  }

  // Single-action mode: card with subscribe button
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      {/* Channel Image */}
      <View style={styles.imageContainer}>
        {channel.imageUrl ? (
          <Image source={{ uri: channel.imageUrl }} style={styles.imageLarge} />
        ) : (
          <View
            style={[styles.imagePlaceholderLarge, { backgroundColor: colors.backgroundSecondary }]}
          >
            <Text style={[styles.imagePlaceholderTextLarge, { color: colors.textTertiary }]}>
              {channel.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      {/* Channel Info */}
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {channel.name}
        </Text>
        {channel.description && (
          <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
            {channel.description}
          </Text>
        )}
        {channel.subscriberCount != null && (
          <Text style={[styles.stats, { color: colors.textTertiary }]}>
            {formatSubscriberCount(channel.subscriberCount)} subscribers
          </Text>
        )}
      </View>

      {/* Subscribe Button */}
      <Pressable
        onPress={onSubscribe}
        disabled={isSubscribed || isSubscribing}
        style={[
          styles.subscribeButton,
          isSubscribed
            ? { backgroundColor: colors.backgroundSecondary }
            : { backgroundColor: providerColor },
        ]}
      >
        {isSubscribing ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text
            style={[
              styles.subscribeButtonText,
              isSubscribed ? { color: colors.textSecondary } : { color: '#FFFFFF' },
            ]}
          >
            {isSubscribed ? 'Subscribed' : 'Subscribe'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

export const ChannelItem = memo(ChannelItemComponent);

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  checkboxContainer: {
    marginRight: Spacing.md,
  },
  imageContainer: {
    marginRight: Spacing.md,
  },
  image: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
  },
  imageLarge: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
  },
  imagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderLarge: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontSize: 20,
    fontWeight: '600',
  },
  imagePlaceholderTextLarge: {
    fontSize: 24,
    fontWeight: '600',
  },
  info: {
    flex: 1,
    marginRight: Spacing.md,
  },
  name: {
    ...Typography.titleSmall,
    fontWeight: '600',
  },
  description: {
    ...Typography.bodySmall,
    marginTop: Spacing.xs,
  },
  stats: {
    ...Typography.labelSmall,
    marginTop: Spacing.xs,
  },
  subscribeButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscribeButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
