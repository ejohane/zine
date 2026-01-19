/**
 * CreatorLatestContent Component
 *
 * Displays the latest content from a creator fetched from YouTube/Spotify APIs.
 * Shows a horizontal carousel of content items for discovery.
 * Only available for YouTube and Spotify creators when the user is connected.
 */

import { View, Text, FlatList, Pressable, Linking, StyleSheet } from 'react-native';

import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCreatorLatestContent, type CreatorContentItem } from '@/hooks/use-creator';

import { LatestContentCard, type LatestContentItem } from './LatestContentCard';

// ============================================================================
// Types
// ============================================================================

export interface CreatorLatestContentProps {
  /** The creator ID to fetch content for */
  creatorId: string;
  /** The provider (e.g., 'YOUTUBE', 'SPOTIFY') */
  provider: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Providers that support fetching latest content */
const SUPPORTED_PROVIDERS = ['YOUTUBE', 'SPOTIFY'];

// ============================================================================
// Helper Components
// ============================================================================

function Skeleton({ colors }: { colors: typeof Colors.light }) {
  return (
    <View style={styles.skeletonContainer}>
      {[1, 2, 3].map((i) => (
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
 * Only shows for YouTube and Spotify creators.
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
export function CreatorLatestContent({ creatorId, provider }: CreatorLatestContentProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Check if provider is supported
  const isSupported = SUPPORTED_PROVIDERS.includes(provider);

  // Always call hook to avoid conditional hook error
  // The hook will only fetch when enabled
  const { content, reason, connectUrl, isLoading, error } = useCreatorLatestContent(creatorId);

  // Don't render for unsupported providers
  if (!isSupported) {
    return null;
  }

  const providerDisplayName = provider.charAt(0) + provider.slice(1).toLowerCase();

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.container, { borderTopColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>More from this Creator</Text>
        <Skeleton colors={colors} />
      </View>
    );
  }

  // Not connected to provider
  if (reason === 'NOT_CONNECTED') {
    return (
      <View style={[styles.container, { borderTopColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>More from this Creator</Text>
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
      <View style={[styles.container, { borderTopColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>More from this Creator</Text>
        <ReconnectPrompt provider={provider} connectUrl={connectUrl} colors={colors} />
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={[styles.container, { borderTopColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>More from this Creator</Text>
        <Text style={[styles.errorText, { color: colors.error }]}>
          Failed to load latest content
        </Text>
      </View>
    );
  }

  // Empty state
  if (content.length === 0) {
    return (
      <View style={[styles.container, { borderTopColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>More from this Creator</Text>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No recent content found
        </Text>
      </View>
    );
  }

  // Transform API content to LatestContentItem format
  const items: LatestContentItem[] = content.map((item: CreatorContentItem) => ({
    providerId: item.providerId,
    title: item.title,
    thumbnailUrl: item.thumbnailUrl,
    duration: item.duration,
    publishedAt: item.publishedAt,
    url: item.url,
    isBookmarked: false, // TODO: Cross-reference with bookmarks when needed
  }));

  // Success state with items
  return (
    <View style={[styles.container, { borderTopColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>More from this Creator</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.providerId}
        renderItem={({ item }) => <LatestContentCard item={item} />}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
  },
  title: {
    ...Typography.titleMedium,
    fontWeight: '600',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  skeletonContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
  },
  skeletonItem: {
    width: 160,
    height: 140,
    borderRadius: Radius.md,
    marginRight: Spacing.md,
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
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  separator: {
    width: Spacing.md,
  },
});
