/**
 * CreatorHeader Component
 *
 * Displays creator profile information below the parallax header.
 * Shows provider badge, name, handle, description, and subscription actions.
 * The creator image is displayed in the parallax header of the parent screen.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';

import { SourceBadge } from '@/components/badges';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { type Creator, useCreatorSubscription } from '@/hooks/use-creator';
import { useRssFeedDiscovery, type DiscoveredRssCandidate } from '@/hooks/use-rss-feed-discovery';
import { analytics } from '@/lib/analytics';

// ============================================================================
// Types
// ============================================================================

export interface CreatorHeaderProps {
  /** Creator data to display */
  creator: Creator;
  /** Best-known source URL for RSS autodiscovery (for WEB/RSS/SUBSTACK creators) */
  sourceUrlForDiscovery?: string | null;
  /** Optional override for deterministic tests/stories */
  subscriptionStateOverride?: {
    isSubscribed: boolean;
    canSubscribe: boolean;
    isSubscribing: boolean;
    reason?: string;
    error?: Error | null;
    subscribe?: () => void;
  };
}

// ============================================================================
// Constants
// ============================================================================

const OAUTH_SUBSCRIBABLE_PROVIDERS = new Set(['YOUTUBE', 'SPOTIFY', 'GMAIL']);
const RSS_DISCOVERY_PROVIDERS = new Set(['RSS', 'WEB', 'SUBSTACK']);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats the handle for display (ensures @ prefix)
 */
function formatHandle(handle: string | null): string | null {
  if (!handle) return null;
  return handle.startsWith('@') ? handle : `@${handle}`;
}

type CandidateSubscriptionStatus = NonNullable<DiscoveredRssCandidate['subscription']>['status'];

function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function getHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function toStatusLabel(status: CandidateSubscriptionStatus): string | null {
  switch (status) {
    case 'ACTIVE':
      return 'Subscribed';
    case 'PAUSED':
      return 'Paused';
    case 'ERROR':
      return 'Needs attention';
    case 'UNSUBSCRIBED':
      return 'Unsubscribed';
    default:
      return null;
  }
}

function getProviderName(provider: string): string {
  switch (provider) {
    case 'YOUTUBE':
      return 'YouTube';
    case 'SPOTIFY':
      return 'Spotify';
    case 'GMAIL':
      return 'Newsletters';
    case 'RSS':
      return 'RSS';
    case 'SUBSTACK':
      return 'Substack';
    case 'WEB':
      return 'Web';
    default:
      return provider;
  }
}

