/**
 * FeaturedCard Component
 *
 * Hero card with gradient background for featured content.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { ArticleIcon, SparklesIcon } from '@/components/icons';
import type { Colors } from '@/constants/theme';
import { Typography, Spacing, Radius, Shadows } from '@/constants/theme';

const HERO_CARD_HEIGHT = 200;

export interface FeaturedContentItem {
  id: string;
  title: string;
  subtitle?: string;
  source: string;
  gradient?: [string, string];
}

export interface FeaturedCardProps {
  item: FeaturedContentItem;
  colors: typeof Colors.light;
  onPress?: () => void;
}

export function FeaturedCard({ item, colors, onPress }: FeaturedCardProps) {
  return (
    <Animated.View>
      <Pressable style={styles.featuredCard} onPress={onPress}>
        <LinearGradient
          colors={item.gradient || [colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.featuredGradient}
        >
          <View style={styles.featuredContent}>
            <View style={styles.featuredBadge}>
              <SparklesIcon size={14} color="#fff" />
              <Text style={styles.featuredBadgeText}>Featured</Text>
            </View>
            <View style={styles.featuredTextContainer}>
              <Text style={styles.featuredTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.subtitle && (
                <Text style={styles.featuredSubtitle} numberOfLines={2}>
                  {item.subtitle}
                </Text>
              )}
            </View>
            <View style={styles.featuredFooter}>
              <View style={styles.featuredSource}>
                <ArticleIcon size={16} color="rgba(255,255,255,0.8)" />
                <Text style={styles.featuredSourceText}>{item.source}</Text>
              </View>
              <View style={styles.readButton}>
                <Text style={styles.readButtonText}>Read now</Text>
              </View>
            </View>
          </View>
          {/* Decorative elements */}
          <View style={styles.featuredDecoration}>
            <View style={[styles.decorCircle, styles.decorCircle1]} />
            <View style={[styles.decorCircle, styles.decorCircle2]} />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  featuredCard: {
    marginHorizontal: Spacing.xl,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    ...Shadows.lg,
  },
  featuredGradient: {
    height: HERO_CARD_HEIGHT,
    padding: Spacing.xl,
    position: 'relative',
    overflow: 'hidden',
  },
  featuredContent: {
    flex: 1,
    justifyContent: 'space-between',
    zIndex: 1,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    gap: Spacing.xs,
  },
  featuredBadgeText: {
    ...Typography.labelSmall,
    color: '#fff',
    textTransform: 'none',
    letterSpacing: 0,
  },
  featuredTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  featuredTitle: {
    ...Typography.headlineMedium,
    color: '#fff',
    marginBottom: Spacing.xs,
  },
  featuredSubtitle: {
    ...Typography.bodyMedium,
    color: 'rgba(255,255,255,0.8)',
  },
  featuredFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  featuredSource: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  featuredSourceText: {
    ...Typography.labelMedium,
    color: 'rgba(255,255,255,0.8)',
  },
  readButton: {
    backgroundColor: '#fff',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  readButtonText: {
    ...Typography.labelMedium,
    color: '#6366F1',
  },
  featuredDecoration: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 200,
  },
  decorCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  decorCircle1: {
    width: 150,
    height: 150,
    top: -30,
    right: -30,
  },
  decorCircle2: {
    width: 100,
    height: 100,
    bottom: -20,
    right: 40,
  },
});
