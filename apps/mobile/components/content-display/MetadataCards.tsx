import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../contexts/theme';

interface VideoMetadata {
  duration?: number;
  viewCount?: number;
}

interface PodcastMetadata {
  duration?: number;
  episodeNumber?: number;
}

interface ArticleMetadata {
  readingTime?: number;
  wordCount?: number;
}

interface MetadataCardsProps {
  contentType?: string;
  videoMetadata?: VideoMetadata;
  podcastMetadata?: PodcastMetadata;
  articleMetadata?: ArticleMetadata;
  publishedAt?: number;
  platformColor: string;
}

export function MetadataCards({
  contentType,
  videoMetadata,
  podcastMetadata,
  articleMetadata,
  publishedAt,
  platformColor,
}: MetadataCardsProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.metadataGrid}>
      {/* Content Type */}
      {contentType && contentType !== 'link' && (
        <View style={[styles.metaCard, { backgroundColor: colors.secondary }]}>
          <Feather 
            name={contentType === 'video' ? 'play-circle' : 
                  contentType === 'podcast' ? 'headphones' :
                  contentType === 'article' ? 'file-text' : 'message-square'} 
            size={20} 
            color={platformColor} 
          />
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Type</Text>
          <Text style={[styles.metaValue, { color: colors.foreground }]}>
            {contentType.charAt(0).toUpperCase() + contentType.slice(1)}
          </Text>
        </View>
      )}

      {/* View Count for Videos */}
      {videoMetadata?.viewCount && (
        <View style={[styles.metaCard, { backgroundColor: colors.secondary }]}>
          <Feather name="eye" size={20} color={colors.primary} />
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Views</Text>
          <Text style={[styles.metaValue, { color: colors.foreground }]}>
            {videoMetadata.viewCount.toLocaleString('en')}
          </Text>
        </View>
      )}

      {/* Reading Time for Articles */}
      {articleMetadata?.readingTime && (
        <View style={[styles.metaCard, { backgroundColor: colors.secondary }]}>
          <Feather name="clock" size={20} color={colors.primary} />
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Read Time</Text>
          <Text style={[styles.metaValue, { color: colors.foreground }]}>
            {articleMetadata.readingTime} min
          </Text>
        </View>
      )}

      {/* Episode Info for Podcasts */}
      {podcastMetadata?.episodeNumber && (
        <View style={[styles.metaCard, { backgroundColor: colors.secondary }]}>
          <Feather name="mic" size={20} color={colors.primary} />
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Episode</Text>
          <Text style={[styles.metaValue, { color: colors.foreground }]}>
            #{podcastMetadata.episodeNumber}
          </Text>
        </View>
      )}

      {/* Published Date */}
      {publishedAt && (
        <View style={[styles.metaCard, { backgroundColor: colors.secondary }]}>
          <Feather name="calendar" size={20} color={colors.primary} />
          <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>Published</Text>
          <Text style={[styles.metaValue, { color: colors.foreground }]}>
            {new Date(publishedAt).toLocaleDateString('en', { 
              month: 'short', 
              day: 'numeric',
              year: publishedAt ? new Date(publishedAt).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined : undefined
            })}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
