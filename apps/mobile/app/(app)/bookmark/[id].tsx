import { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Alert,
  Linking,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useBookmarkDetail } from '../../../hooks/useBookmarkDetail';
import { useArchiveBookmark } from '../../../hooks/useArchiveBookmark';
import { useAuth } from '../../../contexts/auth';
import { useTheme } from '../../../contexts/theme';
import { PlatformIcon } from '../../../lib/platformIcons';
import { api } from '../../../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { trackBookmarkAccessedOptimistic } from '../../../lib/recentBookmarks';
import { BookmarkContentDisplay } from '../../../components/content-display';

export default function BookmarkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isSignedIn, getToken } = useAuth();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const archiveMutation = useArchiveBookmark();
  const {
    data: bookmark,
    isLoading,
    isFetching,
    error,
  } = useBookmarkDetail(id, {
    enabled: isSignedIn && !!id,
  });

  const openUrl = async (targetUrl: string) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await Linking.openURL(targetUrl);
    } catch (error) {
      Alert.alert('Error', 'Could not open the link');
    }
  };

  const handleOpenLink = async () => {
    if (bookmark?.url && id) {
      await trackBookmarkAccessedOptimistic(id);
      
      queryClient.setQueryData(
        ['recently-opened-bookmarks'],
        (old: any[] | undefined) => {
          if (!old || !bookmark) return old;
          const filtered = old.filter(b => b.id !== bookmark.id);
          return [bookmark, ...filtered].slice(0, 4);
        }
      );
      
      await openUrl(bookmark.url);
    }
  };

  const handleArchive = () => {
    if (!id) return;
    
    Alert.alert(
      'Archive Bookmark',
      'Are you sure you want to archive this bookmark?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'default',
          onPress: async () => {
            try {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              await archiveMutation.mutateAsync(id);
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to archive bookmark');
            }
          },
        },
      ]
    );
  };

  const handleAddToCollection = () => {
    Alert.alert(
      'Add to Collection',
      'This feature is coming soon!',
      [{ text: 'OK', style: 'default' }]
    );
  };

  const handleAddTag = () => {
    Alert.alert(
      'Add Tag',
      'This feature is coming soon!',
      [{ text: 'OK', style: 'default' }]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Bookmark',
      'Are you sure you want to delete this bookmark?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            
            setIsDeleting(true);
            try {
              const token = await getToken();
              if (!token) {
                Alert.alert('Error', 'Authentication required');
                return;
              }
              await api.deleteBookmark(id, token);
              queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
              queryClient.invalidateQueries({ queryKey: ['recent-bookmarks'] });
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete bookmark');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const alternateLinkOptions = useMemo(() => {
    if (!bookmark?.url) {
      return [] as Array<{ provider?: string; url: string; label: string; isPrimary: boolean }>;
    }

    const options = new Map<string, { provider?: string; url: string; label: string; isPrimary: boolean }>();

    const addOption = (provider: string | undefined, url: string, isPrimary = false) => {
      if (!url) return;
      const key = `${provider ?? 'unknown'}::${url}`;
      if (options.has(key)) return;
      options.set(key, {
        provider,
        url,
        label: getProviderLabel(provider, url),
        isPrimary,
      });
    };

    addOption(bookmark.source ?? inferProviderFromUrl(bookmark.url), bookmark.url, true);

    (bookmark.alternateLinks ?? []).forEach((link) => {
      addOption(link.provider, link.url);
    });

    return Array.from(options.values()).sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [bookmark]);

  const hasAlternateLinks = alternateLinkOptions.length > 1;

  const handleOpenAlternateLink = () => {
    if (!hasAlternateLinks) {
      return;
    }

    const options = alternateLinkOptions.map((option) => ({
      ...option,
      displayLabel: option.isPrimary ? `${option.label} (Default)` : option.label,
    }));

    const openByIndex = async (index: number) => {
      const target = options[index];
      if (target && id) {
        await trackBookmarkAccessedOptimistic(id);
        
        queryClient.setQueryData(
          ['recently-opened-bookmarks'],
          (old: any[] | undefined) => {
            if (!old || !bookmark) return old;
            const filtered = old.filter(b => b.id !== bookmark.id);
            return [bookmark, ...filtered].slice(0, 4);
          }
        );
        
        openUrl(target.url);
      }
    };

    const optionLabels = options.map((option) => `Open in ${option.displayLabel}`);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...optionLabels, 'Cancel'],
          cancelButtonIndex: optionLabels.length,
        },
        (buttonIndex) => {
          if (buttonIndex < optionLabels.length) {
            openByIndex(buttonIndex);
          }
        }
      );
    } else {
      const buttons = options.map((option, index) => ({
        text: `Open in ${option.displayLabel}`,
        onPress: () => openByIndex(index),
      }));

      Alert.alert('Open in…', undefined, [...buttons, { text: 'Cancel', style: 'cancel' }]);
    }
  };

  if (!isSignedIn) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: 'Bookmark',
            headerBackTitle: 'Back',
            headerTransparent: true,
            headerBackground: () => (
              <View style={{ flex: 1, backgroundColor: 'transparent' }} />
            ),
            headerTintColor: colors.foreground,
          }}
        />
        <View style={styles.centerContent}>
          <Feather name="lock" size={64} color={colors.mutedForeground} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            Sign in required
          </Text>
          <Text style={[styles.errorMessage, { color: colors.mutedForeground }]}>
            Please sign in to view bookmark details
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading && !bookmark) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: '',
            headerBackTitle: 'Back',
            headerTransparent: true,
            headerBackground: () => (
              <View style={{ flex: 1, backgroundColor: 'transparent' }} />
            ),
            headerTintColor: colors.foreground,
          }}
        />
        
        <Animated.ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
        >
          {/* Skeleton Hero Image */}
          <View style={[styles.heroSection, styles.skeletonHero, { backgroundColor: colors.secondary }]} />
          
          <View style={styles.contentSection}>
            {/* Skeleton Title */}
            <View style={[styles.skeletonTitle, { backgroundColor: colors.secondary }]} />
            <View style={[styles.skeletonTitleLine2, { backgroundColor: colors.secondary }]} />
            
            {/* Skeleton Creator and Date Row */}
            <View style={styles.creatorDateRow}>
              <View style={styles.creatorInfo}>
                <View style={[styles.skeletonIcon, { backgroundColor: colors.secondary }]} />
                <View style={[styles.skeletonPlatformText, { backgroundColor: colors.secondary }]} />
              </View>
              <View style={[styles.skeletonDate, { backgroundColor: colors.secondary }]} />
            </View>
            
            {/* Skeleton Description */}
            <View style={[styles.skeletonDescription, { backgroundColor: colors.secondary }]} />
            <View style={[styles.skeletonDescriptionLine2, { backgroundColor: colors.secondary }]} />
            <View style={[styles.skeletonDescriptionLine3, { backgroundColor: colors.secondary }]} />
            
            {/* Skeleton Metadata Cards */}
            <View style={styles.metadataGrid}>
              <View style={[styles.metaCard, styles.skeletonMetaCard, { backgroundColor: colors.secondary }]} />
              <View style={[styles.metaCard, styles.skeletonMetaCard, { backgroundColor: colors.secondary }]} />
              <View style={[styles.metaCard, styles.skeletonMetaCard, { backgroundColor: colors.secondary }]} />
            </View>
            
            {/* Skeleton Tags */}
            <View style={styles.tagsSection}>
              <View style={[styles.skeletonSectionTitle, { backgroundColor: colors.secondary }]} />
              <View style={styles.tagsContainer}>
                <View style={[styles.skeletonTag, { backgroundColor: colors.secondary }]} />
                <View style={[styles.skeletonTag, { backgroundColor: colors.secondary }]} />
                <View style={[styles.skeletonTag, { backgroundColor: colors.secondary }]} />
              </View>
            </View>
            
            {/* Skeleton Action Buttons */}
            <View style={styles.actionButtons}>
              <View style={[styles.skeletonPrimaryButton, { backgroundColor: colors.secondary }]} />
              <View style={styles.secondaryActions}>
                <View style={[styles.actionIcon, { backgroundColor: colors.secondary }]} />
                <View style={[styles.actionIcon, { backgroundColor: colors.secondary }]} />
                <View style={[styles.actionIcon, { backgroundColor: colors.secondary }]} />
                <View style={[styles.actionIcon, { backgroundColor: colors.secondary }]} />
              </View>
            </View>
          </View>
        </Animated.ScrollView>
      </SafeAreaView>
    );
  }

  if (error || !bookmark) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: 'Error',
            headerBackTitle: 'Back',
            headerTransparent: true,
            headerBackground: () => (
              <View style={{ flex: 1, backgroundColor: 'transparent' }} />
            ),
            headerTintColor: colors.foreground,
          }}
        />
        <View style={styles.centerContent}>
          <Feather name="alert-circle" size={64} color={colors.destructive} />
          <Text style={[styles.errorTitle, { color: colors.foreground }]}>
            {error ? 'Failed to load bookmark' : 'Bookmark not found'}
          </Text>
          <Text style={[styles.errorMessage, { color: colors.mutedForeground }]}>
            {error?.message || 'This bookmark may have been deleted'}
          </Text>
          <TouchableOpacity 
            onPress={() => router.back()}
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.buttonText, { color: colors.primaryForeground || '#fff' }]}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen 
        options={{
          headerTitle: '',
          headerBackTitle: 'Back',
          headerTransparent: true,
          headerBackground: () => (
            <View style={{ flex: 1, backgroundColor: 'transparent' }} />
          ),
          headerTintColor: colors.foreground,
          headerRight: () => isFetching && !isLoading ? (
            <View style={{ marginRight: 16, opacity: 0.6 }}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null,
        }}
      />
      
      <Animated.ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        <BookmarkContentDisplay
          data={bookmark}
          scrollY={scrollY}
          onCreatorPress={(creatorId) => router.push(`/creator/${creatorId}` as any)}
          showNotes={true}
          showTags={true}
        >
          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[styles.primaryActionButton, { backgroundColor: colors.primary }]}
              onPress={handleOpenLink}
              activeOpacity={0.8}
            >
              <Feather name="external-link" size={20} color={colors.primaryForeground || '#fff'} />
              <Text style={[styles.primaryActionText, { color: colors.primaryForeground || '#fff' }]}>
                Open Link
              </Text>
            </TouchableOpacity>

            {hasAlternateLinks && (
              <TouchableOpacity 
                style={[styles.alternateLinksButton, { backgroundColor: colors.secondary }]}
                onPress={handleOpenAlternateLink}
                activeOpacity={0.8}
              >
                <View style={styles.alternateLinksIconRow}>
                  {alternateLinkOptions.slice(0, 3).map((option) => (
                    <PlatformIcon
                      key={`${option.provider ?? 'web'}-${option.url}`}
                      source={(option.provider as any) ?? 'web'}
                      size={16}
                    />
                  ))}
                  {alternateLinkOptions.length > 3 && (
                    <Text style={[styles.alternateLinksMore, { color: colors.mutedForeground }]}>
                      +{alternateLinkOptions.length - 3}
                    </Text>
                  )}
                </View>
                <Text style={[styles.alternateLinksText, { color: colors.foreground }]}>Open in…</Text>
              </TouchableOpacity>
            )}

            <View style={styles.secondaryActions}>
              <TouchableOpacity 
                style={[styles.actionIcon, { backgroundColor: colors.secondary }]}
                onPress={handleArchive}
                activeOpacity={0.7}
                disabled={archiveMutation.isPending}
              >
                {archiveMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.foreground} />
                ) : (
                  <Feather name="archive" size={20} color={colors.foreground} />
                )}
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.actionIcon, { backgroundColor: colors.secondary }]}
                onPress={handleAddToCollection}
                activeOpacity={0.7}
              >
                <Feather name="folder-plus" size={20} color={colors.foreground} />
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.actionIcon, { backgroundColor: colors.secondary }]}
                onPress={handleAddTag}
                activeOpacity={0.7}
              >
                <Feather name="tag" size={20} color={colors.foreground} />
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.actionIcon, { backgroundColor: colors.destructive + '20' }]}
                onPress={handleDelete}
                activeOpacity={0.7}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={colors.destructive} />
                ) : (
                  <Feather name="trash-2" size={20} color={colors.destructive} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </BookmarkContentDisplay>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  
  // Skeleton styles for loading state
  heroSection: {
    width: '100%',
    height: 300,
  },
  contentSection: {
    padding: 20,
    paddingBottom: 32,
  },
  skeletonHero: {
    opacity: 0.3,
  },
  skeletonTitle: {
    height: 28,
    borderRadius: 8,
    marginBottom: 8,
    width: '90%',
    opacity: 0.3,
  },
  skeletonTitleLine2: {
    height: 28,
    borderRadius: 8,
    marginBottom: 12,
    width: '60%',
    opacity: 0.3,
  },
  creatorDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 16,
  },
  creatorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  skeletonIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    opacity: 0.3,
  },
  skeletonPlatformText: {
    height: 18,
    width: 100,
    borderRadius: 6,
    opacity: 0.3,
  },
  skeletonDate: {
    height: 16,
    width: 60,
    borderRadius: 6,
    opacity: 0.3,
  },
  skeletonDescription: {
    height: 20,
    borderRadius: 6,
    marginBottom: 8,
    width: '100%',
    opacity: 0.3,
  },
  skeletonDescriptionLine2: {
    height: 20,
    borderRadius: 6,
    marginBottom: 8,
    width: '95%',
    opacity: 0.3,
  },
  skeletonDescriptionLine3: {
    height: 20,
    borderRadius: 6,
    marginBottom: 20,
    width: '75%',
    opacity: 0.3,
  },
  metadataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 20,
    marginBottom: 20,
  },
  metaCard: {
    flexDirection: 'column',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    minWidth: 90,
    gap: 4,
  },
  skeletonMetaCard: {
    opacity: 0.3,
  },
  tagsSection: {
    marginBottom: 20,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skeletonSectionTitle: {
    height: 20,
    width: 60,
    borderRadius: 6,
    marginBottom: 12,
    opacity: 0.3,
  },
  skeletonTag: {
    height: 36,
    width: 80,
    borderRadius: 20,
    opacity: 0.3,
  },
  
  // Action Buttons
  actionButtons: {
    gap: 12,
  },
  primaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  primaryActionText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  alternateLinksButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 10,
  },
  alternateLinksIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alternateLinksMore: {
    fontSize: 12,
    fontWeight: '600',
  },
  alternateLinksText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  skeletonPrimaryButton: {
    height: 52,
    borderRadius: 14,
    opacity: 0.3,
  },
  
  // Error states
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  primaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

function inferProviderFromUrl(url: string): string | undefined {
  try {
    const urlObj = new URL(url);
    const hostname = (urlObj as any).hostname?.toLowerCase() || '';
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) {
      return 'youtube';
    }
    if (hostname.includes('spotify')) {
      return 'spotify';
    }
    if (hostname.includes('twitter') || hostname.includes('x.com')) {
      return 'twitter';
    }
    if (hostname.includes('substack')) {
      return 'substack';
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function getProviderLabel(provider?: string, url?: string): string {
  switch (provider) {
    case 'youtube':
      return 'YouTube';
    case 'spotify':
      return 'Spotify';
    case 'twitter':
    case 'x':
      return 'Twitter';
    case 'substack':
      return 'Substack';
    default:
      if (url) {
        try {
          const urlObj = new URL(url);
          const hostname = (urlObj as any).hostname || '';
          return hostname.replace(/^www\./, '');
        } catch {
          return 'Link';
        }
      }
      return 'Link';
  }
}
