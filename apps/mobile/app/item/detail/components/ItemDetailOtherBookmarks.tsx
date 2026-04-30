import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ItemCard, type ItemCardData } from '@/components/item-card';
import { Surface } from '@/components/primitives/surface';
import { Text } from '@/components/primitives/text';
import { IconSizes } from '@/constants/theme';
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
  const [isExpanded, setIsExpanded] = useState(false);

  if (bookmarks.length === 0) {
    return null;
  }

  const canExpand = bookmarks.length > 1;
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
        {canExpand ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle other bookmarks from creator"
            accessibilityState={{ expanded: isExpanded }}
            onPress={() => setIsExpanded((current) => !current)}
            style={({ pressed }) => [
              styles.otherBookmarksHeader,
              pressed ? { opacity: 0.72 } : null,
            ]}
          >
            <Text variant="labelSmall" tone="tertiary" colors={colors}>
              Your Bookmarks
            </Text>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={IconSizes.sm}
              color={colors.textTertiary}
            />
          </Pressable>
        ) : (
          <View style={styles.otherBookmarksHeader}>
            <Text variant="labelSmall" tone="tertiary" colors={colors}>
              Your Bookmarks
            </Text>
          </View>
        )}

        {(isExpanded && canExpand ? items : items.slice(0, 1)).map((item, index) => (
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
