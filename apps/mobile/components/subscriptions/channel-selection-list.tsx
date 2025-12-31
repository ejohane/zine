/**
 * Channel Selection List Component
 *
 * Shared component for displaying and selecting channels from a provider.
 * Used in both onboarding (multi-select) and discovery (single-action) flows.
 *
 * Features:
 * - Search/filter by name
 * - Multi-select mode with checkboxes and batch action
 * - Single-action mode with per-item subscribe buttons
 * - Loading, error, empty states
 * - Select all / deselect all (multi-select mode)
 *
 * @see features/subscriptions/frontend-spec.md Section 5 (Channel Selection)
 */

import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';

import { Colors, Spacing, Radius, Typography, ProviderColors, Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SearchIcon } from '@/components/icons';
import { LoadingState, ErrorState, EmptyState } from '@/components/list-states';
import { ChannelItem, type Channel, type Provider } from './channel-item';

// ============================================================================
// Types
// ============================================================================

export type { Channel, Provider } from './channel-item';

export interface ChannelSelectionListProps {
  // Data
  /** Content provider */
  provider: Provider;
  /** List of channels to display */
  channels: Channel[];
  /** Whether data is loading */
  isLoading: boolean;
  /** Error from data fetch */
  error?: Error | null;
  /** Retry callback for error state */
  onRetry?: () => void;

  // Selection (multi-select mode)
  /** Currently selected channel IDs */
  selectedIds?: Set<string>;
  /** Callback when selection changes */
  onSelectionChange?: (ids: Set<string>) => void;

  // Actions
  /** Subscribe to a single channel (single-action mode) */
  onSubscribe?: (channel: Channel) => void;
  /** Set of channel IDs currently being subscribed */
  subscribingIds?: Set<string>;
  /** Check if a channel is already subscribed */
  isChannelSubscribed?: (providerChannelId: string) => boolean;

  // Customization
  /** Selection mode: 'multi' for batch selection, 'single' for immediate action */
  mode: 'multi' | 'single';
  /** Whether to show search bar (default: true) */
  showSearch?: boolean;
  /** Custom empty state message */
  emptyTitle?: string;
  /** Custom empty state description */
  emptyMessage?: string;
  /** Custom empty state emoji */
  emptyEmoji?: string;
  /** Footer component (e.g., offline indicator) */
  ListFooterComponent?: React.ReactElement | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get provider color for styling
 */
function getProviderColor(provider: Provider): string {
  return provider === 'YOUTUBE' ? ProviderColors.youtube : ProviderColors.spotify;
}

// ============================================================================
// Component
// ============================================================================

export function ChannelSelectionList({
  provider,
  channels,
  isLoading,
  error,
  onRetry,
  selectedIds = new Set(),
  onSelectionChange,
  onSubscribe,
  subscribingIds = new Set(),
  isChannelSubscribed,
  mode,
  showSearch = true,
  emptyTitle,
  emptyMessage,
  emptyEmoji = '📺',
  ListFooterComponent,
}: ChannelSelectionListProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Filter channels by search query
  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) {
      return channels;
    }
    const query = searchQuery.toLowerCase();
    return channels.filter(
      (channel) =>
        channel.name.toLowerCase().includes(query) ||
        channel.description?.toLowerCase().includes(query)
    );
  }, [channels, searchQuery]);

  // Selection helpers (multi-select mode)
  const selectedCount = selectedIds.size;
  const totalCount = filteredChannels.length;
  const allSelected = selectedCount === totalCount && totalCount > 0;

  const toggleChannel = useCallback(
    (providerChannelId: string) => {
      if (!onSelectionChange) return;
      const next = new Set(selectedIds);
      if (next.has(providerChannelId)) {
        next.delete(providerChannelId);
      } else {
        next.add(providerChannelId);
      }
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange]
  );

  const selectAll = useCallback(() => {
    if (!onSelectionChange) return;
    onSelectionChange(new Set(filteredChannels.map((c) => c.providerChannelId)));
  }, [filteredChannels, onSelectionChange]);

  const deselectAll = useCallback(() => {
    if (!onSelectionChange) return;
    onSelectionChange(new Set());
  }, [onSelectionChange]);

  // Render channel item
  const renderItem = useCallback(
    ({ item }: { item: Channel }) => {
      if (mode === 'multi') {
        return (
          <ChannelItem
            channel={item}
            provider={provider}
            colors={colors}
            mode="multi"
            isSelected={selectedIds.has(item.providerChannelId)}
            onToggle={() => toggleChannel(item.providerChannelId)}
          />
        );
      }

      return (
        <ChannelItem
          channel={item}
          provider={provider}
          colors={colors}
          mode="single"
          isSubscribing={subscribingIds.has(item.providerChannelId)}
          isAlreadySubscribed={isChannelSubscribed?.(item.providerChannelId) ?? false}
          onSubscribe={() => onSubscribe?.(item)}
        />
      );
    },
    [
      mode,
      provider,
      colors,
      selectedIds,
      toggleChannel,
      subscribingIds,
      isChannelSubscribed,
      onSubscribe,
    ]
  );

  const keyExtractor = useCallback((item: Channel) => item.providerChannelId, []);

  // Determine empty state content
  const getEmptyTitle = () => {
    if (searchQuery) return 'No results';
    return emptyTitle ?? 'No channels found';
  };

  const getEmptyMessage = () => {
    if (searchQuery) return `No channels match "${searchQuery}"`;
    return emptyMessage ?? 'No subscriptions available';
  };

  // Loading state
  if (isLoading) {
    return <LoadingState message="Loading channels..." />;
  }

  // Error state
  if (error) {
    return <ErrorState title="Could not load channels" message={error.message} onRetry={onRetry} />;
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      {showSearch && (
        <View style={styles.searchContainer}>
          <View
            style={[
              styles.searchInputContainer,
              {
                backgroundColor: colors.backgroundSecondary,
                borderColor: colors.border,
              },
            ]}
          >
            <SearchIcon size={20} color={colors.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search channels..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>
        </View>
      )}

      {/* Select All / Deselect All (multi-select mode only) */}
      {mode === 'multi' && channels.length > 0 && (
        <View style={styles.selectionActions}>
          <Text style={[styles.selectionCount, { color: colors.textSecondary }]}>
            {selectedCount} of {totalCount} selected
          </Text>
          <Pressable onPress={allSelected ? deselectAll : selectAll}>
            <Text style={[styles.selectionActionText, { color: colors.primary }]}>
              {allSelected ? 'Deselect All' : 'Select All'}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Channel List */}
      {filteredChannels.length === 0 ? (
        <EmptyState emoji={emptyEmoji} title={getEmptyTitle()} message={getEmptyMessage()} />
      ) : (
        <FlatList
          data={filteredChannels}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.5}
          ListFooterComponent={ListFooterComponent}
        />
      )}
    </View>
  );
}

