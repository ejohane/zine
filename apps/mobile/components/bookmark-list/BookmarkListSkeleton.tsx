import React, { useRef, useEffect } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/theme';
import { CARD_STYLES, BORDER_RADIUS, SPACING } from './constants';
import type { BookmarkListSkeletonProps } from './types';

function SkeletonItem({ variant }: { variant: 'compact' | 'comfortable' | 'media-rich' }) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  const variantStyles = CARD_STYLES[variant];

  if (variant === 'compact') {
    return (
      <View style={[styles.compactCard, { backgroundColor: colors.card }]}>
        <Animated.View
          style={[
            styles.compactThumbnail,
            {
              backgroundColor: colors.secondary,
              opacity,
            },
          ]}
        />
        <View style={styles.compactInfo}>
          <Animated.View
            style={[
              styles.compactTitleLine1,
              {
                backgroundColor: colors.secondary,
                opacity,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.compactTitleLine2,
              {
                backgroundColor: colors.secondary,
                opacity,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.compactMetadata,
              {
                backgroundColor: colors.secondary,
                opacity,
              },
            ]}
          />
        </View>
      </View>
    );
  }

  return null;
}

export function BookmarkListSkeleton({
  variant = 'compact',
  layout = 'vertical',
  count = 5,
}: BookmarkListSkeletonProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={layout === 'vertical' ? styles.verticalItem : styles.horizontalItem}>
          <SkeletonItem variant={variant} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  verticalItem: {
    marginBottom: SPACING.sm,
  },
  horizontalItem: {
    marginRight: SPACING.md,
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    height: CARD_STYLES.compact.height,
    padding: CARD_STYLES.compact.padding,
    borderRadius: BORDER_RADIUS.large,
    gap: CARD_STYLES.compact.gap,
  },
  compactThumbnail: {
    width: CARD_STYLES.compact.thumbnailSize,
    height: CARD_STYLES.compact.thumbnailSize,
    borderRadius: CARD_STYLES.compact.thumbnailRadius,
  },
  compactInfo: {
    flex: 1,
    gap: SPACING.xs,
  },
  compactTitleLine1: {
    height: 16,
    borderRadius: BORDER_RADIUS.small,
    width: '90%',
  },
  compactTitleLine2: {
    height: 16,
    borderRadius: BORDER_RADIUS.small,
    width: '75%',
  },
  compactMetadata: {
    height: 12,
    borderRadius: BORDER_RADIUS.small,
    width: 100,
    marginTop: SPACING.xs,
  },
});
