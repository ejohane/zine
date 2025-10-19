import * as React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import type { Bookmark } from '@zine/shared';
import { useTheme } from '../contexts/theme';
import { PlatformIcon } from '../lib/platformIcons';

interface RecentlyOpenedBookmarkCardProps {
  bookmark: Bookmark;
}

export const RecentlyOpenedBookmarkCard = React.memo<RecentlyOpenedBookmarkCardProps>(({ bookmark }) => {
  const router = useRouter();
  const { colors } = useTheme();
  
  const handlePress = React.useCallback(() => {
    router.push(`/bookmark/${bookmark.id}`);
  }, [bookmark.id, router]);
  
  const thumbnailUri = React.useMemo(() => {
    if (bookmark.thumbnailUrl && bookmark.thumbnailUrl.trim().length > 0) {
      return bookmark.thumbnailUrl;
    }
    const fallback = bookmark.creator?.avatarUrl;
    if (fallback && fallback.trim().length > 0) {
      return fallback;
    }
    return undefined;
  }, [bookmark.thumbnailUrl, bookmark.creator?.avatarUrl]);
  
  return (
    <TouchableOpacity 
      style={[styles.card, { backgroundColor: colors.card }]} 
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.thumbnailContainer}>
        {thumbnailUri ? (
          <Image
            source={{ uri: thumbnailUri }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholderThumbnail}>
            <PlatformIcon source={bookmark.source} size={24} />
          </View>
        )}
      </View>
      
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={3}>
          {bookmark.title}
        </Text>
      </View>
    </TouchableOpacity>
  );
}, (prevProps, nextProps) => {
  return prevProps.bookmark.id === nextProps.bookmark.id &&
         prevProps.bookmark.updatedAt === nextProps.bookmark.updatedAt;
});

RecentlyOpenedBookmarkCard.displayName = 'RecentlyOpenedBookmarkCard';

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    minHeight: 80,
  },
  thumbnailContainer: {
    width: 80,
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  placeholderThumbnail: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
  },
  textContainer: {
    flex: 1,
    padding: 8,
    justifyContent: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
});
