/**
 * Channel Selection Screen (Onboarding)
 *
 * Multi-select UI for choosing which channels to subscribe to after OAuth.
 * Shows checkboxes for each channel, count of selected, and "Subscribe to N channels" button.
 *
 * Features:
 * 1. Multi-select checkboxes for channels
 * 2. Selected count display
 * 3. "Subscribe to N channels" primary action button
 * 4. Search/filter by name
 * 5. Loading, error, empty states
 * 6. Navigation to /(tabs) after subscribing
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
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Colors, Spacing, Radius, Typography, ProviderColors, Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSubscriptions, type SubscribePayload } from '@/hooks/use-subscriptions';
import { trpc } from '@/lib/trpc';

// ============================================================================
// Types
// ============================================================================

type Provider = 'YOUTUBE' | 'SPOTIFY';

/**
 * Channel data from the provider.
 * Matches the backend sources.list response shape.
 */
interface SourceChannel {
  id: string;
  provider: Provider;
  providerId: string;
  feedUrl: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Icons
// ============================================================================

function CheckboxIcon({ checked, color }: { checked: boolean; color: string }) {
  if (checked) {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path
          d="M19 3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.11 21 21 20.1 21 19V5C21 3.9 20.11 3 19 3ZM10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z"
          fill={color}
        />
      </Svg>
    );
  }
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 5V19H5V5H19ZM19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3Z"
        fill={color}
      />
    </Svg>
  );
}

function SearchIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z"
        fill={color}
      />
    </Svg>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface StateColorsProps {
  colors: typeof Colors.light;
}

/**
 * Loading state shown while fetching initial data
 */
function LoadingState({ colors }: StateColorsProps) {
  return (
    <View style={styles.centeredContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.stateText, { color: colors.textSecondary }]}>Loading channels...</Text>
    </View>
  );
}

/**
 * Error state shown when fetch fails
 */
