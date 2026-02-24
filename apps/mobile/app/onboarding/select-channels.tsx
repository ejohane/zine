/**
 * Channel Selection Screen (Onboarding)
 *
 * Multi-select UI for choosing which channels to subscribe to after OAuth.
 * Uses the shared ChannelSelectionList component in multi-select mode.
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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useToast } from 'heroui-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing, Typography } from '@/constants/theme';
import { showSuccess, showError } from '@/lib/toast-utils';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSubscriptions, type SubscribePayload } from '@/hooks/use-subscriptions';
import { trpc } from '@/lib/trpc';
import type { DiscoverAvailableInput, DiscoverAvailableOutput } from '@/lib/trpc-types';
import { validateAndConvertDiscoverProvider } from '@/lib/route-validation';
import {
  ChannelSelectionList,
  ChannelSelectionActionBar,
  type Channel,
  type Provider as ChannelProvider,
} from '@/components/subscriptions';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get provider display name
 */
function getProviderDisplayName(provider: ChannelProvider): string {
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

  // Validate and normalize provider to uppercase
  const providerValidation = validateAndConvertDiscoverProvider(params.provider);

  // Use validated provider or default to YOUTUBE for hook consistency
  // (hooks must be called unconditionally)
  const provider: ChannelProvider = providerValidation.success
    ? providerValidation.data
    : 'YOUTUBE';
  const discoverProvider: DiscoverAvailableInput['provider'] = provider;
  const providerDisplayName = getProviderDisplayName(provider);

  // Selected channels state (set of provider IDs)
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());

  // Subscription state
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Get subscribe function from useSubscriptions
  const { subscribe } = useSubscriptions();

  // Toast for user feedback
  const { toast } = useToast();

  // Fetch channels from provider
  const discoverQuery = trpc.subscriptions.discover.available.useQuery(
    { provider: discoverProvider },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      enabled: providerValidation.success && !!provider,
    }
  );

  // Transform channels for the shared component
  const channels: Channel[] = useMemo(() => {
    const data = discoverQuery.data as DiscoverAvailableOutput | undefined;
    return (data?.items ?? []).map((item: DiscoverAvailableOutput['items'][number]) => ({
      providerChannelId: item.id,
      name: item.name,
      description: null,
      imageUrl: item.imageUrl ?? null,
    }));
  }, [discoverQuery.data]);

  const isLoading = discoverQuery.isLoading;
  const error = discoverQuery.error;
  const normalizedError = error ? new Error(error.message) : null;

  const handleRetry = useCallback(() => {
    void discoverQuery.refetch();
  }, [discoverQuery]);

  // Handle subscribe to selected channels
  const handleSubscribe = useCallback(async () => {
    if (selectedChannels.size === 0) return;

    setIsSubscribing(true);

    try {
      // Get selected channel objects
      const selectedChannelObjects = channels.filter((c) =>
        selectedChannels.has(c.providerChannelId)
      );

      // Subscribe to each selected channel
      for (const channel of selectedChannelObjects) {
        const payload: SubscribePayload = {
          provider: discoverProvider,
          providerChannelId: channel.providerChannelId,
          name: channel.name,
        };
        subscribe(payload);
      }

      // Show success toast
      const count = selectedChannelObjects.length;
      showSuccess(
        toast,
        `Subscribed to ${count} channel${count !== 1 ? 's' : ''}`,
        'New content will appear in your inbox'
      );

      // Navigate to tabs after a short delay to allow subscriptions to process
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 500);
    } catch (err) {
      showError(toast, err, 'Failed to subscribe', 'SelectChannels');
    } finally {
      setIsSubscribing(false);
    }
  }, [selectedChannels, channels, discoverProvider, subscribe, router, toast]);

  // Skip and go to tabs without subscribing
  const handleSkip = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  // If provider is invalid, redirect to onboarding connect screen
  // (triggered in an effect to avoid navigation state updates during render)
  useEffect(() => {
    if (!providerValidation.success) {
      router.replace('/onboarding/connect');
    }
  }, [providerValidation.success, router]);

  if (!providerValidation.success) {
    return null;
  }

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

        {/* Channel Selection List */}
        <ChannelSelectionList
          provider={provider}
          channels={channels}
          isLoading={isLoading}
          error={normalizedError}
          onRetry={handleRetry}
          selectedIds={selectedChannels}
          onSelectionChange={setSelectedChannels}
          mode="multi"
          emptyTitle="No subscriptions found"
          emptyMessage="Your connected account has no subscriptions"
        />

        {/* Bottom Actions */}
        <ChannelSelectionActionBar
          selectedCount={selectedChannels.size}
          provider={provider}
          isSubscribing={isSubscribing}
          onSubscribe={handleSubscribe}
          onSkip={handleSkip}
        />
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
});
