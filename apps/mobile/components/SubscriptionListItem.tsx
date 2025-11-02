import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { memo } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTheme } from '../contexts/theme';
import type { DiscoveredSubscription } from '../lib/api';

interface SubscriptionListItemProps {
  subscription: DiscoveredSubscription;
  onToggle: (externalId: string) => void;
}

export const SubscriptionListItem = memo(function SubscriptionListItem({ subscription, onToggle }: SubscriptionListItemProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.container, { borderBottomColor: colors.border }]}
      onPress={() => onToggle(subscription.externalId)}
      activeOpacity={0.6}
    >
      <View style={[
        styles.checkbox, 
        { borderColor: colors.border },
        subscription.isUserSubscribed && { backgroundColor: colors.primary, borderColor: colors.primary }
      ]}>
        {subscription.isUserSubscribed && (
          <FontAwesome name="check" size={14} color="#ffffff" />
        )}
      </View>
      
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {subscription.title}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.creator, { color: colors.mutedForeground }]} numberOfLines={1}>
            {subscription.creatorName}
          </Text>
          {subscription.totalEpisodes && (
            <>
              <Text style={[styles.divider, { color: colors.mutedForeground }]}>•</Text>
              <Text style={[styles.episodes, { color: colors.mutedForeground }]}>
                {subscription.totalEpisodes} episodes
              </Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}, (prevProps, nextProps) => {
  // Only re-render if the subscription state or externalId changed
  return prevProps.subscription.externalId === nextProps.subscription.externalId &&
         prevProps.subscription.isUserSubscribed === nextProps.subscription.isUserSubscribed;
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creator: {
    fontSize: 14,
    flex: 1,
  },
  divider: {
    fontSize: 14,
  },
  episodes: {
    fontSize: 14,
  },
});
