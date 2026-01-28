/**
 * Creator View Screen
 *
 * Displays a creator's profile with their info, the user's bookmarks from this creator,
 * and latest content from YouTube/Spotify.
 *
 * Features:
 * - Creator header with image, name, provider badge, and subscribe button
 * - User's bookmarked items from this creator
 * - Latest content from the creator (YouTube/Spotify only)
 * - Loading, error, and not found states
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreatorHeader, CreatorBookmarks, CreatorLatestContent } from '@/components/creator';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCreator, useCreatorBookmarks } from '@/hooks/use-creator';
import { analytics, type CreatorViewSource } from '@/lib/analytics';
import { upgradeYouTubeImageUrl, upgradeSpotifyImageUrl } from '@/lib/content-utils';

// ============================================================================
// Floating Header Button
// ============================================================================

function HeaderIconButton({
  icon,
  colors,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  colors: typeof Colors.dark;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.headerIconButton, { backgroundColor: colors.backgroundSecondary }]}
      accessibilityRole="button"
      accessibilityLabel="Go back"
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function CreatorScreen() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: CreatorViewSource }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { creator, isLoading, error, refetch } = useCreator(id ?? '');
  const { bookmarks } = useCreatorBookmarks(id ?? '');

  // Track view once when creator data is loaded
  const hasTrackedView = useRef(false);
  useEffect(() => {
    if (creator && !hasTrackedView.current) {
      hasTrackedView.current = true;
      analytics.track('creator_view_opened', {
        creatorId: creator.id,
        provider: creator.provider,
        source: source ?? 'item_page',
        bookmarkCount: bookmarks.length,
      });
    }
  }, [creator, source, bookmarks.length]);

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        {/* Floating Back Button */}
        <View style={[styles.floatingHeader, { top: insets.top + 8 }]} pointerEvents="box-none">
          <HeaderIconButton icon="chevron-back" colors={colors} onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorEmoji]}>:(</Text>
          <Text style={[styles.errorTitle, { color: colors.text }]}>Something went wrong</Text>
          <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>
            {error.message}
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading creator"
          >
            <Text style={[styles.retryButtonText, { color: colors.buttonPrimaryText }]}>
              Try Again
            </Text>
          </Pressable>
        </View>
        {/* Floating Back Button */}
        <View style={[styles.floatingHeader, { top: insets.top + 8 }]} pointerEvents="box-none">
          <HeaderIconButton icon="chevron-back" colors={colors} onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  // Not found state
  if (!creator) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />
        <View style={styles.errorContainer}>
          <Text style={[styles.errorEmoji]}>?</Text>
          <Text style={[styles.errorTitle, { color: colors.text }]}>Creator not found</Text>
          <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>
            This creator may have been removed or does not exist.
          </Text>
        </View>
        {/* Floating Back Button */}
        <View style={[styles.floatingHeader, { top: insets.top + 8 }]} pointerEvents="box-none">
          <HeaderIconButton icon="chevron-back" colors={colors} onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  // Success state with creator data
  const hasImage = !!creator.imageUrl;

  // Render with parallax if creator has an image
  if (hasImage) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />

        <Animated.View style={styles.animatedContainer}>
          <ParallaxScrollView
            headerImage={
              <Image
                source={{
                  uri:
                    upgradeSpotifyImageUrl(upgradeYouTubeImageUrl(creator.imageUrl)) ?? undefined,
                }}
                style={styles.parallaxCoverImage}
                contentFit="cover"
                transition={300}
              />
            }
            headerHeightFraction={0.35}
          >
            <Animated.View>
              <CreatorHeader creator={creator} />
              <CreatorBookmarks creatorId={id ?? ''} />
              <CreatorLatestContent creatorId={id ?? ''} provider={creator.provider} />
            </Animated.View>
          </ParallaxScrollView>
        </Animated.View>

        {/* Floating Back Button */}
        <View style={[styles.floatingHeader, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Animated.View>
            <HeaderIconButton icon="chevron-back" colors={colors} onPress={() => router.back()} />
          </Animated.View>
        </View>
      </View>
    );
  }

  // Fallback for creators without an image
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: '', headerShown: false }} />

      <Animated.View style={styles.animatedContainer}>
        <ParallaxScrollView
          headerImage={
            <View
              style={[styles.parallaxPlaceholder, { backgroundColor: colors.backgroundSecondary }]}
            >
              <Text style={[styles.parallaxPlaceholderText, { color: colors.textTertiary }]}>
                {creator.name.charAt(0).toUpperCase()}
              </Text>
            </View>
          }
          headerHeightFraction={0.45}
        >
          <Animated.View>
            <CreatorHeader creator={creator} />
            <CreatorBookmarks creatorId={id ?? ''} />
            <CreatorLatestContent creatorId={id ?? ''} provider={creator.provider} />
          </Animated.View>
        </ParallaxScrollView>
      </Animated.View>

      {/* Floating Back Button */}
      <View style={[styles.floatingHeader, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Animated.View>
          <HeaderIconButton icon="chevron-back" colors={colors} onPress={() => router.back()} />
        </Animated.View>
      </View>
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
  animatedContainer: {
    flex: 1,
  },

  // Parallax header
  parallaxCoverImage: {
    width: '100%',
    height: '100%',
  },
  parallaxPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  parallaxPlaceholderText: {
    fontSize: 64,
    fontWeight: '700',
  },

  // Loading state
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Error/Not found states
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['2xl'],
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: Spacing.lg,
  },
  errorTitle: {
    ...Typography.headlineSmall,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  errorMessage: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  retryButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    borderRadius: Radius.full,
  },
  retryButtonText: {
    ...Typography.labelLarge,
    fontWeight: '600',
  },

  // Floating Header
  floatingHeader: {
    position: 'absolute',
    left: Spacing.xl,
    right: Spacing.xl,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    zIndex: 100,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
