/**
 * Channel Card Component
 *
 * Selectable card for displaying a channel/source in multi-select lists.
 * Used in channel selection screens during onboarding and subscription flows.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Provider } from '@zine/shared';
import type { Colors } from '@/constants/theme';
import { ProviderColors, Radius, Spacing, Typography } from '@/constants/theme';
import { CheckboxIcon } from '@/components/icons';

// ============================================================================
// Types
// ============================================================================

/**
 * Channel data from the provider.
 * Matches the backend sources.list response shape.
 */
export interface SourceChannel {
  id: string;
  provider: Provider;
  providerId: string;
  feedUrl: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelCardProps {
  /** Channel data to display */
  channel: SourceChannel;
  /** Provider type for styling */
  provider: Provider;
  /** Whether the channel is currently selected */
  isSelected: boolean;
  /** Callback when channel is toggled */
  onToggle: () => void;
  /** Theme colors */
  colors: typeof Colors.light;
}

// ============================================================================
// Component
// ============================================================================

/**
 * ChannelCard displays a selectable channel with checkbox, avatar, and info.
 *
 * @example
 * ```tsx
 * <ChannelCard
 *   channel={channel}
 *   provider="YOUTUBE"
 *   isSelected={selectedChannels.has(channel.providerId)}
 *   onToggle={() => toggleChannel(channel.providerId)}
 *   colors={colors}
 * />
 * ```
 */
export function ChannelCard({ channel, provider, isSelected, onToggle, colors }: ChannelCardProps) {
  const providerColor = provider === 'YOUTUBE' ? ProviderColors.youtube : ProviderColors.spotify;

  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.channelCard,
        { backgroundColor: colors.card },
        isSelected && { borderColor: providerColor, borderWidth: 2 },
        pressed && styles.channelCardPressed,
      ]}
    >
      {/* Checkbox */}
      <View style={styles.checkboxContainer}>
        <CheckboxIcon checked={isSelected} color={isSelected ? providerColor : colors.border} />
      </View>

      {/* Channel Image Placeholder */}
      <View style={styles.channelImageContainer}>
        <View
          style={[styles.channelImagePlaceholder, { backgroundColor: colors.backgroundSecondary }]}
        >
          <Text style={[styles.channelImagePlaceholderText, { color: colors.textTertiary }]}>
            {channel.name.charAt(0).toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Channel Info */}
      <View style={styles.channelInfo}>
        <Text style={[styles.channelName, { color: colors.text }]} numberOfLines={1}>
          {channel.name}
        </Text>
        <Text
          style={[styles.channelDescription, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {provider === 'YOUTUBE' ? 'YouTube Channel' : 'Spotify Podcast'}
        </Text>
      </View>
    </Pressable>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  channelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  channelCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  checkboxContainer: {
    marginRight: Spacing.md,
  },
  channelImageContainer: {
    marginRight: Spacing.md,
  },
  channelImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelImagePlaceholderText: {
    fontSize: 20,
    fontWeight: '600',
  },
  channelInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  channelName: {
    ...Typography.titleSmall,
    fontWeight: '600',
  },
  channelDescription: {
    ...Typography.bodySmall,
    marginTop: Spacing.xs,
  },
});
