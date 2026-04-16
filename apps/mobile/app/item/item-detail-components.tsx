import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { View, Text, ScrollView, Pressable, Linking, type ScrollViewProps } from 'react-native';
import Animated from 'react-native-reanimated';

import { SourceBadge, TypeBadge } from '@/components/badges';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import type { Colors } from '@/constants/theme';
import { Spacing } from '@/constants/theme';
import type { Provider, UserItemState } from '@/hooks/use-items-trpc';
import { ContentType } from '@/hooks/use-items-trpc';
import { formatRelativeTime } from '@/lib/format';
import { logger } from '@/lib/logger';

import { ItemDetailActions } from './detail/components/ItemDetailActions';
import { ItemDetailFloatingBack } from './detail/components/ItemDetailFloatingBack';
import { extractXHandle } from './item-detail-helpers';
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
  onSecondaryAction,
  onManageTags,
  onCreatorPress,
  bookmarkActionIcon,
  bookmarkActionColor,
  isBookmarkActionDisabled,
  secondaryActionIcon,
  secondaryActionColor,
  isSecondaryActionDisabled,
  creatorData,
  showCollapsedTitle,
  showStickyActions,
  stickyActionsTop,
  stickyBackdropHeight,
  onScroll,
  onContentLayout,
  onTitleLayout,
  onActionRowLayout,
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
    state: UserItemState;
  };
  colors: typeof Colors.dark;
  insets: { top: number; bottom: number };
  onBack: () => void;
  onOpenLink: () => void;
  onShare: () => void;
  onBookmarkToggle: () => void;
  onSecondaryAction: () => void;
  onManageTags: () => void;
  onCreatorPress?: () => void;
  bookmarkActionIcon: keyof typeof Ionicons.glyphMap;
  bookmarkActionColor: string;
  isBookmarkActionDisabled: boolean;
  secondaryActionIcon: keyof typeof Ionicons.glyphMap;
  secondaryActionColor: string;
  isSecondaryActionDisabled: boolean;
  creatorData?: { handle?: string | null } | null;
  showCollapsedTitle: boolean;
  showStickyActions: boolean;
  stickyActionsTop: number;
  stickyBackdropHeight: number;
  onScroll: ScrollViewProps['onScroll'];
  onContentLayout: (contentTopY: number) => void;
  onTitleLayout: (titleOffsetY: number) => void;
  onActionRowLayout: (actionRowStartY: number) => void;
}) {
  // Extract @handle from URL as fallback if creatorData.handle not available
  const handle = creatorData?.handle || extractXHandle(item.canonicalUrl);

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

      <ItemDetailActions
        item={item}
        colors={colors}
        bookmarkActionIcon={bookmarkActionIcon}
        bookmarkActionColor={bookmarkActionColor}
        isBookmarkActionDisabled={isBookmarkActionDisabled}
        secondaryActionIcon={secondaryActionIcon}
        secondaryActionColor={secondaryActionColor}
        isSecondaryActionDisabled={isSecondaryActionDisabled}
        onBookmarkToggle={onBookmarkToggle}
        onSecondaryAction={onSecondaryAction}
        onManageTags={onManageTags}
        onShare={onShare}
        onOpenLink={onOpenLink}
        useAnimatedContainer
        onLayout={onActionRowLayout}
      />

      {/* Tweet Content Section - Twitter-like layout */}
      <Animated.View
        style={xPostStyles.tweetContentSection}
        onLayout={({ nativeEvent }) => onContentLayout(nativeEvent.layout.y)}
      >
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
            <View onLayout={({ nativeEvent }) => onTitleLayout(nativeEvent.layout.y)}>
              <LinkedText
                style={[xPostStyles.postText, { color: colors.text }]}
                linkColor={colors.primary}
              >
                {item.title}
              </LinkedText>
            </View>

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
            onScroll={onScroll}
          >
            {renderContent()}
          </ParallaxScrollView>
        </Animated.View>

        <ItemDetailFloatingBack
          colors={colors}
          insets={insets}
          onBack={onBack}
          screenTitle={item.title}
          showCollapsedTitle={showCollapsedTitle}
          showStickyActions={showStickyActions}
          stickyActionsTop={stickyActionsTop}
          stickyBackdropHeight={stickyBackdropHeight}
          stickyActions={
            <ItemDetailActions
              item={item}
              colors={colors}
              bookmarkActionIcon={bookmarkActionIcon}
              bookmarkActionColor={bookmarkActionColor}
              isBookmarkActionDisabled={isBookmarkActionDisabled}
              secondaryActionIcon={secondaryActionIcon}
              secondaryActionColor={secondaryActionColor}
              isSecondaryActionDisabled={isSecondaryActionDisabled}
              onBookmarkToggle={onBookmarkToggle}
              onSecondaryAction={onSecondaryAction}
              onManageTags={onManageTags}
              onShare={onShare}
              onOpenLink={onOpenLink}
              useAnimatedContainer={false}
              style={styles.stickyActionRow}
            />
          }
        />
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
          onScroll={onScroll}
          scrollEventThrottle={32}
        >
          {renderContent()}
        </ScrollView>
      </Animated.View>

      <ItemDetailFloatingBack
        colors={colors}
        insets={insets}
        onBack={onBack}
        screenTitle={item.title}
        showCollapsedTitle={showCollapsedTitle}
        showStickyActions={showStickyActions}
        stickyActionsTop={stickyActionsTop}
        stickyBackdropHeight={stickyBackdropHeight}
        stickyActions={
          <ItemDetailActions
            item={item}
            colors={colors}
            bookmarkActionIcon={bookmarkActionIcon}
            bookmarkActionColor={bookmarkActionColor}
            isBookmarkActionDisabled={isBookmarkActionDisabled}
            secondaryActionIcon={secondaryActionIcon}
            secondaryActionColor={secondaryActionColor}
            isSecondaryActionDisabled={isSecondaryActionDisabled}
            onBookmarkToggle={onBookmarkToggle}
            onSecondaryAction={onSecondaryAction}
            onManageTags={onManageTags}
            onShare={onShare}
            onOpenLink={onOpenLink}
            useAnimatedContainer={false}
            style={styles.stickyActionRow}
          />
        }
      />
    </View>
  );
}
