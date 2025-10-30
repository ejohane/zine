import { View, StyleSheet, Animated } from 'react-native';
import { ReactNode, useMemo } from 'react';
import { useTheme } from '../../contexts/theme';
import { HeroSection } from './HeroSection';
import { ContentMetadata } from './ContentMetadata';
import { MetadataCards } from './MetadataCards';
import { ContentSections } from './ContentSections';

interface Creator {
  id?: string;
  name?: string;
  avatarUrl?: string;
  verified?: boolean;
}

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

interface BookmarkData {
  title?: string;
  thumbnailUrl?: string;
  contentType?: string;
  creator?: Creator;
  publishedAt?: number;
  createdAt?: number;
  videoMetadata?: VideoMetadata;
  podcastMetadata?: PodcastMetadata;
  articleMetadata?: ArticleMetadata;
  tags?: string[];
  notes?: string;
  description?: string;
  source?: string;
  url?: string;
}

interface BookmarkContentDisplayProps {
  data: BookmarkData;
  scrollY: Animated.Value;
  onCreatorPress?: (creatorId: string) => void;
  children?: ReactNode;
  showNotes?: boolean;
  showTags?: boolean;
}

export function BookmarkContentDisplay({
  data,
  scrollY,
  onCreatorPress,
  children,
  showNotes = true,
  showTags = true,
}: BookmarkContentDisplayProps) {
  const { colors } = useTheme();

  const duration = useMemo(
    () => data.videoMetadata?.duration || data.podcastMetadata?.duration,
    [data.videoMetadata?.duration, data.podcastMetadata?.duration]
  );

  const platformColor = useMemo(() => {
    const platform = data.source || (data as any).provider;
    switch (platform) {
      case 'youtube': return '#FF0000';
      case 'spotify': return '#1DB954';
      case 'twitter':
      case 'x': return '#000000';
      case 'substack': return '#FF6719';
      default: return colors.primary;
    }
  }, [data.source, (data as any).provider, colors.primary]);

  return (
    <>
      <HeroSection
        thumbnailUrl={data.thumbnailUrl}
        contentType={data.contentType}
        duration={duration}
        scrollY={scrollY}
      />

      <View style={[styles.contentSection, { backgroundColor: colors.background }]}>
        <ContentMetadata
          title={data.title}
          creator={data.creator}
          publishedAt={data.publishedAt}
          createdAt={data.createdAt}
          onCreatorPress={onCreatorPress}
        />

        {/* Action buttons slot (injected by parent) */}
        {children}

        <MetadataCards
          contentType={data.contentType}
          videoMetadata={data.videoMetadata}
          podcastMetadata={data.podcastMetadata}
          articleMetadata={data.articleMetadata}
          publishedAt={data.publishedAt}
          platformColor={platformColor}
        />

        <ContentSections
          tags={data.tags}
          notes={data.notes}
          description={data.description}
          showTags={showTags}
          showNotes={showNotes}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  contentSection: {
    padding: 20,
    paddingBottom: 32,
  },
});
