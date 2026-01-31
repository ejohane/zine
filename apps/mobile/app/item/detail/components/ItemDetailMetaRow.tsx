import { Text, View } from 'react-native';

import { formatDuration, formatRelativeTime } from '@/lib/format';

import { extractPodcastHosts } from '../../item-detail-helpers';
import { styles } from '../../item-detail-styles';
import type { ItemDetailColors, ItemDetailCreator, ItemDetailItem } from '../types';

type ItemDetailMetaRowProps = {
  item: ItemDetailItem;
  colors: ItemDetailColors;
  creatorData?: ItemDetailCreator;
};

export function ItemDetailMetaRow({ item, colors, creatorData }: ItemDetailMetaRowProps) {
  const podcastHosts = extractPodcastHosts(creatorData?.description);

  return (
    <View style={styles.metaRow}>
      {item.provider === 'SPOTIFY' && podcastHosts && (
        <>
          <Text style={[styles.metaText, { color: colors.textTertiary }]} numberOfLines={1}>
            {podcastHosts}
          </Text>
          <Text style={[styles.metaDot, { color: colors.textTertiary }]}> · </Text>
        </>
      )}
      {(item.provider === 'YOUTUBE' || item.provider === 'X') && creatorData?.handle && (
        <>
          <Text style={[styles.metaText, { color: colors.textTertiary }]}>
            {creatorData.handle}
          </Text>
          <Text style={[styles.metaDot, { color: colors.textTertiary }]}> · </Text>
        </>
      )}
      {item.publishedAt && (
        <>
          <Text style={[styles.metaText, { color: colors.textTertiary }]}>
            {formatRelativeTime(item.publishedAt)}
          </Text>
          {(item.duration || item.readingTimeMinutes) && (
            <Text style={[styles.metaDot, { color: colors.textTertiary }]}> · </Text>
          )}
        </>
      )}
      {item.duration && (
        <Text style={[styles.metaText, { color: colors.textTertiary }]}>
          {formatDuration(item.duration)}
        </Text>
      )}
      {item.readingTimeMinutes && (
        <Text style={[styles.metaText, { color: colors.textTertiary }]}>
          {item.readingTimeMinutes} min read
        </Text>
      )}
    </View>
  );
}
