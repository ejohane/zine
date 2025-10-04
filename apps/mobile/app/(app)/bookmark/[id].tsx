import { useState, useRef } from 'react';
import {
  View,
  Text,
  Alert,
  Share,
  Linking,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useBookmarkDetail } from '../../../hooks/useBookmarkDetail';
import { useAuth } from '../../../contexts/auth';
import { useTheme } from '../../../contexts/theme';
import { formatDistanceToNow } from '../../../lib/dateUtils';
import { PlatformIcon } from '../../../lib/platformIcons';
import { api } from '../../../lib/api';
import { useQueryClient } from '@tanstack/react-query';

export default function BookmarkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isSignedIn, getToken } = useAuth();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);
  const [imageError, setImageError] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const {
    data: bookmark,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useBookmarkDetail(id, {
    enabled: isSignedIn && !!id,
  });

  const handleOpenLink = async () => {
    if (bookmark?.url) {
      try {
        await Linking.openURL(bookmark.url);
      } catch (error) {
        Alert.alert('Error', 'Could not open the link');
      }
    }
  };

  const handleShare = async () => {
    if (bookmark) {
      try {
        await Share.share({
          title: bookmark.title,
          message: `Check out this bookmark: ${bookmark.title}\n${bookmark.url}`,
          url: bookmark.url,
        });
      } catch (error) {
        Alert.alert('Error', 'Could not share bookmark');
      }
    }
  };

  const handleArchive = () => {
    Alert.alert(
      'Archive Bookmark',
      'This feature is coming soon!',
      [{ text: 'OK', style: 'default' }]
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

  // Format duration
  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${secs}s`;
  };

  // Get platform color
  const getPlatformColor = (source?: string) => {
    switch (source) {
      case 'youtube': return '#FF0000';
      case 'spotify': return '#1DB954';
      case 'twitter':
      case 'x': return '#000000';
      case 'substack': return '#FF6719';
      default: return colors.primary;
    }
  };

  if (!isSignedIn) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: 'Bookmark',
            headerBackTitle: 'Back',
            headerStyle: { backgroundColor: colors.background },
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
            headerStyle: { backgroundColor: colors.background },
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
            headerStyle: { backgroundColor: colors.background },
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

  const duration = bookmark.videoMetadata?.duration || bookmark.podcastMetadata?.duration;
  const formattedDuration = formatDuration(duration);
  const platformColor = getPlatformColor(bookmark.source);
  const isMediaContent = bookmark.contentType === 'video' || bookmark.contentType === 'podcast';

  const HEADER_HEIGHT = 300;
  const imageTranslateY = scrollY.interpolate({
    inputRange: [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
    outputRange: [-HEADER_HEIGHT / 2, 0, HEADER_HEIGHT * 0.75],
    extrapolate: 'clamp',
  });

  const imageScale = scrollY.interpolate({
    inputRange: [-HEADER_HEIGHT, 0],
    outputRange: [2, 1],
    extrapolate: 'clamp',
  });

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
        {/* Hero Image with Parallax */}
        <Animated.View 
          style={[
            styles.heroSection, 
            { 
              transform: [
                { translateY: imageTranslateY },
                { scale: imageScale }
              ] 
            }
          ]}
        >
            {bookmark.thumbnailUrl && !imageError ? (
              <Image
                source={{ uri: bookmark.thumbnailUrl }}
                style={styles.heroImage}
                resizeMode="cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <View style={[styles.heroPlaceholder, { backgroundColor: colors.secondary }]}>
                <Feather name="image" size={48} color={colors.mutedForeground} />
              </View>
            )}
            {formattedDuration && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{formattedDuration}</Text>
              </View>
            )}
        </Animated.View>

        {/* Content Section with white background overlay */}
        <View style={[styles.contentSection, { backgroundColor: colors.background }]}>
          {/* Title */}
          <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={3}>
            {bookmark.title}
          </Text>

          {/* Creator and Date Row */}
          <View style={styles.creatorDateRow}>
            {/* Creator Info on the left */}
            <TouchableOpacity 
              style={styles.creatorInfo}
              onPress={() => {
                if (bookmark.creator?.id) {
                  router.push(`/creator/${bookmark.creator.id}` as any)
                }
              }}
              activeOpacity={0.7}
              disabled={!bookmark.creator?.id}
            >
              {bookmark.creator?.avatarUrl ? (
                <Image
                  source={{ uri: bookmark.creator.avatarUrl }}
                  style={styles.creatorAvatar}
                  onError={() => {}}
                />
              ) : (
                <View style={[styles.creatorAvatarPlaceholder, { backgroundColor: colors.secondary }]}>
                  <Feather name="user" size={20} color={colors.mutedForeground} />
                </View>
              )}
              <Text style={[styles.creatorName, { color: colors.foreground }]} numberOfLines={1}>
                {bookmark.creator?.name || 'Unknown Creator'}
              </Text>
              {bookmark.creator?.verified && (
                <Feather name="check-circle" size={14} color={colors.primary} style={styles.verifiedBadge} />
              )}
            </TouchableOpacity>
            
            {/* Publish date on the right */}
            <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
              {formatDistanceToNow(bookmark.publishedAt || bookmark.createdAt)}
            </Text>
          </View>

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

            <View style={styles.secondaryActions}>
              <TouchableOpacity 
                style={[styles.actionIcon, { backgroundColor: colors.secondary }]}
                onPress={handleArchive}
                activeOpacity={0.7}
              >
                <Feather name="archive" size={20} color={colors.foreground} />
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

          {/* Metadata Cards */}
          <View style={styles.metadataGrid}>
            {/* Content Type */}
            {bookmark.contentType && bookmark.contentType !== 'link' && (
              <View style={[styles.metaCard, { backgroundColor: colors.secondary }]}>
                <Feather 
                  name={bookmark.contentType === 'video' ? 'play-circle' : 
                        bookmark.contentType === 'podcast' ? 'headphones' :
                        bookmark.contentType === 'article' ? 'file-text' : 'message-square'} 
                  size={20} 
                  color={platformColor} 
                />
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Type</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>
                  {bookmark.contentType.charAt(0).toUpperCase() + bookmark.contentType.slice(1)}
                </Text>
              </View>
            )}

            {/* View Count for Videos */}
            {bookmark.videoMetadata?.viewCount && (
              <View style={[styles.metaCard, { backgroundColor: colors.secondary }]}>
                <Feather name="eye" size={20} color={colors.primary} />
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Views</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>
                  {bookmark.videoMetadata.viewCount.toLocaleString('en')}
                </Text>
              </View>
            )}

            {/* Reading Time for Articles */}
            {bookmark.articleMetadata?.readingTime && (
              <View style={[styles.metaCard, { backgroundColor: colors.secondary }]}>
                <Feather name="clock" size={20} color={colors.primary} />
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Read Time</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>
                  {bookmark.articleMetadata.readingTime} min
                </Text>
              </View>
            )}

            {/* Episode Info for Podcasts */}
            {bookmark.podcastMetadata?.episodeNumber && (
              <View style={[styles.metaCard, { backgroundColor: colors.secondary }]}>
                <Feather name="mic" size={20} color={colors.primary} />
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Episode</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>
                  #{bookmark.podcastMetadata.episodeNumber}
                </Text>
              </View>
            )}

            {/* Published Date */}
            {bookmark.publishedAt && (
              <View style={[styles.metaCard, { backgroundColor: colors.secondary }]}>
                <Feather name="calendar" size={20} color={colors.primary} />
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Published</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>
                  {new Date(bookmark.publishedAt).toLocaleDateString('en', { 
                    month: 'short', 
                    day: 'numeric',
                    year: bookmark.publishedAt ? new Date(bookmark.publishedAt).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined : undefined
                  })}
                </Text>
              </View>
            )}
          </View>

          {/* Tags */}
          {bookmark.tags && bookmark.tags.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Tags</Text>
              <View style={styles.tagsContainer}>
                {bookmark.tags.map((tag, index) => (
                  <View key={index} style={[styles.tag, { backgroundColor: colors.primary + '20' }]}>
                    <Text style={[styles.tagText, { color: colors.primary }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Notes */}
          {bookmark.notes && (
            <View style={styles.notesSection}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Notes</Text>
              <View style={[styles.notesCard, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.notesText, { color: colors.foreground }]}>{bookmark.notes}</Text>
              </View>
            </View>
          )}

          {/* Description */}
          {bookmark.description && (
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              {bookmark.description}
            </Text>
          )}
        </View>
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
  headerButton: {
    padding: 8,
    marginRight: 8,
  },
  headerBackground: {
    flex: 1,
    width: '100%',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  
  // Hero Section
  heroSection: {
    width: '100%',
    height: 300,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    width: '100%',
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
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
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    marginBottom: 16,
  },
  creatorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  creatorAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorName: {
    fontSize: 16,
    fontWeight: '600',
  },
  verifiedBadge: {
    marginLeft: 4,
  },
  mediaOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    marginLeft: 4,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  durationText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  
  // Content Section
  contentSection: {
    padding: 20,
    paddingBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginTop: 0,
    marginBottom: 12,
    letterSpacing: -0.5,
    lineHeight: 32,
  },

  platformInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  platformText: {
    fontSize: 15,
    fontWeight: '500',
  },
  authorAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  dateText: {
    fontSize: 14,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 0,
    marginBottom: 20,
  },
  
  // Metadata Grid
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
  metaLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  
  // Sections
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  tagsSection: {
    marginBottom: 20,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '600',
  },
  notesSection: {
    marginBottom: 24,
  },
  notesCard: {
    padding: 16,
    borderRadius: 12,
  },
  notesText: {
    fontSize: 15,
    lineHeight: 22,
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
  
  // Skeleton styles
  skeletonButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
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
  skeletonMetaCard: {
    opacity: 0.3,
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
  skeletonPrimaryButton: {
    height: 52,
    borderRadius: 14,
    opacity: 0.3,
  },
});