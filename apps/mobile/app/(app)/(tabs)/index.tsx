// @ts-nocheck
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../../contexts/auth';
import { OptimizedRecentBookmarksSection } from '../../../components/OptimizedRecentBookmarksSection';
import { RecentlyOpenedBookmarksSection } from '../../../components/RecentlyOpenedBookmarksSection';
import { FeedSection } from '../../../components/FeedSection';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { HomeHeader } from '../../../components/HomeHeader';
import { useTheme } from '../../../contexts/theme';
import { useRefreshFeed } from '../../../hooks/useRefreshFeed';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { isSignedIn, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { colors } = useTheme();
  const { mutateAsync: refreshFeed } = useRefreshFeed();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Trigger feed polling in the background (may be rate limited)
      if (isSignedIn) {
        try {
          await refreshFeed();
        } catch (error: any) {
          // Rate limiting is expected - don't show error since we'll still refresh local data
          if (error?.status !== 429) {
            console.error('Failed to refresh feed:', error);
          }
        }
      }
      // Always invalidate local queries to refresh the UI with latest data from backend
      await queryClient.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, refreshFeed, isSignedIn]);

  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['recently-opened-bookmarks'] });
      queryClient.invalidateQueries({ 
        queryKey: ['feed-items'],
        refetchType: 'active'
      });
    }, [queryClient])
  );

  const handleSeeAllBookmarks = () => {
    router.push('/recent-bookmarks');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <HomeHeader />
      <ScrollView
        style={styles.scrollView} 
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#8b5cf6"
            colors={['#8b5cf6']}
          />
        }
      >
        
        {/* Recently Opened Bookmarks Section - Only show when authenticated and has 4+ opened */}
        {isLoaded && isSignedIn && (
          <RecentlyOpenedBookmarksSection />
        )}

        {/* Feed Section - Only show when authenticated and has new items */}
        {isLoaded && isSignedIn && (
          <FeedSection onRefresh={onRefresh} />
        )}
        
        {/* Recent Bookmarks Section - Only show when authenticated */}
        {isLoaded && isSignedIn && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent</Text>
              <TouchableOpacity onPress={handleSeeAllBookmarks} style={styles.seeAllButton}>
                <Text style={[styles.seeAllText, { color: colors.primary }]}>See all</Text>
                <Feather name="chevron-right" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <OptimizedRecentBookmarksSection useVirtualization={false} />
          </View>
        )}

        {/* Show placeholder when not signed in */}
        {isLoaded && !isSignedIn && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent</Text>
            </View>
            <View style={[styles.authPrompt, { backgroundColor: colors.card }]}>
              <Feather name="lock" size={32} color={colors.mutedForeground} style={styles.authIcon} />
              <Text style={[styles.authPromptText, { color: colors.mutedForeground }]}>Sign in to view your bookmarks</Text>
              <TouchableOpacity 
                style={[styles.signInButton, { backgroundColor: colors.primary }]} 
                onPress={() => router.push('/(auth)/sign-in')}
              >
                <Text style={styles.signInButtonText}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}


      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 80,
  },
  section: {
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#171717',
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seeAllText: {
    fontSize: 14,
    color: '#f97316',
    fontWeight: '500',
    marginRight: 4,
  },

  authPrompt: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    marginHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  authIcon: {
    marginBottom: 12,
  },
  authPromptText: {
    fontSize: 15,
    color: '#525252',
    marginBottom: 16,
    textAlign: 'center',
  },
  signInButton: {
    backgroundColor: '#f97316',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  signInButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});