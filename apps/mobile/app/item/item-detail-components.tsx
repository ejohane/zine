import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import Animated from 'react-native-reanimated';

import { SourceBadge, TypeBadge } from '@/components/badges';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import type { Colors } from '@/constants/theme';
import { Spacing } from '@/constants/theme';
import type { Provider } from '@/hooks/use-items-trpc';
import { ContentType } from '@/hooks/use-items-trpc';
import { formatRelativeTime } from '@/lib/format';
import { logger } from '@/lib/logger';

import { extractXHandle, getFabConfig } from './item-detail-helpers';
import { styles, xPostStyles } from './item-detail-styles';

// ============================================================================
// Linked Text Component (URL Detection)
// ============================================================================

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export function LinkedText({
  children,
  style,
  linkColor,
}: {
  children: string;
  style?: object;
  linkColor: string;
}) {
  const parts = children.split(URL_REGEX);

  const handleLinkPress = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (err) {
      logger.error('Failed to open URL', { error: err });
    }
  };

  return (
    <Text style={style}>
      {parts.map((part, index) => {
        if (URL_REGEX.test(part)) {
          // Reset regex lastIndex since we're reusing it
          URL_REGEX.lastIndex = 0;
          return (
            <Text
              key={index}
              style={{ color: linkColor, textDecorationLine: 'underline' }}
              onPress={() => handleLinkPress(part)}
            >
              {part}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}

// ============================================================================
// Icon Action Button
// ============================================================================

export function IconActionButton({
  icon,
  color,
  onPress,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={[styles.iconActionButton, disabled ? { opacity: 0.5 } : null]}
    >
      <Ionicons name={icon} size={24} color={color} style={{ fontWeight: '700' }} />
    </Pressable>
  );
}

// ============================================================================
// Floating Header Button
// ============================================================================

export function HeaderIconButton({
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
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

// ============================================================================
// X Post Body Component
// ============================================================================

/**
 * X Post Bookmark View
 *
 * Renders X/Twitter posts in a Twitter-like layout:
 * - ScrollView (no parallax header image)
 * - Tweet text as title at top
 * - Profile row with avatar and name
 * - Meta row with @handle and timestamp
 * - Action row with icons + FAB
 * - Twitter-like content section with avatar + author info + full text
 */
export function XPostBookmarkView({
  item,
  colors,
  insets,
  onBack,
  onOpenLink,
  onShare,
  onBookmarkToggle,
  onComplete,
  onCreatorPress,
  bookmarkActionIcon,
  bookmarkActionColor,
  isBookmarkActionDisabled,
  completeActionIcon,
  completeActionColor,
  isCompleteActionDisabled,
  creatorData,
}: {
  item: {
    id: string;
    title: string;
    creator: string;
    creatorImageUrl?: string | null;
    creatorId?: string | null;
    thumbnailUrl?: string | null;
    summary?: string | null;
    publishedAt?: string | null;
    canonicalUrl: string;
    provider: string;
  };
  colors: typeof Colors.dark;
  insets: { top: number; bottom: number };
  onBack: () => void;
  onOpenLink: () => void;
  onShare: () => void;
  onBookmarkToggle: () => void;
  onComplete: () => void;
  onCreatorPress?: () => void;
  bookmarkActionIcon: keyof typeof Ionicons.glyphMap;
  bookmarkActionColor: string;
  isBookmarkActionDisabled: boolean;
  completeActionIcon: keyof typeof Ionicons.glyphMap;
  completeActionColor: string;
  isCompleteActionDisabled: boolean;
  creatorData?: { handle?: string | null } | null;
}) {
  // Extract @handle from URL as fallback if creatorData.handle not available
  const handle = creatorData?.handle || extractXHandle(item.canonicalUrl);

  // Get FAB config for X
  const fabConfig = getFabConfig(item.provider);

  // Check if we have a thumbnail for parallax
  const hasThumbnail = !!item.thumbnailUrl;

  // Shared content sections
  const renderContent = () => (
    <>
      {/* Content Section */}
      <Animated.View style={styles.contentContainer}>
        {/* Badges Row */}
        <View style={styles.badgeRow}>
          <SourceBadge provider={item.provider as Provider} />
          <TypeBadge contentType={ContentType.POST} />
        </View>

        {/* Creator Row - same as YouTube/Spotify */}
        {item.creatorId && onCreatorPress ? (
          <Pressable
            style={styles.creatorRow}
            onPress={onCreatorPress}
            accessibilityRole="button"
            accessibilityLabel={`View ${item.creator}'s profile`}
          >
            {item.creatorImageUrl ? (
              <Image
                source={{ uri: item.creatorImageUrl }}
                style={styles.creatorThumbnail}
                contentFit="cover"
              />
            ) : (
              <View
                style={[styles.creatorPlaceholder, { backgroundColor: colors.backgroundTertiary }]}
              >
                <Text style={[styles.creatorInitial, { color: colors.textTertiary }]}>
                  {item.creator?.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={[styles.creatorName, { color: colors.text }]}>{item.creator}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
          </Pressable>
        ) : (
          <View style={styles.sourceRow}>
            {item.creatorImageUrl ? (
              <Image
                source={{ uri: item.creatorImageUrl }}
                style={styles.sourceThumbnail}
                contentFit="cover"
              />
            ) : (
              <View
                style={[styles.sourcePlaceholder, { backgroundColor: colors.backgroundTertiary }]}
              >
                <Ionicons name="person" size={14} color={colors.textTertiary} />
              </View>
            )}
            <Text style={[styles.sourceName, { color: colors.text }]}>{item.creator}</Text>
          </View>
        )}

        {/* Meta Row - same format as YouTube/Spotify */}
        <View style={styles.metaRow}>
          {handle && (
            <>
              <Text style={[styles.metaText, { color: colors.textTertiary }]}>{handle}</Text>
              <Text style={[styles.metaDot, { color: colors.textTertiary }]}> · </Text>
            </>
          )}
          {item.publishedAt && (
            <Text style={[styles.metaText, { color: colors.textTertiary }]}>
              {formatRelativeTime(item.publishedAt)}
            </Text>
          )}
        </View>
      </Animated.View>

      {/* Icon Action Row */}
      <Animated.View style={styles.actionRow}>
        <View style={styles.actionRowLeft}>
          <IconActionButton
            icon={bookmarkActionIcon}
            color={bookmarkActionColor}
            onPress={onBookmarkToggle}
            disabled={isBookmarkActionDisabled}
          />
          <IconActionButton
            icon={completeActionIcon}
            color={completeActionColor}
            onPress={onComplete}
            disabled={isCompleteActionDisabled}
          />
          <IconActionButton icon="add-circle-outline" color={colors.textSecondary} />
          <IconActionButton icon="share-outline" color={colors.textSecondary} onPress={onShare} />
          <IconActionButton icon="ellipsis-horizontal" color={colors.textSecondary} />
        </View>
        <Pressable
          onPress={onOpenLink}
          style={[styles.fabButton, { backgroundColor: fabConfig.backgroundColor }]}
        >
          {fabConfig.providerIcon}
        </Pressable>
      </Animated.View>

      {/* Tweet Content Section - Twitter-like layout */}
      <Animated.View style={xPostStyles.tweetContentSection}>
        <View style={xPostStyles.tweetRow}>
          {/* Avatar on the left */}
          {item.creatorImageUrl ? (
            <Image
              source={{ uri: item.creatorImageUrl }}
              style={xPostStyles.tweetAvatar}
              contentFit="cover"
            />
          ) : (
            <View
              style={[
                xPostStyles.tweetAvatar,
                {
                  backgroundColor: colors.backgroundTertiary,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
            >
              <Ionicons name="person" size={24} color={colors.textTertiary} />
            </View>
          )}

          {/* Content on the right */}
          <View style={xPostStyles.tweetContentRight}>
            {/* Name, handle, timestamp row */}
            <View style={xPostStyles.tweetAuthorRow}>
              <Text style={[xPostStyles.tweetAuthorName, { color: colors.text }]} numberOfLines={1}>
                {item.creator}
              </Text>
              {handle && (
                <Text
                  style={[xPostStyles.tweetAuthorHandle, { color: colors.textTertiary }]}
                  numberOfLines={1}
                >
                  @{handle}
                </Text>
              )}
              {item.publishedAt && (
                <Text style={[xPostStyles.tweetTimestamp, { color: colors.textTertiary }]}>
                  · {formatRelativeTime(item.publishedAt)}
                </Text>
              )}
            </View>

            {/* Tweet text with link detection */}
            <LinkedText
              style={[xPostStyles.postText, { color: colors.text }]}
              linkColor={colors.primary}
            >
              {item.title}
            </LinkedText>

            {/* Additional content from summary if different from title */}
            {item.summary && item.summary !== item.title && (
              <LinkedText
                style={[xPostStyles.postText, { color: colors.text, marginTop: Spacing.sm }]}
                linkColor={colors.primary}
              >
                {item.summary}
              </LinkedText>
            )}
          </View>
        </View>
      </Animated.View>
    </>
  );

  // Render with parallax for X posts with thumbnails
  if (hasThumbnail) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: '', headerShown: false }} />

        <Animated.View style={styles.animatedContainer}>
          <ParallaxScrollView
            headerImage={
              <Image
                source={{ uri: item.thumbnailUrl! }}
                style={styles.parallaxCoverImage}
                contentFit="cover"
                transition={300}
              />
            }
            headerAspectRatio={16 / 9}
          >
            {renderContent()}
          </ParallaxScrollView>
        </Animated.View>

        {/* Floating Back Button */}
        <View style={[styles.floatingHeader, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Animated.View>
            <HeaderIconButton icon="chevron-back" colors={colors} onPress={onBack} />
          </Animated.View>
        </View>
      </View>
    );
  }

  // Fallback for X posts without thumbnails - use regular ScrollView
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: '', headerShown: false }} />

      <Animated.View style={styles.animatedContainer}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 56 }]}
          showsVerticalScrollIndicator={false}
        >
          {renderContent()}
        </ScrollView>
      </Animated.View>

      {/* Floating Back Button */}
      <View style={[styles.floatingHeader, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Animated.View>
          <HeaderIconButton icon="chevron-back" colors={colors} onPress={onBack} />
        </Animated.View>
      </View>
    </View>
  );
}
