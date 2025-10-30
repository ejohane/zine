import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useState, useMemo } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/theme';
import { useAccounts } from '../../../hooks/useAccounts';
import { useDiscoverSubscriptions, useUpdateSubscriptions } from '../../../hooks/useSubscriptions';
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
  const [hasChanges, setHasChanges] = useState(false);
  
  const isConnected = provider === 'spotify' ? isSpotifyConnected : isYouTubeConnected;
  const providerName = provider === 'spotify' ? 'Spotify' : 'YouTube';
  
  const { data: discoveryData, refetch, isFetching: isDiscovering } = useDiscoverSubscriptions(provider);
  const updateMutation = useUpdateSubscriptions(provider);
  
  useMemo(() => {
    if (discoveryData?.subscriptions) {
      setLocalSubscriptions(discoveryData.subscriptions);
      setHasChanges(false);
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
  
  const handleDiscover = () => {
    if (!isConnected) {
      Alert.alert('Not Connected', `Please connect your ${providerName} account first.`);
      return;
    }
    
    try {
      refetch();
    } catch (error) {
      console.error('Discovery error:', error);
      Alert.alert('Error', 'Failed to discover subscriptions. Please try again.');
    }
  };
  
  const toggleSubscription = (externalId: string) => {
    setLocalSubscriptions(prev => 
      prev.map(sub => 
        sub.externalId === externalId 
          ? { ...sub, isUserSubscribed: !sub.isUserSubscribed }
          : sub
      )
    );
    setHasChanges(true);
  };
  
  const handleSelectAll = () => {
    setLocalSubscriptions(prev => prev.map(sub => ({ ...sub, isUserSubscribed: true })));
    setHasChanges(true);
  };
  
  const handleDeselectAll = () => {
    setLocalSubscriptions(prev => prev.map(sub => ({ ...sub, isUserSubscribed: false })));
    setHasChanges(true);
  };
  
  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync(localSubscriptions);
      setHasChanges(false);
    } catch (error) {
      console.error('Save error:', error);
    }
  };
  
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
        {hasChanges && (
          <TouchableOpacity 
            onPress={handleSave}
            disabled={updateMutation.isPending}
            style={styles.saveButton}
          >
            {updateMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <FontAwesome name="check" size={20} color={colors.primary} />
            )}
          </TouchableOpacity>
        )}
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
            <View style={[styles.actionSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity 
                style={[styles.discoverButton, { backgroundColor: colors.primary }]}
                onPress={handleDiscover}
                disabled={isDiscovering}
              >
                {isDiscovering ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <FontAwesome name="refresh" size={16} color="#ffffff" />
                    <Text style={styles.discoverButtonText}>
                      {localSubscriptions.length > 0 ? 'Refresh Subscriptions' : 'Discover Subscriptions'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              
              {localSubscriptions.length > 0 && (
                <Text style={[styles.statsText, { color: colors.mutedForeground }]}>
                  {subscribedCount} of {localSubscriptions.length} selected
                </Text>
              )}
            </View>
            
            {localSubscriptions.length > 0 && (
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
            )}
            
            {localSubscriptions.length === 0 && !isDiscovering && (
              <View style={styles.emptyState}>
                <FontAwesome 
                  name={provider === 'spotify' ? 'spotify' : 'youtube-play'} 
                  size={64} 
                  color={colors.mutedForeground} 
                />
                <Text style={[styles.emptyStateTitle, { color: colors.foreground }]}>
                  No Subscriptions Yet
                </Text>
                <Text style={[styles.emptyStateText, { color: colors.mutedForeground }]}>
                  Tap "Discover Subscriptions" to load your {providerName} subscriptions
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
  saveButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  actionSection: {
    backgroundColor: '#ffffff',
    padding: 16,
    marginBottom: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e5e5',
  },
  discoverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  discoverButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  statsText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
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