function ErrorState({
  colors,
  message,
  onRetry,
}: StateColorsProps & { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.centeredContainer}>
      <Text style={styles.stateEmoji}>Something went wrong</Text>
      <Text style={[styles.stateTitle, { color: colors.text }]}>Could not load channels</Text>
      <Text style={[styles.stateText, { color: colors.textSecondary }]}>{message}</Text>
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

/**
 * Empty state shown when no channels are found
 */
function EmptyState({ colors, searchQuery }: StateColorsProps & { searchQuery: string }) {
  return (
    <View style={styles.centeredContainer}>
      <Text style={styles.stateEmoji}>No channels found</Text>
      <Text style={[styles.stateTitle, { color: colors.text }]}>
        {searchQuery ? 'No results' : 'No subscriptions found'}
      </Text>
      <Text style={[styles.stateText, { color: colors.textSecondary }]}>
        {searchQuery
          ? `No channels match "${searchQuery}"`
          : 'Your connected account has no subscriptions'}
      </Text>
    </View>
  );
}

// ============================================================================
// Channel Card Component (with Checkbox)
// ============================================================================

interface ChannelCardProps {
  channel: SourceChannel;
  provider: Provider;
  isSelected: boolean;
  onToggle: () => void;
  colors: typeof Colors.light;
}

function ChannelCard({ channel, provider, isSelected, onToggle, colors }: ChannelCardProps) {
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
// Helper Functions
// ============================================================================

/**
 * Get provider display name
 */
function getProviderDisplayName(provider: Provider): string {
  switch (provider) {
    case 'YOUTUBE':
      return 'YouTube';
    case 'SPOTIFY':
      return 'Spotify';
    default:
      return 'Provider';
  }
}

// ============================================================================
// Main Component
// ============================================================================

export default function SelectChannelsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const params = useLocalSearchParams<{ provider: string }>();

  // Normalize provider to uppercase
  const provider = (params.provider?.toUpperCase() ?? 'YOUTUBE') as Provider;
  const providerDisplayName = getProviderDisplayName(provider);
  const providerColor = provider === 'YOUTUBE' ? ProviderColors.youtube : ProviderColors.spotify;

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Selected channels state (set of provider IDs)
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());

  // Subscription state
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Get subscribe function from useSubscriptions
  const { subscribe } = useSubscriptions();

  // Fetch channels from provider using sources.list
  // Note: We filter by provider client-side since sources.list returns all sources

  const sourcesQuery = (trpc as any).sources?.list?.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutes
  }) ?? {
    data: undefined,
    isLoading: false,
    error: null,
    refetch: () => Promise.resolve(),
  };

  const isLoading = sourcesQuery.isLoading;
  const error = sourcesQuery.error;
  const refetch = sourcesQuery.refetch;

  // Filter channels by provider
  const channels: SourceChannel[] = useMemo(() => {
    if (!sourcesQuery.data) return [];
    return (sourcesQuery.data as SourceChannel[]).filter((source) => source.provider === provider);
  }, [sourcesQuery.data, provider]);

  // Filter channels by search query
  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) {
      return channels;
    }
    const query = searchQuery.toLowerCase();
    return channels.filter((channel) => channel.name.toLowerCase().includes(query));
  }, [channels, searchQuery]);

  // Toggle channel selection
  const toggleChannel = useCallback((providerId: string) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  }, []);

  // Select all channels
  const selectAll = useCallback(() => {
    setSelectedChannels(new Set(filteredChannels.map((c) => c.providerId)));
  }, [filteredChannels]);

  // Deselect all channels
  const deselectAll = useCallback(() => {
    setSelectedChannels(new Set());
  }, []);

  // Handle subscribe to selected channels
  const handleSubscribe = useCallback(async () => {
    if (selectedChannels.size === 0) return;

    setIsSubscribing(true);

    try {
      // Get selected channel objects
      const selectedChannelObjects = channels.filter((c) => selectedChannels.has(c.providerId));

      // Subscribe to each selected channel
      for (const channel of selectedChannelObjects) {
        const payload: SubscribePayload = {
          provider: channel.provider,
          providerChannelId: channel.providerId,
          name: channel.name,
        };
        subscribe(payload);
      }

      // Navigate to tabs after a short delay to allow subscriptions to process
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 500);
    } catch (err) {
      console.error('[SelectChannels] Subscribe error:', err);
    } finally {
      setIsSubscribing(false);
    }
  }, [selectedChannels, channels, subscribe, router]);

  // Skip and go to tabs without subscribing
  const handleSkip = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  // Render channel item
  const renderChannelItem = useCallback(
    ({ item }: { item: SourceChannel }) => (
      <ChannelCard
        channel={item}
        provider={provider}
        isSelected={selectedChannels.has(item.providerId)}
        onToggle={() => toggleChannel(item.providerId)}
        colors={colors}
      />
    ),
    [provider, selectedChannels, toggleChannel, colors]
  );

  // Key extractor for FlatList
  const keyExtractor = useCallback((item: SourceChannel) => item.providerId, []);

  // Selected count
  const selectedCount = selectedChannels.size;
  const totalCount = filteredChannels.length;
  const allSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: `Select ${providerDisplayName} Channels`,
          headerBackTitle: 'Back',
        }}
      />
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['bottom']}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Your {providerDisplayName} subscriptions
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Select channels to follow in Zine
          </Text>
        </View>

        {/* Search Bar */}
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
            <SearchIcon color={colors.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search channels..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* Select All / Deselect All */}
        {channels.length > 0 && (
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

        {/* Content */}
        {isLoading ? (
          <LoadingState colors={colors} />
        ) : error ? (
          <ErrorState
            colors={colors}
            message={error instanceof Error ? error.message : 'Failed to load channels'}
            onRetry={refetch}
          />
        ) : filteredChannels.length === 0 ? (
          <EmptyState colors={colors} searchQuery={searchQuery} />
        ) : (
          <FlatList
            data={filteredChannels}
            renderItem={renderChannelItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Bottom Actions */}
        <View style={[styles.bottomActions, { borderTopColor: colors.border }]}>
          {selectedCount > 0 ? (
            <Pressable
              onPress={handleSubscribe}
              disabled={isSubscribing}
              style={({ pressed }) => [
                styles.subscribeButton,
                { backgroundColor: providerColor },
                pressed && styles.buttonPressed,
                isSubscribing && styles.buttonDisabled,
              ]}
            >
              {isSubscribing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.subscribeButtonText}>
                  Subscribe to {selectedCount} channel{selectedCount !== 1 ? 's' : ''}
                </Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={handleSkip}
              style={({ pressed }) => [styles.skipButton, pressed && styles.buttonPressed]}
            >
              <Text style={[styles.skipButtonText, { color: colors.textSecondary }]}>
                Skip for now
              </Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    ...Typography.titleLarge,
    fontWeight: '700',
  },
  headerSubtitle: {
    ...Typography.bodyMedium,
    marginTop: Spacing.xs,
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
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  stateEmoji: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  stateTitle: {
    ...Typography.titleMedium,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  stateText: {
    ...Typography.bodyMedium,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '500',
    fontSize: 16,
  },
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
  bottomActions: {
    padding: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    borderRadius: Radius.lg,
    ...Shadows.md,
  },
  subscribeButtonText: {
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
