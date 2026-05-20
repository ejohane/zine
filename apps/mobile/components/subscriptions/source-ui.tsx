import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useCallback, useRef } from 'react';
import { View, Image, Pressable, StyleSheet, TextInput } from 'react-native';
import { Rss } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { Badge, Button, IconButton, Surface, Text } from '@/components/primitives';
import {
  CheckIcon,
  CheckOutlineIcon,
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from '@/components/icons';
import { Radius, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  type IntegrationState,
  type SubscriptionSource,
  getIntegrationBadgeLabel,
  getSubscriptionSourceConfig,
} from '@/lib/subscription-sources';

const SOURCE_BRAND_ICON_COLOR = '#FFFFFF'; // design-system-exception: white brand glyphs
const ACTION_LANE_WIDTH = 220;
const ACTION_CIRCLE_SIZE = 64;
const ACTION_ICON_SIZE = 24;
const STRETCH_START_DISTANCE = 96;
const COMMIT_DISTANCE = 164;
const ACTION_STRETCHED_WIDTH = 156;
const ACTION_MAX_WIDTH = 204;
const SWIPE_THRESHOLD = COMMIT_DISTANCE;
const SWIPE_FRICTION = 1.08;
const OVERSHOOT_FRICTION = 8;

// design-system-exception: brand colors matching FAB config in item-detail-helpers.tsx
const SOURCE_BRAND: Record<SubscriptionSource, { bg: string; icon: React.ReactNode }> = {
  YOUTUBE: {
    bg: '#FF0000', // design-system-exception: YouTube brand color
    icon: <Ionicons name="logo-youtube" size={22} color="#FFFFFF" />, // design-system-exception: white on brand
  },
  SPOTIFY: {
    bg: '#1DB954', // design-system-exception: Spotify brand color
    icon: <FontAwesome5 name="spotify" size={22} color="#FFFFFF" />, // design-system-exception: white on brand
  },
  GMAIL: {
    bg: '#1A73E8', // design-system-exception: Gmail brand color
    icon: <Ionicons name="newspaper-outline" size={22} color="#FFFFFF" />, // design-system-exception: white on brand
  },
  X: {
    bg: '#111111', // design-system-exception: X brand color
    icon: (
      <Text variant="labelLarge" style={{ color: SOURCE_BRAND_ICON_COLOR }}>
        X
      </Text>
    ), // design-system-exception: white on brand
  },
  RSS: {
    bg: '#F59E0B', // design-system-exception: RSS accent color
    icon: <Rss size={20} color="#FFFFFF" strokeWidth={2.5} />, // design-system-exception: white on brand
  },
};

function SourceGlyph({ source }: { source: SubscriptionSource }) {
  return SOURCE_BRAND[source].icon;
}

function getBadgeTone(state: IntegrationState): 'subtle' | 'success' | 'warning' | 'info' {
  if (state === 'connected') {
    return 'success';
  }

  if (state === 'needsAttention') {
    return 'warning';
  }

  if (state === 'manual') {
    return 'info';
  }

  return 'subtle';
}

function Avatar({ imageUrl, title }: { imageUrl?: string | null; title: string }) {
  const { colors } = useAppTheme();

  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={styles.avatarImage} />;
  }

  return (
    <View style={[styles.avatarFallback, { backgroundColor: colors.surfaceRaised }]}>
      <Text variant="labelLarge" tone="secondary" transform="none">
        {title.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

interface SwipeActionPanelProps {
  progress: SharedValue<number>;
  translation: SharedValue<number>;
  releaseLocked: SharedValue<boolean>;
}

type SwipeCapsuleProps = SwipeActionPanelProps & {
  direction: 'left' | 'right';
  color: string;
  children: React.ReactNode;
};

function triggerSwipeCommitHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

function SwipeActionCapsule({
  progress,
  translation,
  releaseLocked,
  direction,
  color,
  children,
}: SwipeCapsuleProps) {
  const isLeft = direction === 'left';
  const frozenWidth = useSharedValue(-1);

  const getDragDistance = () => {
    'worklet';
    return isLeft ? Math.max(translation.value, 0) : Math.max(-translation.value, 0);
  };

  const getCapsuleWidth = (dragDistance: number) => {
    'worklet';
    return interpolate(
      dragDistance,
      [0, STRETCH_START_DISTANCE, COMMIT_DISTANCE, ACTION_LANE_WIDTH],
      [ACTION_CIRCLE_SIZE, ACTION_CIRCLE_SIZE, ACTION_STRETCHED_WIDTH, ACTION_MAX_WIDTH],
      Extrapolation.CLAMP
    );
  };

  useAnimatedReaction(
    () => {
      const dragDistance = isLeft
        ? Math.max(translation.value, 0)
        : Math.max(-translation.value, 0);
      return dragDistance >= COMMIT_DISTANCE;
    },
    (isCommitted, wasCommitted) => {
      if (isCommitted && !wasCommitted) {
        runOnJS(triggerSwipeCommitHaptic)();
      }
    },
    [isLeft]
  );

  useAnimatedReaction(
    () => ({
      dragDistance: getDragDistance(),
      releaseLocked: releaseLocked.value,
    }),
    ({ dragDistance, releaseLocked: isReleaseLocked }) => {
      if (!isReleaseLocked) {
        frozenWidth.value = -1;
        return;
      }

      if (frozenWidth.value < 0) {
        frozenWidth.value = getCapsuleWidth(dragDistance);
      }
    },
    [isLeft]
  );

  const capsuleStyle = useAnimatedStyle(() => {
    const dragDistance = getDragDistance();
    const width = frozenWidth.value >= 0 ? frozenWidth.value : getCapsuleWidth(dragDistance);
    const scaleY = interpolate(
      dragDistance,
      [0, STRETCH_START_DISTANCE, COMMIT_DISTANCE, ACTION_LANE_WIDTH],
      [1, 1, 1.035, 1.035],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(progress.value, [0, 0.18, 0.35], [0, 0.8, 1], Extrapolation.CLAMP);

    return {
      width,
      opacity,
      transform: [{ scaleY }],
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    const dragDistance = getDragDistance();
    const scaleX = interpolate(
      dragDistance,
      [0, STRETCH_START_DISTANCE, COMMIT_DISTANCE, ACTION_LANE_WIDTH],
      [1, 1, 1.15, 1.28],
      Extrapolation.CLAMP
    );
    const scaleY = interpolate(
      dragDistance,
      [0, STRETCH_START_DISTANCE, COMMIT_DISTANCE, ACTION_LANE_WIDTH],
      [1, 1, 0.9, 0.84],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ scaleX }, { scaleY }],
    };
  });

  return (
    <View style={[styles.actionPanel, isLeft ? styles.leftActionPanel : styles.rightActionPanel]}>
      <Animated.View style={[styles.actionCapsule, { backgroundColor: color }, capsuleStyle]}>
        <Animated.View style={iconStyle}>{children}</Animated.View>
      </Animated.View>
    </View>
  );
}

function AddActionPanel({ progress, translation, releaseLocked }: SwipeActionPanelProps) {
  const { colors } = useAppTheme();

  return (
    <SwipeActionCapsule
      progress={progress}
      translation={translation}
      releaseLocked={releaseLocked}
      direction="left"
      color={colors.statusSuccess}
    >
      <PlusIcon size={ACTION_ICON_SIZE} color={colors.overlayForeground} />
    </SwipeActionCapsule>
  );
}

function RemoveActionPanel({ progress, translation, releaseLocked }: SwipeActionPanelProps) {
  const { colors } = useAppTheme();

  return (
    <SwipeActionCapsule
      progress={progress}
      translation={translation}
      releaseLocked={releaseLocked}
      direction="right"
      color={colors.statusError}
    >
      <TrashIcon size={ACTION_ICON_SIZE} color={colors.overlayForeground} />
    </SwipeActionCapsule>
  );
}

function SubscriptionToggle({
  checked,
  disabled = false,
  onPress,
}: {
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <IconButton
      size="sm"
      variant="ghost"
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityLabel={checked ? 'Remove subscription' : 'Add subscription'}
      accessibilityState={{ checked, disabled }}
      accessibilityHint={checked ? 'Turns this subscription off.' : 'Turns this subscription on.'}
      style={styles.subscriptionToggle}
    >
      {checked ? (
        <CheckIcon size={ACTION_ICON_SIZE} color={colors.statusSuccess} />
      ) : (
        <CheckOutlineIcon size={ACTION_ICON_SIZE} color={colors.textTertiary} />
      )}
    </IconButton>
  );
}

export function SourceListRow({
  source,
  summary,
  needsAttention = false,
  attentionTestID,
  onPress,
}: {
  source: SubscriptionSource;
  summary: string;
  needsAttention?: boolean;
  attentionTestID?: string;
  onPress: () => void;
}) {
  const { colors, motion } = useAppTheme();
  const config = getSubscriptionSourceConfig(source);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${config.name} subscriptions${needsAttention ? ', needs attention' : ''}`}
      style={({ pressed }) => [pressed && { opacity: motion.opacity.pressed }]}
    >
      <Surface tone="elevated" border="subtle" radius="xl" style={styles.sourceRow}>
        <View style={[styles.glyphContainer, { backgroundColor: SOURCE_BRAND[source].bg }]}>
          <SourceGlyph source={source} />
        </View>
        <View style={styles.sourceRowCopy}>
          <Text variant="titleMedium">{config.name}</Text>
          <Text variant="bodySmall" tone="subheader">
            {summary}
          </Text>
        </View>
        <View style={styles.sourceRowTrailing}>
          {needsAttention ? (
            <View
              testID={attentionTestID}
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={[styles.attentionDot, { backgroundColor: colors.statusWarning }]}
            />
          ) : null}
          <ChevronRightIcon size={18} color={colors.textTertiary} />
        </View>
      </Surface>
    </Pressable>
  );
}

export function SourceHero({
  source,
  title,
  summary,
}: {
  source: SubscriptionSource;
  title?: string;
  summary: string;
}) {
  const config = getSubscriptionSourceConfig(source);

  return (
    <Surface tone="elevated" border="subtle" radius="xl" style={styles.hero}>
      <View style={[styles.heroGlyph, { backgroundColor: SOURCE_BRAND[source].bg }]}>
        <SourceGlyph source={source} />
      </View>
      <View style={styles.heroCopy}>
        <Text variant="labelSmallPlain" tone="tertiary" transform="uppercase">
          Subscriptions
        </Text>
        <Text variant="headlineSmall">{title ?? config.name}</Text>
        <Text variant="bodyMedium" tone="subheader">
          {summary}
        </Text>
      </View>
    </Surface>
  );
}

export function IntegrationCard({
  source,
  state,
  title,
  description,
  detail,
  actionLabel,
  onAction,
  actionTone = 'default',
  actionVariant = 'primary',
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionTone = 'danger',
  secondaryActionVariant = 'ghost',
  isBusy = false,
}: {
  source: SubscriptionSource;
  state: IntegrationState;
  title: string;
  description: string;
  detail?: string | null;
  actionLabel?: string | null;
  onAction?: (() => void) | null;
  actionTone?: 'default' | 'danger';
  actionVariant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  secondaryActionLabel?: string | null;
  onSecondaryAction?: (() => void) | null;
  secondaryActionTone?: 'default' | 'danger';
  secondaryActionVariant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  isBusy?: boolean;
}) {
  const config = getSubscriptionSourceConfig(source);

  return (
    <Surface tone="elevated" border="subtle" radius="xl" style={styles.sectionCard}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderCopy}>
          <Text variant="labelSmallPlain" tone="tertiary" transform="uppercase">
            {state === 'manual' ? 'Setup' : 'Integration'}
          </Text>
          <Text variant="titleLarge">
            {state === 'manual' ? 'No integration required' : config.integrationName}
          </Text>
        </View>
        <Badge label={getIntegrationBadgeLabel(state)} tone={getBadgeTone(state)} size="sm" />
      </View>

      <Text variant="titleMedium">{title}</Text>
      <Text variant="bodyMedium" tone="subheader" style={styles.sectionDescription}>
        {description}
      </Text>

      {detail ? (
        <Text variant="bodySmall" tone="tertiary" style={styles.sectionDetail}>
          {detail}
        </Text>
      ) : null}

      {(actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction) ? (
        <View style={styles.integrationActions}>
          {actionLabel && onAction ? (
            <Button
              label={actionLabel}
              onPress={onAction}
              loading={isBusy}
              variant={actionVariant}
              tone={actionTone}
              size="sm"
            />
          ) : null}
          {secondaryActionLabel && onSecondaryAction ? (
            <Button
              label={secondaryActionLabel}
              onPress={onSecondaryAction}
              disabled={isBusy}
              variant={secondaryActionVariant}
              tone={secondaryActionTone}
              size="sm"
            />
          ) : null}
        </View>
      ) : null}
    </Surface>
  );
}

export function SourceSectionHeader({
  eyebrow,
  title,
  summary,
  trailing,
}: {
  eyebrow?: string;
  title: string;
  summary?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderCopy}>
        {eyebrow ? (
          <Text variant="labelSmallPlain" tone="tertiary" transform="uppercase">
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="titleLarge">{title}</Text>
        {summary ? (
          <Text variant="bodySmall" tone="subheader">
            {summary}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

export function SourceSearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  const { colors } = useAppTheme();

  return (
    <Surface tone="subtle" border="default" radius="xl" style={styles.searchField}>
      <SearchIcon size={18} color={colors.textTertiary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        style={[styles.searchInput, { color: colors.textPrimary }]}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </Surface>
  );
}

export function SourceSubscriptionRow({
  source: _source,
  variant = 'card',
  title,
  subtitle,
  meta,
  imageUrl,
  statusLabel,
  toggleChecked,
  onToggle,
  toggleDisabled = false,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionVariant = 'secondary',
  primaryActionTone = 'default',
  primaryActionLoading = false,
  primaryActionDisabled = false,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionTone = 'danger',
  tertiaryActionLabel,
  onTertiaryAction,
  tertiaryActionTone = 'danger',
}: {
  source?: SubscriptionSource;
  variant?: 'card' | 'flat';
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  imageUrl?: string | null;
  statusLabel?: string | null;
  toggleChecked?: boolean;
  onToggle?: (() => void) | null;
  toggleDisabled?: boolean;
  primaryActionLabel?: string | null;
  onPrimaryAction?: (() => void) | null;
  primaryActionVariant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  primaryActionTone?: 'default' | 'danger';
  primaryActionLoading?: boolean;
  primaryActionDisabled?: boolean;
  secondaryActionLabel?: string | null;
  onSecondaryAction?: (() => void) | null;
  secondaryActionTone?: 'default' | 'danger';
  tertiaryActionLabel?: string | null;
  onTertiaryAction?: (() => void) | null;
  tertiaryActionTone?: 'default' | 'danger';
}) {
  const { colors } = useAppTheme();
  const Container = variant === 'flat' ? View : Surface;
  const containerProps =
    variant === 'flat' ? {} : ({ tone: 'elevated', border: 'subtle', radius: 'xl' } as const);

  return (
    <Container
      {...containerProps}
      style={[
        variant === 'flat' ? styles.flatSubscriptionRow : styles.subscriptionRow,
        variant === 'flat' ? { backgroundColor: colors.surfaceCanvas } : null,
      ]}
    >
      <Avatar imageUrl={imageUrl} title={title} />

      <View style={styles.subscriptionCopy}>
        <View style={styles.subscriptionTitleRow}>
          <Text variant="titleMedium" numberOfLines={1} style={styles.subscriptionTitle}>
            {title}
          </Text>
          {statusLabel ? (
            <Badge label={statusLabel} tone="subtle" size="sm" style={styles.statusBadge} />
          ) : null}
        </View>

        {subtitle ? (
          <Text variant="bodySmall" tone="subheader" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}

        {meta ? (
          <Text variant="bodySmall" tone="tertiary" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>

      {primaryActionLabel && onPrimaryAction ? (
        <View style={styles.rowActions}>
          <Button
            label={primaryActionLabel}
            onPress={onPrimaryAction}
            variant={primaryActionVariant}
            tone={primaryActionTone}
            size="sm"
            loading={primaryActionLoading}
            disabled={primaryActionDisabled}
          />
          {secondaryActionLabel && onSecondaryAction ? (
            <Button
              label={secondaryActionLabel}
              onPress={onSecondaryAction}
              variant="ghost"
              tone={secondaryActionTone}
              size="sm"
              labelStyle={{
                color: secondaryActionTone === 'danger' ? colors.statusError : colors.textSecondary,
              }}
            />
          ) : null}
          {tertiaryActionLabel && onTertiaryAction ? (
            <Button
              label={tertiaryActionLabel}
              onPress={onTertiaryAction}
              variant="ghost"
              tone={tertiaryActionTone}
              size="sm"
              labelStyle={{
                color: tertiaryActionTone === 'danger' ? colors.statusError : colors.textSecondary,
              }}
            />
          ) : null}
        </View>
      ) : null}
      {typeof toggleChecked === 'boolean' && onToggle ? (
        <SubscriptionToggle checked={toggleChecked} disabled={toggleDisabled} onPress={onToggle} />
      ) : null}
      {variant === 'flat' ? (
        <View style={[styles.flatRowSeparator, { backgroundColor: colors.borderDefault }]} />
      ) : null}
    </Container>
  );
}

export function SwipeableSourceSubscriptionRow({
  title,
  imageUrl,
  isSubscribed,
  isProcessing = false,
  onAdd,
  onRemove,
}: {
  title: string;
  imageUrl?: string | null;
  isSubscribed: boolean;
  isProcessing?: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const releaseLocked = useSharedValue(false);
  const { colors } = useAppTheme();

  const executeAction = useCallback(
    (direction: 'left' | 'right') => {
      if (
        isProcessing ||
        (direction === 'right' && isSubscribed) ||
        (direction === 'left' && !isSubscribed)
      ) {
        swipeableRef.current?.close();
        return;
      }

      if (direction === 'right') {
        onAdd();
      } else {
        onRemove();
      }

      swipeableRef.current?.close();
    },
    [isProcessing, isSubscribed, onAdd, onRemove]
  );

  const renderLeftActions = (progress: SharedValue<number>, translation: SharedValue<number>) => (
    <AddActionPanel progress={progress} translation={translation} releaseLocked={releaseLocked} />
  );

  const renderRightActions = (progress: SharedValue<number>, translation: SharedValue<number>) => (
    <RemoveActionPanel
      progress={progress}
      translation={translation}
      releaseLocked={releaseLocked}
    />
  );

  const handleSwipeableWillOpen = useCallback(() => {
    releaseLocked.value = true;
  }, [releaseLocked]);

  const handleSwipeableWillClose = useCallback(() => {
    releaseLocked.value = false;
  }, [releaseLocked]);

  const handleSwipeableOpen = useCallback(
    (direction: 'left' | 'right') => {
      executeAction(direction);
    },
    [executeAction]
  );

  const handleToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    executeAction(isSubscribed ? 'left' : 'right');
  }, [executeAction, isSubscribed]);

  return (
    <Animated.View accessible={false}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        friction={SWIPE_FRICTION}
        leftThreshold={SWIPE_THRESHOLD}
        rightThreshold={SWIPE_THRESHOLD}
        overshootLeft={true}
        overshootRight={true}
        overshootFriction={OVERSHOOT_FRICTION}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        onSwipeableWillOpen={handleSwipeableWillOpen}
        onSwipeableWillClose={handleSwipeableWillClose}
        onSwipeableOpen={handleSwipeableOpen}
        containerStyle={styles.swipeableContainer}
        childrenContainerStyle={{ backgroundColor: colors.surfaceCanvas }}
      >
        <SourceSubscriptionRow
          variant="flat"
          title={title}
          imageUrl={imageUrl}
          toggleChecked={isSubscribed}
          toggleDisabled={isProcessing}
          onToggle={handleToggle}
        />
      </ReanimatedSwipeable>
    </Animated.View>
  );
}

export function SourceEmptyState({ title, message }: { title: string; message: string }) {
  return (
    <Surface tone="subtle" border="subtle" radius="xl" style={styles.emptyState}>
      <Text variant="titleLarge" style={styles.emptyTitle}>
        {title}
      </Text>
      <Text variant="bodyMedium" tone="subheader" style={styles.emptyMessage}>
        {message}
      </Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  glyphContainer: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceRowCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  sourceRowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  attentionDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    padding: Spacing.lg,
  },
  heroGlyph: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  sectionCard: {
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  sectionDescription: {
    marginTop: Spacing.xs,
  },
  sectionDetail: {
    marginTop: Spacing.xs,
  },
  integrationActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    marginTop: Spacing.sm,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
  },
  subscriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  flatSubscriptionRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  subscriptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  subscriptionTitle: {
    flex: 1,
  },
  statusBadge: {
    maxWidth: 150,
  },
  subscriptionToggle: {
    flexShrink: 0,
  },
  rowActions: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  flatRowSeparator: {
    position: 'absolute',
    left: 80,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  swipeableContainer: {
    minHeight: 76,
  },
  actionPanel: {
    width: ACTION_LANE_WIDTH,
    flex: 1,
    justifyContent: 'center',
    overflow: 'visible',
  },
  leftActionPanel: {
    alignItems: 'flex-start',
    paddingLeft: Spacing.sm,
  },
  rightActionPanel: {
    alignItems: 'flex-end',
    paddingRight: Spacing.sm,
  },
  actionCapsule: {
    height: ACTION_CIRCLE_SIZE,
    minWidth: ACTION_CIRCLE_SIZE,
    borderRadius: ACTION_CIRCLE_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  emptyMessage: {
    textAlign: 'center',
  },
});
