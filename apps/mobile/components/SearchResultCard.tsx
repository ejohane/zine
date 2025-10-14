// @ts-nocheck
import { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Linking, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Source } from '@zine/shared';
import { useTheme } from '../contexts/theme';
import { PlatformIcon } from '../lib/platformIcons';

export interface SearchResult {
  type: 'bookmark' | 'feed_item';
  id: string;
  title: string;
  description?: string;
  url: string;
  thumbnailUrl?: string;
  creator?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  contentType?: 'video' | 'podcast' | 'article';
  publishedAt?: string;
  relevanceScore: number;
  notes?: string;
}

interface SearchResultCardProps {
  result: SearchResult;
  onPress?: () => void;
}

export function SearchResultCard({ result, onPress }: SearchResultCardProps) {
  const [imageError, setImageError] = useState(false);
  const { colors } = useTheme();
  const scaleAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 7,
      useNativeDriver: true,
    }).start();
  }, []);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onPress) {
      onPress();
    } else {
      Linking.openURL(result.url);
    }
  };

  const getSourceFromUrl = (url: string): Source => {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'youtube';
    if (urlLower.includes('spotify.com')) return 'spotify';
    if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) return 'x';
    if (urlLower.includes('substack.com')) return 'substack';
    return 'web';
  };

  const source = getSourceFromUrl(result.url);
  
  const platformColor = (() => {
    switch (source) {
      case 'youtube': return '#FF0000';
      case 'spotify': return '#1DB954';
      case 'x': return '#000000';
      case 'substack': return '#FF6719';
      default: return colors.primary;
    }
  })();

  const typeLabel = result.type === 'bookmark' ? 'Bookmark' : 'Feed Item';
  const typeLabelColor = result.type === 'bookmark' ? '#3b82f6' : '#10b981';

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: scaleAnim }}>
      <TouchableOpacity 
        style={[styles.card, { backgroundColor: colors.card }]} 
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <View style={styles.cardContent}>
          {result.thumbnailUrl && !imageError ? (
            <Image
              source={{ uri: result.thumbnailUrl }}
              style={styles.thumbnail}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <View style={[styles.thumbnailPlaceholder, { backgroundColor: colors.secondary }]}>
              <Feather 
                name={result.contentType === 'video' ? 'video' : 
                      result.contentType === 'podcast' ? 'mic' : 'file-text'} 
                size={24} 
                color={colors.mutedForeground} 
              />
            </View>
          )}
          
          <View style={styles.textContainer}>
            <View style={styles.header}>
              <View style={[styles.typeBadge, { backgroundColor: typeLabelColor + '20' }]}>
                <Text style={[styles.typeText, { color: typeLabelColor }]}>
                  {typeLabel}
                </Text>
              </View>
            </View>

            <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
              {result.title}
            </Text>

            {result.description && (
              <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>
                {result.description}
              </Text>
            )}

            {result.notes && (
              <View style={[styles.notesContainer, { backgroundColor: colors.secondary }]}>
                <Feather name="edit-3" size={12} color={colors.mutedForeground} />
                <Text style={[styles.notes, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {result.notes}
                </Text>
              </View>
            )}

            <View style={styles.footer}>
              {result.creator && (
                <View style={styles.creatorContainer}>
                  <PlatformIcon source={source} size={14} color={platformColor} />
                  <Text style={[styles.creator, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {result.creator.name}
                  </Text>
                </View>
              )}
              
              {result.contentType && (
                <View style={[styles.contentTypeBadge, { backgroundColor: platformColor + '20' }]}>
                  <Text style={[styles.contentTypeText, { color: platformColor }]}>
                    {result.contentType.charAt(0).toUpperCase() + result.contentType.slice(1)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardContent: {
    flexDirection: 'row',
    padding: 12,
  },
  thumbnail: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 12,
  },
  thumbnailPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 20,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  notesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 4,
    gap: 6,
  },
  notes: {
    fontSize: 12,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  creatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  creator: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  contentTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  contentTypeText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
