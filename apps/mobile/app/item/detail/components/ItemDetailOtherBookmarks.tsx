import { View } from 'react-native';

import { ItemCard, type ItemCardData } from '@/components/item-card';
import { Surface } from '@/components/primitives/surface';
import { Text } from '@/components/primitives/text';
import { mapContentType, mapProvider, type ContentType, type Provider } from '@/lib/content-utils';

import { styles } from '../../item-detail-styles';
import type { ItemDetailColors, ItemDetailItem } from '../types';

type ItemDetailOtherBookmarksProps = {
  bookmarks: ItemDetailItem[];
  colors: ItemDetailColors;
  onBookmarkPress: (id: string) => void;
};

export function ItemDetailOtherBookmarks({
  bookmarks,
  colors,
  onBookmarkPress,
}: ItemDetailOtherBookmarksProps) {
  if (bookmarks.length === 0) {
    return null;
  }

  const items: ItemCardData[] = bookmarks.map((bookmark) => ({
    id: bookmark.id,
    title: bookmark.title,
    creator: bookmark.creator,
    creatorImageUrl: bookmark.creatorImageUrl ?? null,
    thumbnailUrl: bookmark.thumbnailUrl ?? null,
    contentType: mapContentType(bookmark.contentType) as ContentType,
    provider: mapProvider(bookmark.provider) as Provider,
    duration: bookmark.duration ?? null,
    readingTimeMinutes: bookmark.readingTimeMinutes ?? null,
    bookmarkedAt: bookmark.bookmarkedAt ?? null,
    publishedAt: bookmark.publishedAt ?? null,
    isFinished: bookmark.isFinished,
  }));

  return (
    <View style={styles.otherBookmarksContainer}>
      <Surface
        tone="subtle"
        radius="lg"
        colors={colors}
        style={styles.otherBookmarksSurface}
        accessibilityLabel="Other bookmarks from creator"
      >
        <View style={styles.otherBookmarksHeader}>
          <Text style={styles.otherBookmarksTitle} tone="primary" colors={colors}>
            Your Bookmarks
          </Text>
          <Text style={styles.otherBookmarksCount} tone="subheader" colors={colors}>
            {items.length} item{items.length === 1 ? '' : 's'}
          </Text>
        </View>

        {items.map((item, index) => (
          <ItemCard
            key={item.id}
            item={item}
            shape="row"
            index={index}
            onPress={() => onBookmarkPress(item.id)}
          />
        ))}
      </Surface>
    </View>
  );
}
