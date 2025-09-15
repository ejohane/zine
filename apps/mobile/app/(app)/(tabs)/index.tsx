// @ts-nocheck
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../contexts/auth';
import { OptimizedRecentBookmarksSection } from '../../../components/OptimizedRecentBookmarksSection';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { isSignedIn, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Invalidate all queries to refresh data
      await queryClient.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  const handleSeeAllBookmarks = () => {
    // Navigate to search tab which can be used to view all bookmarks
    router.push('/(app)/(tabs)/search');
  };

  return (
    <SafeAreaView style={styles.container}>
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
        <View style={styles.header}>
          <Text style={styles.title}>Welcome to Zine</Text>
          <Text style={styles.subtitle}>Your bookmarks and feeds in one place</Text>
        </View>
        
        {/* Recent Bookmarks Section - Only show when authenticated */}
        {isLoaded && isSignedIn && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Bookmarks</Text>
              <TouchableOpacity onPress={handleSeeAllBookmarks} style={styles.seeAllButton}>
                <Text style={styles.seeAllText}>See all</Text>
                <Feather name="chevron-right" size={16} color="#8b5cf6" />
              </TouchableOpacity>
            </View>
            <OptimizedRecentBookmarksSection useVirtualization={false} />
          </View>
        )}

        {/* Show placeholder when not signed in */}
        {isLoaded && !isSignedIn && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Bookmarks</Text>
            <View style={styles.authPrompt}>
              <Feather name="lock" size={32} color="#a3a3a3" style={styles.authIcon} />
              <Text style={styles.authPromptText}>Sign in to view your bookmarks</Text>
              <TouchableOpacity 
                style={styles.signInButton} 
                onPress={() => router.push('/(auth)/sign-in')}
              >
                <Text style={styles.signInButtonText}>Sign In</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Feeds</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tech News Feed</Text>
            <Text style={styles.cardDescription}>Latest updates from your subscriptions</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Design Feed</Text>
            <Text style={styles.cardDescription}>Inspiration and resources</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 16,
  },
  header: {
    marginBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#171717',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#737373',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#262626',
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seeAllText: {
    fontSize: 14,
    color: '#8b5cf6',
    fontWeight: '500',
    marginRight: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#171717',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: '#737373',
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
    backgroundColor: '#8b5cf6',
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