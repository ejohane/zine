import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/theme';
import { useAccounts } from '../../../hooks/useAccounts';
import { useDiscoverSubscriptions, useBatchedSubscriptionUpdates } from '../../../hooks/useSubscriptions';
import { DiscoveredSubscription } from '../../../lib/api';
import { ConnectionStatusCard } from '../../../components/ConnectionStatusCard';
import { SubscriptionListItem } from '../../../components/SubscriptionListItem';

export default function SubscriptionManagementScreen() {
  const { provider } = useLocalSearchParams<{ provider: 'spotify' | 'youtube' }>();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { isSpotifyConnected, isYouTubeConnected, connect, disconnect } = useAccounts();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [localSubscriptions, setLocalSubscriptions] = useState<DiscoveredSubscription[]>([]);
  
  const isConnected = provider === 'spotify' ? isSpotifyConnected : isYouTubeConnected;
  const providerName = provider === 'spotify' ? 'Spotify' : 'YouTube';
  
  // Auto-fetch subscriptions when connected
  const { data: discoveryData, isFetching: isDiscovering, isError } = useDiscoverSubscriptions(provider, isConnected);
  const { scheduleBatchUpdate, isBatching, hasPendingUpdates } = useBatchedSubscriptionUpdates(
    provider,
    undefined, // onBatchStart
    undefined, // onBatchComplete
    useCallback((previousState: DiscoveredSubscription[]) => {
      // Rollback to previous state on error
      setLocalSubscriptions(previousState);
    }, [])
  );
  
  useMemo(() => {
    if (discoveryData?.subscriptions) {
      setLocalSubscriptions(discoveryData.subscriptions);
    }
  }, [discoveryData]);
  
  const filteredSubscriptions = useMemo(() => {
    if (!searchQuery.trim()) return localSubscriptions;
    
    const query = searchQuery.toLowerCase();
    return localSubscriptions.filter(sub => 
      sub.title.toLowerCase().includes(query) ||
      sub.creatorName.toLowerCase().includes(query)
    );
  }, [localSubscriptions, searchQuery]);
  
  const toggleSubscription = useCallback((externalId: string) => {
    // Optimistically update UI immediately - no delays
    setLocalSubscriptions(prev => {
      const updated = prev.map(sub => 
        sub.externalId === externalId 
          ? { ...sub, isUserSubscribed: !sub.isUserSubscribed }
          : sub
      );
      // Schedule batched API call asynchronously (doesn't block UI)
      // Pass previous state for rollback on error
      scheduleBatchUpdate(updated, prev);
      return updated;
    });
  }, [scheduleBatchUpdate]);
  
  const handleSelectAll = useCallback(() => {
    setLocalSubscriptions(prev => {
      const updated = prev.map(sub => ({ ...sub, isUserSubscribed: true }));
      scheduleBatchUpdate(updated, prev);
      return updated;
    });
  }, [scheduleBatchUpdate]);
  
  const handleDeselectAll = useCallback(() => {
    setLocalSubscriptions(prev => {
      const updated = prev.map(sub => ({ ...sub, isUserSubscribed: false }));
      scheduleBatchUpdate(updated, prev);
      return updated;
    });
  }, [scheduleBatchUpdate]);
  
  const handleConnect = () => {
    connect({ provider });
  };
  
  const handleDisconnect = () => {
    Alert.alert(
      `Disconnect ${providerName}`,
      `Are you sure you want to disconnect your ${providerName} account?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await disconnect(provider);
            router.back();
          }
        }
      ]
    );
  };
  
  const subscribedCount = localSubscriptions.filter(sub => sub.isUserSubscribed).length;
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen 
        options={{
          headerShown: false,
        }}
      />
      
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome name="chevron-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {providerName} Subscriptions
          </Text>
        </View>
      </View>
      
      <ScrollView style={styles.scrollView}>
        <ConnectionStatusCard 
          provider={provider}
          isConnected={isConnected}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
        />
        
        {isConnected && (
          <>
            {isDiscovering && localSubscriptions.length === 0 ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                  Loading your {providerName} subscriptions...
                </Text>
              </View>
            ) : localSubscriptions.length > 0 ? (
              <>
                <View style={[styles.searchSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.searchInputContainer, { backgroundColor: isDark ? colors.secondary : '#f5f5f5', borderColor: colors.border }]}>
                    <FontAwesome name="search" size={16} color={colors.mutedForeground} />
                    <TextInput
                      style={[styles.searchInput, { color: colors.foreground }]}
                      placeholder="Search subscriptions..."
                      placeholderTextColor={colors.mutedForeground}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <FontAwesome name="times-circle" size={16} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  <View style={styles.bulkActions}>
                    <TouchableOpacity 
                      style={[styles.bulkButton, { borderColor: colors.border }]}
                      onPress={handleSelectAll}
                    >
                      <Text style={[styles.bulkButtonText, { color: colors.primary }]}>Select All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.bulkButton, { borderColor: colors.border }]}
                      onPress={handleDeselectAll}
                    >
                      <Text style={[styles.bulkButtonText, { color: colors.mutedForeground }]}>Deselect All</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                
                <View style={[styles.listSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {filteredSubscriptions.map((subscription) => (
                    <SubscriptionListItem
                      key={subscription.externalId}
                      subscription={subscription}
                      onToggle={toggleSubscription}
                    />
                  ))}
                  
                  {filteredSubscriptions.length === 0 && searchQuery.length > 0 && (
                    <View style={styles.emptyState}>
                      <FontAwesome name="search" size={48} color={colors.mutedForeground} />
                      <Text style={[styles.emptyStateText, { color: colors.mutedForeground }]}>
                        No subscriptions found
                      </Text>
                    </View>
                  )}
                </View>
              </>
            ) : !isDiscovering && (
              <View style={styles.emptyState}>
                <FontAwesome 
                  name={provider === 'spotify' ? 'spotify' : 'youtube-play'} 
                  size={64} 
                  color={colors.mutedForeground} 
                />
                <Text style={[styles.emptyStateTitle, { color: colors.foreground }]}>
                  No Subscriptions Found
                </Text>
                <Text style={[styles.emptyStateText, { color: colors.mutedForeground }]}>
                  {isError 
                    ? `Unable to load your ${providerName} subscriptions. Please try again later.`
                    : `No ${providerName} subscriptions found in your account.`
                  }
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  searchSection: {
    backgroundColor: '#ffffff',
    padding: 16,
    marginBottom: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e5e5',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#171717',
  },
  bulkActions: {
    flexDirection: 'row',
    gap: 8,
  },
  bulkButton: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  bulkButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  listSection: {
    backgroundColor: '#ffffff',
    marginBottom: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e5e5',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#171717',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#737373',
    textAlign: 'center',
    lineHeight: 20,
  },
});
