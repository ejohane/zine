/**
 * CreatorHeader Component
 *
 * Displays creator profile information at the top of the Creator View screen.
 * Shows creator image (or fallback), name, provider badge, and subscribe button.
 */

import * as Haptics from 'expo-haptics';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';

import { SourceBadge } from '@/components/badges';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { type Creator, useCreatorSubscription } from '@/hooks/use-creator';

// ============================================================================
// Types
// ============================================================================

export interface CreatorHeaderProps {
  /** Creator data to display */
  creator: Creator;
}

// ============================================================================
// Constants
// ============================================================================

/** Providers that support subscription via the app */
const SUBSCRIBABLE_PROVIDERS = ['YOUTUBE', 'SPOTIFY'];

// ============================================================================
// Component
// ============================================================================

/**
 * CreatorHeader displays the creator's profile information with subscribe functionality.
 *
 * @example
 * ```tsx
 * <CreatorHeader creator={creator} />
 * ```
 */
export function CreatorHeader({ creator }: CreatorHeaderProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  const { isSubscribed, canSubscribe, subscribe, isSubscribing, reason } = useCreatorSubscription(
    creator.id
  );

  const handleSubscribe = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    subscribe();
  };

  const showSubscribeButton = SUBSCRIBABLE_PROVIDERS.includes(creator.provider) && !isSubscribed;

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      {/* Creator Image */}
      <View style={styles.imageContainer}>
        {creator.imageUrl ? (
          <Image
            source={{ uri: creator.imageUrl }}
            style={styles.image}
            accessibilityLabel={`${creator.name} profile image`}
          />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.imagePlaceholderText, { color: colors.textTertiary }]}>
              {creator.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      {/* Creator Name */}
      <Text style={[styles.name, { color: colors.text }]}>{creator.name}</Text>

      {/* Provider Badge */}
      <View style={styles.badgeContainer}>
        <SourceBadge provider={creator.provider} />
      </View>

      {/* Subscribe Button */}
      {showSubscribeButton && (
        <View style={styles.subscribeContainer}>
          {canSubscribe ? (
            <Pressable
              onPress={handleSubscribe}
              disabled={isSubscribing}
              style={({ pressed }) => [
                styles.subscribeButton,
                {
                  backgroundColor: colors.buttonPrimary,
                  opacity: isSubscribing ? 0.7 : pressed ? 0.9 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={isSubscribing ? 'Subscribing' : 'Subscribe to creator'}
              accessibilityState={{ disabled: isSubscribing }}
            >
              <Text style={[styles.subscribeButtonText, { color: colors.buttonPrimaryText }]}>
                {isSubscribing ? 'Subscribing...' : 'Subscribe'}
              </Text>
            </Pressable>
          ) : reason === 'NOT_CONNECTED' ? (
            <View style={[styles.connectPrompt, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.connectPromptText, { color: colors.textSecondary }]}>
                Connect {creator.provider} to subscribe
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Already Subscribed Indicator */}
      {isSubscribed && (
        <View style={styles.subscribedContainer}>
          <Text style={[styles.subscribedText, { color: colors.textSecondary }]}>✓ Subscribed</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  imageContainer: {
    marginBottom: Spacing.lg,
  },
  image: {
    width: 80,
    height: 80,
    borderRadius: Radius.full,
  },
  imagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontSize: 28,
    fontWeight: '700',
  },
  name: {
    ...Typography.headlineSmall,
    textAlign: 'center',
  },
  badgeContainer: {
    marginTop: Spacing.sm,
  },
  subscribeContainer: {
    marginTop: Spacing.lg,
    width: '100%',
    alignItems: 'center',
  },
  subscribeButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  subscribeButtonText: {
    ...Typography.labelLarge,
    fontWeight: '600',
  },
  connectPrompt: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  connectPromptText: {
    ...Typography.bodySmall,
  },
  subscribedContainer: {
    marginTop: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  subscribedText: {
    ...Typography.bodySmall,
  },
});
