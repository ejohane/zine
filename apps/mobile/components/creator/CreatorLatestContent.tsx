/**
 * CreatorLatestContent Component
 *
 * Displays the latest content from a creator fetched from connected providers
 * or discovered source feeds.
 * Shows a horizontal carousel of content items for discovery.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, Pressable, Linking, StyleSheet } from 'react-native';

import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useCreatorLatestContent,
  type CreatorContentItem,
  type LatestContentCacheStatus,
} from '@/hooks/use-creator';
import { analytics, type ConnectionPromptReason } from '@/lib/analytics';
import { trpc } from '@/lib/trpc';

import { LatestContentCard, type LatestContentItem } from './LatestContentCard';

// ============================================================================
// Types
// ============================================================================

export interface CreatorLatestContentProps {
  /** The creator ID to fetch content for */
  creatorId: string;
  /** The provider (e.g., 'YOUTUBE', 'SPOTIFY', 'RSS', 'WEB', 'SUBSTACK') */
  provider: string;
  /** Optional override for deterministic tests/stories */
  stateOverride?: {
    content: CreatorContentItem[];
    reason?: string;
    connectUrl?: string;
    cacheStatus?: LatestContentCacheStatus;
    isLoading: boolean;
    error?: Error | null;
  };
}

// ============================================================================
// Constants
// ============================================================================

/** Providers that support fetching latest content */
const SUPPORTED_PROVIDERS = ['YOUTUBE', 'SPOTIFY', 'RSS', 'WEB', 'SUBSTACK'];
const THUMBNAIL_ENRICHMENT_PROVIDERS = ['RSS', 'WEB', 'SUBSTACK'];
const THUMBNAIL_BATCH_SIZE = 4;
const THUMBNAIL_BATCH_DELAY_MS = 120;
const THUMBNAIL_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 40,
  minimumViewTime: 120,
} as const;

/**
 * Gets the section title based on provider
 */
function getSectionTitle(provider: string): string {
  switch (provider) {
    case 'SPOTIFY':
      return 'Recent Episodes';
    case 'YOUTUBE':
      return 'Recent Videos';
    case 'RSS':
    case 'WEB':
    case 'SUBSTACK':
      return 'Recent Posts';
    default:
      return 'Recent Content';
  }
}

// ============================================================================
// Helper Components
// ============================================================================

function Skeleton({ colors }: { colors: typeof Colors.light }) {
  return (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[styles.skeletonItem, { backgroundColor: colors.backgroundTertiary }]}
        />
      ))}
    </View>
  );
}

interface ConnectPromptProps {
  provider: string;
  message: string;
  connectUrl?: string;
  colors: typeof Colors.light;
}