// ============================================================================
// Bottom Action Bar Component
// ============================================================================

export interface ChannelSelectionActionBarProps {
  /** Number of selected channels */
  selectedCount: number;
  /** Provider for styling */
  provider: Provider;
  /** Whether subscribe action is in progress */
  isSubscribing: boolean;
  /** Subscribe to selected channels */
  onSubscribe: () => void;
  /** Skip/dismiss action */
  onSkip?: () => void;
  /** Custom subscribe button text */
  subscribeText?: string;
  /** Custom skip button text */
  skipText?: string;
}

/**
 * Bottom action bar for multi-select mode.
 * Shows "Subscribe to N channels" when items selected, or skip button when none.
 */
export function ChannelSelectionActionBar({
  selectedCount,
  provider,
  isSubscribing,
  onSubscribe,
  onSkip,
  subscribeText,
  skipText = 'Skip for now',
}: ChannelSelectionActionBarProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const providerColor = getProviderColor(provider);

  const buttonText =
    subscribeText ?? `Subscribe to ${selectedCount} channel${selectedCount !== 1 ? 's' : ''}`;

  return (
    <View style={[styles.actionBar, { borderTopColor: colors.border }]}>
      {selectedCount > 0 ? (
        <Pressable
          onPress={onSubscribe}
          disabled={isSubscribing}
          style={({ pressed }) => [
            styles.subscribeAllButton,
            { backgroundColor: providerColor },
            pressed && styles.buttonPressed,
            isSubscribing && styles.buttonDisabled,
          ]}
        >
          {isSubscribing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.subscribeAllButtonText}>{buttonText}</Text>
          )}
        </Pressable>
      ) : onSkip ? (
        <Pressable
          onPress={onSkip}
          style={({ pressed }) => [styles.skipButton, pressed && styles.buttonPressed]}
        >
          <Text style={[styles.skipButtonText, { color: colors.textSecondary }]}>{skipText}</Text>
        </Pressable>
      ) : null}
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
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    ...Typography.bodyMedium,
  },
  selectionActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  selectionCount: {
    ...Typography.bodySmall,
  },
  selectionActionText: {
    ...Typography.labelMedium,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  actionBar: {
    padding: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subscribeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    borderRadius: Radius.lg,
    ...Shadows.md,
  },
  subscribeAllButtonText: {
    color: '#FFFFFF',
    ...Typography.labelLarge,
    fontWeight: '600',
  },
  skipButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  skipButtonText: {
    ...Typography.labelLarge,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