function getManageRoute(provider: string): Href | null {
  if (provider === 'YOUTUBE' || provider === 'SPOTIFY' || provider === 'GMAIL') {
    return `/subscriptions/${provider.toLowerCase()}` as Href;
  }
  if (provider === 'RSS' || provider === 'WEB' || provider === 'SUBSTACK') {
    return '/subscriptions/rss' as Href;
  }
  return null;
}

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
export function CreatorHeader({
  creator,
  sourceUrlForDiscovery,
  subscriptionStateOverride,
}: CreatorHeaderProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const router = useRouter();

  const subscriptionState = useCreatorSubscription(creator.id);
  const isSubscribed = subscriptionStateOverride?.isSubscribed ?? subscriptionState.isSubscribed;
  const canSubscribe = subscriptionStateOverride?.canSubscribe ?? subscriptionState.canSubscribe;
  const subscribe = subscriptionStateOverride?.subscribe ?? subscriptionState.subscribe;
  const isSubscribing = subscriptionStateOverride?.isSubscribing ?? subscriptionState.isSubscribing;
  const reason = subscriptionStateOverride?.reason ?? subscriptionState.reason;
  const error = subscriptionStateOverride?.error ?? subscriptionState.error;

  const [pendingFeedUrl, setPendingFeedUrl] = useState<string | null>(null);

  const isOAuthSubscriptionProvider = OAUTH_SUBSCRIBABLE_PROVIDERS.has(creator.provider);
  const isRssDiscoveryProvider = RSS_DISCOVERY_PROVIDERS.has(creator.provider);
  const discoveryUrl = sourceUrlForDiscovery?.trim() ?? '';

  const {
    sourceOrigin,
    candidates,
    isDiscovering,
    discoveryError,
    isSubscribing: isRssSubscribing,
    subscribeToFeed,
    refetchDiscovery,
  } = useRssFeedDiscovery(discoveryUrl, isRssDiscoveryProvider && isHttpUrl(discoveryUrl));

  const sourceHost = useMemo(
    () => getHost(sourceOrigin) ?? getHost(discoveryUrl) ?? null,
    [sourceOrigin, discoveryUrl]
  );

  const manageRoute = useMemo(() => getManageRoute(creator.provider), [creator.provider]);
  const providerName = getProviderName(creator.provider);

  // Track connect prompt shown in header once
  const hasTrackedConnectPrompt = useRef(false);
  useEffect(() => {
    if (
      isOAuthSubscriptionProvider &&
      reason === 'NOT_CONNECTED' &&
      !hasTrackedConnectPrompt.current
    ) {
      hasTrackedConnectPrompt.current = true;
      analytics.track('creator_connect_prompt_shown', {
        creatorId: creator.id,
        provider: creator.provider,
        reason: 'NOT_CONNECTED',
      });
    }
  }, [reason, creator.id, creator.provider, isOAuthSubscriptionProvider]);

  const handleCreatorSubscribe = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Track subscribe tap immediately
    analytics.track('creator_subscribe_tapped', {
      creatorId: creator.id,
      provider: creator.provider,
      success: true, // Will be updated if there's an error
    });

    subscribe();
  };

  const handleManagePress = () => {
    if (!manageRoute) {
      return;
    }
    router.push(manageRoute);
  };

  const handleRssSubscribe = async (candidate: DiscoveredRssCandidate) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    analytics.track('creator_subscribe_tapped', {
      creatorId: creator.id,
      provider: creator.provider,
      success: true,
    });

    setPendingFeedUrl(candidate.feedUrl);
    subscribeToFeed(
      {
        feedUrl: candidate.feedUrl,
        seedMode: 'none',
      },
      {
        onSuccess: async () => {
          setPendingFeedUrl(null);
          await refetchDiscovery();
          Alert.alert('Source subscribed', 'This source is now in your RSS subscriptions.');
        },
        onError: (subscribeError) => {
          setPendingFeedUrl(null);
          const message =
            subscribeError instanceof Error ? subscribeError.message : 'Unable to subscribe.';
          analytics.track('creator_subscribe_tapped', {
            creatorId: creator.id,
            provider: creator.provider,
            success: false,
            errorReason: message,
          });
          Alert.alert('Subscription failed', message);
        },
      }
    );
  };

  // Track subscribe error if it occurs
  const hasTrackedError = useRef(false);
  useEffect(() => {
    if (isOAuthSubscriptionProvider && error && !hasTrackedError.current) {
      hasTrackedError.current = true;
      analytics.track('creator_subscribe_tapped', {
        creatorId: creator.id,
        provider: creator.provider,
        success: false,
        errorReason: error.message,
      });
    }
  }, [error, creator.id, creator.provider, isOAuthSubscriptionProvider]);

  const showSubscriptionCard = isOAuthSubscriptionProvider || isRssDiscoveryProvider;
  const handle = formatHandle(creator.handle);
  const isNotConnected = reason === 'NOT_CONNECTED';
  const isSourceMissing = reason === 'SOURCE_NOT_FOUND';

  return (
    <View style={styles.container}>
      {/* Provider Badge */}
      <View style={styles.badgeContainer}>
        <SourceBadge provider={creator.provider} />
      </View>

      {/* Creator Name */}
      <Text style={[styles.name, { color: colors.text }]}>{creator.name}</Text>

      {/* Handle (e.g., @waveform) */}
      {handle && <Text style={[styles.handle, { color: colors.textSecondary }]}>{handle}</Text>}

      {/* Description */}
      {creator.description && (
        <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={4}>
          {creator.description}
        </Text>
      )}

      {showSubscriptionCard && (
        <View
          style={[
            styles.subscriptionCard,
            {
              borderColor: colors.border,
              backgroundColor: colors.backgroundSecondary,
            },
          ]}
        >
          <Text style={[styles.subscriptionLabel, { color: colors.textTertiary }]}>
            Source subscription
          </Text>

          {isOAuthSubscriptionProvider && (
            <View style={[styles.subscriptionRow, { borderColor: colors.border }]}>
              <View style={styles.subscriptionRowCopy}>
                <Text style={[styles.subscriptionTitle, { color: colors.text }]} numberOfLines={1}>
                  {creator.name}
                </Text>
                <Text style={[styles.subscriptionSubtitle, { color: colors.textSecondary }]}>
                  {reason === 'NOT_CONNECTED'
                    ? `Connect ${providerName} to subscribe`
                    : reason === 'SOURCE_NOT_FOUND'
                      ? 'Source not found in your account'
                      : `Follow via ${providerName}`}
                </Text>
                {isSubscribed ? (
                  <Text style={[styles.subscriptionStatus, { color: colors.textTertiary }]}>
                    Subscribed
                  </Text>
                ) : null}
              </View>

              <Pressable
                onPress={() => {
                  if (isNotConnected || isSourceMissing) {
                    handleManagePress();
                    return;
                  }
                  if (isSubscribed) {
                    handleManagePress();
                    return;
                  }
                  handleCreatorSubscribe();
                }}
                disabled={
                  isSubscribing ||
                  (isSourceMissing && !manageRoute) ||
                  (!canSubscribe && !isNotConnected && !isSourceMissing)
                }
                accessibilityRole="button"
                accessibilityLabel={
                  isNotConnected
                    ? `Connect ${providerName}`
                    : isSubscribed || isSourceMissing
                      ? `Manage ${providerName} subscription`
                      : `Subscribe to ${creator.name}`
                }
                style={({ pressed }) => [
                  styles.subscriptionButton,
                  {
                    backgroundColor:
                      isNotConnected || isSubscribed || isSourceMissing
                        ? colors.backgroundTertiary
                        : colors.buttonPrimary,
                  },
                  pressed && { opacity: 0.85 },
                  isSubscribing && { opacity: 0.5 },
                ]}
              >
                {isSubscribing ? (
                  <ActivityIndicator
                    size="small"
                    color={
                      isNotConnected || isSubscribed || isSourceMissing
                        ? colors.text
                        : colors.buttonPrimaryText
                    }
                  />
                ) : (
                  <Text
                    style={[
                      styles.subscriptionButtonLabel,
                      {
                        color:
                          isNotConnected || isSubscribed || isSourceMissing
                            ? colors.text
                            : colors.buttonPrimaryText,
                      },
                    ]}
                  >
                    {isNotConnected
                      ? 'Connect'
                      : isSubscribed || isSourceMissing
                        ? 'Manage'
                        : 'Subscribe'}
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          {isRssDiscoveryProvider && (
            <>
              {isDiscovering && candidates.length === 0 ? (
                <View style={styles.subscriptionLoadingRow}>
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                  <Text style={[styles.subscriptionHint, { color: colors.textSecondary }]}>
                    {`Checking ${sourceHost ?? 'this source'} for RSS feeds...`}
                  </Text>
                </View>
              ) : null}

              {!isDiscovering && !isHttpUrl(discoveryUrl) ? (
                <Text style={[styles.subscriptionHint, { color: colors.textSecondary }]}>
                  Save content from this creator to discover an RSS feed.
                </Text>
              ) : null}

              {!isDiscovering && discoveryError && candidates.length === 0 ? (
                <>
                  <Text style={[styles.subscriptionHint, { color: colors.textSecondary }]}>
                    {`Couldn't check ${sourceHost ?? 'this source'} for RSS feeds.`}
                  </Text>
                  <Pressable
                    onPress={() => refetchDiscovery()}
                    accessibilityRole="button"
                    accessibilityLabel="Retry RSS feed discovery"
                    style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.8 }]}
                  >
                    <Text style={[styles.textButtonLabel, { color: colors.link }]}>Retry</Text>
                  </Pressable>
                </>
              ) : null}

              {!isDiscovering &&
              !discoveryError &&
              isHttpUrl(discoveryUrl) &&
              candidates.length === 0 ? (
                <Text style={[styles.subscriptionHint, { color: colors.textSecondary }]}>
                  {`No RSS feed detected for ${sourceHost ?? 'this source'} yet.`}
                </Text>
              ) : null}

              {candidates.map((candidate) => {
                const subscriptionStatus = candidate.subscription?.status ?? null;
                const isCandidateSubscribed =
                  subscriptionStatus !== null && subscriptionStatus !== 'UNSUBSCRIBED';
                const busy = isRssSubscribing && pendingFeedUrl === candidate.feedUrl;
                const actionDisabled = busy || (!isCandidateSubscribed && isRssSubscribing);
                const candidateLabel =
                  candidate.title ?? getHost(candidate.siteUrl) ?? sourceHost ?? 'RSS feed';
                const statusLabel = subscriptionStatus ? toStatusLabel(subscriptionStatus) : null;

                return (
                  <View
                    key={candidate.feedUrl}
                    style={[styles.subscriptionRow, { borderColor: colors.border }]}
                  >
                    <View style={styles.subscriptionRowCopy}>
                      <Text
                        style={[styles.subscriptionTitle, { color: colors.text }]}
                        numberOfLines={1}
                      >
                        {candidateLabel}
                      </Text>
                      <Text
                        style={[styles.subscriptionSubtitle, { color: colors.textSecondary }]}
                        numberOfLines={1}
                      >
                        {candidate.feedUrl}
                      </Text>
                      {statusLabel ? (
                        <Text style={[styles.subscriptionStatus, { color: colors.textTertiary }]}>
                          {statusLabel}
                        </Text>
                      ) : null}
                    </View>

                    <Pressable
                      onPress={() =>
                        isCandidateSubscribed ? handleManagePress() : handleRssSubscribe(candidate)
                      }
                      disabled={actionDisabled}
                      accessibilityRole="button"
                      accessibilityLabel={
                        isCandidateSubscribed
                          ? `Manage subscription for ${candidateLabel}`
                          : `Subscribe to ${candidateLabel}`
                      }
                      style={({ pressed }) => [
                        styles.subscriptionButton,
                        {
                          backgroundColor: isCandidateSubscribed
                            ? colors.backgroundTertiary
                            : colors.buttonPrimary,
                        },
                        pressed && { opacity: 0.85 },
                        actionDisabled && { opacity: 0.5 },
                      ]}
                    >
                      {busy ? (
                        <ActivityIndicator
                          size="small"
                          color={isCandidateSubscribed ? colors.text : colors.buttonPrimaryText}
                        />
                      ) : (
                        <Text
                          style={[
                            styles.subscriptionButtonLabel,
                            {
                              color: isCandidateSubscribed ? colors.text : colors.buttonPrimaryText,
                            },
                          ]}
                        >
                          {isCandidateSubscribed ? 'Manage' : 'Subscribe'}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </>
          )}

          {showSubscriptionCard && (
            <View style={styles.subscriptionFooter}>
              <Ionicons name="newspaper-outline" size={16} color={colors.textTertiary} />
              <Text style={[styles.subscriptionFooterText, { color: colors.textTertiary }]}>
                Subscribe at the source level.
              </Text>
            </View>
          )}
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  badgeContainer: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.md,
  },
  name: {
    ...Typography.headlineLarge,
    fontWeight: '700',
  },
  handle: {
    ...Typography.bodyMedium,
    marginTop: Spacing.xs,
  },
  description: {
    ...Typography.bodyMedium,
    marginTop: Spacing.md,
    lineHeight: 22,
  },
  subscriptionCard: {
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  subscriptionLabel: {
    ...Typography.labelSmall,
  },
  subscriptionHint: {
    ...Typography.bodySmall,
  },
  subscriptionLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  subscriptionRow: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  subscriptionRowCopy: {
    flex: 1,
    gap: 2,
  },
  subscriptionTitle: {
    ...Typography.labelLarge,
    fontWeight: '600',
  },
  subscriptionSubtitle: {
    ...Typography.bodySmall,
  },
  subscriptionStatus: {
    ...Typography.bodySmall,
  },
  subscriptionButton: {
    minWidth: 84,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionButtonLabel: {
    ...Typography.labelMedium,
    fontWeight: '700',
  },
  textButton: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.xs,
  },
  textButtonLabel: {
    ...Typography.labelMedium,
    fontWeight: '600',
  },
  subscriptionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  subscriptionFooterText: {
    ...Typography.bodySmall,
  },
});