function ConnectPrompt({ provider, message, connectUrl, colors }: ConnectPromptProps) {
  const handleConnect = () => {
    if (connectUrl) {
      Linking.openURL(connectUrl);
    }
  };

  const providerDisplayName = provider.charAt(0) + provider.slice(1).toLowerCase();

  return (
    <View style={[styles.promptContainer, { backgroundColor: colors.backgroundSecondary }]}>
      <Text style={[styles.promptText, { color: colors.textSecondary }]}>{message}</Text>
      {connectUrl && (
        <Pressable
          onPress={handleConnect}
          style={({ pressed }) => [
            styles.connectButton,
            { backgroundColor: colors.buttonPrimary, opacity: pressed ? 0.9 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Connect ${providerDisplayName}`}
        >
          <Text style={[styles.connectButtonText, { color: colors.buttonPrimaryText }]}>
            Connect {providerDisplayName}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

interface ReconnectPromptProps {
  provider: string;
  connectUrl?: string;
  colors: typeof Colors.light;
}

function ReconnectPrompt({ provider, connectUrl, colors }: ReconnectPromptProps) {
  const handleReconnect = () => {
    if (connectUrl) {
      Linking.openURL(connectUrl);
    }
  };

  const providerDisplayName = provider.charAt(0) + provider.slice(1).toLowerCase();

  return (
    <View style={[styles.promptContainer, { backgroundColor: colors.backgroundSecondary }]}>
      <Text style={[styles.promptText, { color: colors.textSecondary }]}>
        Your {providerDisplayName} connection needs to be refreshed
      </Text>
      {connectUrl && (
        <Pressable
          onPress={handleReconnect}
          style={({ pressed }) => [
            styles.connectButton,
            { backgroundColor: colors.buttonPrimary, opacity: pressed ? 0.9 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Reconnect ${providerDisplayName}`}
        >
          <Text style={[styles.connectButtonText, { color: colors.buttonPrimaryText }]}>
            Reconnect
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ============================================================================
// Component
// ============================================================================

/**
 * CreatorLatestContent displays the latest content from a creator.
 *
 * States:
 * - Loading: Shows skeleton placeholders
 * - Not Connected: Shows prompt to connect provider account
 * - Token Expired: Shows prompt to reconnect
 * - Error: Shows error message
 * - Empty: Shows "No recent content" message
 * - Success: Shows horizontal carousel of content
 *
 * @example
 * ```tsx
 * <CreatorLatestContent creatorId="creator-123" provider="YOUTUBE" />
 * ```
 */
export function CreatorLatestContent({
  creatorId,
  provider,
  stateOverride,
}: CreatorLatestContentProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [resolvedThumbnailUrls, setResolvedThumbnailUrls] = useState<Record<string, string | null>>(
    {}
  );
  const thumbnailQueueRef = useRef<string[]>([]);
  const requestedThumbnailUrlsRef = useRef(new Set<string>());
  const isProcessingQueueRef = useRef(false);

  // Check if provider is supported
  const isSupported = SUPPORTED_PROVIDERS.includes(provider);
  const shouldEnrichThumbnails = THUMBNAIL_ENRICHMENT_PROVIDERS.includes(provider);

  // Always call hook to avoid conditional hook error
  // The hook will only fetch when enabled
  const latestContentState = useCreatorLatestContent(creatorId);
  const content = stateOverride?.content ?? latestContentState.content;
  const reason = stateOverride?.reason ?? latestContentState.reason;
  const connectUrl = stateOverride?.connectUrl ?? latestContentState.connectUrl;
  const cacheStatus = stateOverride?.cacheStatus ?? latestContentState.cacheStatus;
  const isLoading = stateOverride?.isLoading ?? latestContentState.isLoading;
  const error = stateOverride?.error ?? latestContentState.error;
  const resolveLatestContentThumbnailsMutation =
    trpc.creators.resolveLatestContentThumbnails.useMutation();

  // Track content loaded once
  const hasTrackedContentLoaded = useRef(false);
  useEffect(() => {
    if (!isLoading && !error && content.length > 0 && !hasTrackedContentLoaded.current) {
      hasTrackedContentLoaded.current = true;
      analytics.track('creator_latest_content_loaded', {
        creatorId,
        provider,
        contentCount: content.length,
        hadCache: cacheStatus === 'HIT',
      });
    }
  }, [isLoading, error, content.length, creatorId, provider, cacheStatus]);

  // Track connect prompt shown once
  const hasTrackedConnectPrompt = useRef(false);
  useEffect(() => {
    if (
      !isLoading &&
      (reason === 'NOT_CONNECTED' || reason === 'TOKEN_EXPIRED') &&
      !hasTrackedConnectPrompt.current
    ) {
      hasTrackedConnectPrompt.current = true;
      analytics.track('creator_connect_prompt_shown', {
        creatorId,
        provider,
        reason: reason as ConnectionPromptReason,
      });
    }
  }, [isLoading, reason, creatorId, provider]);

  const providerDisplayName = provider.charAt(0) + provider.slice(1).toLowerCase();
  const sectionTitle = getSectionTitle(provider);

  const processThumbnailQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) {
      return;
    }

    isProcessingQueueRef.current = true;
    try {
      while (thumbnailQueueRef.current.length > 0) {
        const batch = thumbnailQueueRef.current.splice(0, THUMBNAIL_BATCH_SIZE);
        if (batch.length === 0) {
          continue;
        }

        try {
          const result = await resolveLatestContentThumbnailsMutation.mutateAsync({
            creatorId,
            urls: batch,
          });

          if (result.items.length > 0) {
            setResolvedThumbnailUrls((previous) => {
              const next = { ...previous };
              for (const item of result.items) {
                next[item.url] = item.thumbnailUrl ?? null;
              }
              return next;
            });
          }
        } catch {
          // Keep base list rendering intact when enrichment fails.
        }

        if (thumbnailQueueRef.current.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, THUMBNAIL_BATCH_DELAY_MS));
        }
      }
    } finally {
      isProcessingQueueRef.current = false;
    }
  }, [creatorId, resolveLatestContentThumbnailsMutation]);

  const enqueueThumbnailUrls = useCallback(
    (urls: string[]) => {
      let hasQueuedItems = false;

      for (const url of urls) {
        if (!url || requestedThumbnailUrlsRef.current.has(url)) {
          continue;
        }

        requestedThumbnailUrlsRef.current.add(url);
        thumbnailQueueRef.current.push(url);
        hasQueuedItems = true;
      }

      if (hasQueuedItems) {
        void processThumbnailQueue();
      }
    },
    [processThumbnailQueue]
  );

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { item: LatestContentItem; isViewable?: boolean }[] }) => {
      if (!shouldEnrichThumbnails || viewableItems.length === 0) {
        return;
      }

      const visibleMissingUrls = viewableItems
        .filter((token) => token.isViewable)
        .map((token) => token.item)
        .filter((item) => !item.thumbnailUrl && typeof item.url === 'string' && item.url.length > 0)
        .map((item) => item.url as string);

      enqueueThumbnailUrls(visibleMissingUrls);
    },
    [enqueueThumbnailUrls, shouldEnrichThumbnails]
  );

  // Reset progressive thumbnail state when creator/content set changes.
  const contentIdentity = useMemo(
    () => content.map((item) => `${item.id}:${item.externalUrl}`).join('|'),
    [content]
  );
  useEffect(() => {
    thumbnailQueueRef.current = [];
    requestedThumbnailUrlsRef.current = new Set();
    isProcessingQueueRef.current = false;
    setResolvedThumbnailUrls({});
  }, [creatorId, contentIdentity]);

  // Lazy follow-up enrichment:
  // 1. Render content immediately from existing metadata.
  // 2. Backfill only the first visible chunk immediately.
  // 3. Queue additional items as they become viewable.
  useEffect(() => {
    if (
      !isSupported ||
      !shouldEnrichThumbnails ||
      isLoading ||
      !!error ||
      !!reason ||
      content.length === 0
    ) {
      return;
    }

    const initialMissingUrls = content
      .slice(0, THUMBNAIL_BATCH_SIZE)
      .filter((item) => !item.thumbnailUrl)
      .map((item) => item.externalUrl)
      .filter((url): url is string => typeof url === 'string' && url.length > 0);

    enqueueThumbnailUrls(initialMissingUrls);
  }, [
    content,
    enqueueThumbnailUrls,
    error,
    isLoading,
    isSupported,
    reason,
    shouldEnrichThumbnails,
  ]);

  // Don't render for unsupported providers
  if (!isSupported) {
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.text }]}>{sectionTitle}</Text>
        <Skeleton colors={colors} />
      </View>
    );
  }

  // Not connected to provider
  if (reason === 'NOT_CONNECTED') {
    return (
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.text }]}>{sectionTitle}</Text>
        <ConnectPrompt
          provider={provider}
          message={`Connect your ${providerDisplayName} account to see latest content`}
          connectUrl={connectUrl}
          colors={colors}
        />
      </View>
    );
  }

  // Token expired
  if (reason === 'TOKEN_EXPIRED') {
    return (
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.text }]}>{sectionTitle}</Text>
        <ReconnectPrompt provider={provider} connectUrl={connectUrl} colors={colors} />
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.text }]}>{sectionTitle}</Text>
        <Text style={[styles.errorText, { color: colors.error }]}>
          Failed to load latest content
        </Text>
      </View>
    );
  }

  // Empty state
  if (content.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.title, { color: colors.text }]}>{sectionTitle}</Text>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No recent content found
        </Text>
      </View>
    );
  }

  // Transform API content to LatestContentItem format
  const items: LatestContentItem[] = content.map((item: CreatorContentItem) => ({
    providerId: item.id,
    title: item.title,
    description: item.description,
    thumbnailUrl: item.thumbnailUrl ?? resolvedThumbnailUrls[item.externalUrl] ?? null,
    duration: item.duration,
    publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : null,
    url: item.externalUrl,
    itemId: item.itemId ?? null,
    isBookmarked: item.isBookmarked ?? false,
  }));

  // Success state with items
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>{sectionTitle}</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.providerId}
        renderItem={({ item }) => (
          <LatestContentCard item={item} creatorId={creatorId} provider={provider} />
        )}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={THUMBNAIL_VIEWABILITY_CONFIG}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        // Disable virtualization when nested in ScrollView - ensures all items render
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={21}
      />
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    paddingTop: Spacing.xl,
  },
  title: {
    ...Typography.titleMedium,
    fontWeight: '600',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  skeletonContainer: {
    paddingHorizontal: Spacing.lg,
  },
  skeletonItem: {
    height: 72,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  promptContainer: {
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  promptText: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  connectButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    borderRadius: Radius.full,
  },
  connectButtonText: {
    ...Typography.labelLarge,
    fontWeight: '600',
  },
  errorText: {
    ...Typography.bodyMedium,
    paddingHorizontal: Spacing.lg,
  },
  emptyText: {
    ...Typography.bodyMedium,
    paddingHorizontal: Spacing.lg,
  },
  listContent: {
    paddingBottom: Spacing.lg,
  },
});
