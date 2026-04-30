import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/primitives/text';
import { Surface } from '@/components/primitives/surface';
import { IconSizes } from '@/constants/theme';

import { styles } from '../../item-detail-styles';
import type { ItemDetailColors, ItemDetailItem } from '../types';

type ItemDetailOtherBookmarksProps = {
  bookmarks: ItemDetailItem[];
  colors: ItemDetailColors;
  creatorName: string;
  onBookmarkPress: (id: string) => void;
};

export function ItemDetailOtherBookmarks({
  bookmarks,
  colors,
  creatorName,
  onBookmarkPress,
}: ItemDetailOtherBookmarksProps) {
  if (bookmarks.length === 0) {
    return null;
  }

  return (
    <View style={styles.otherBookmarksContainer}>
      <Surface
        tone="subtle"
        radius="lg"
        padding="lg"
        colors={colors}
        style={styles.otherBookmarksSurface}
        accessibilityLabel="Other bookmarks from creator"
      >
        <View style={styles.otherBookmarksHeader}>
          <Text variant="titleSmall" colors={colors}>
            More from {creatorName}
          </Text>
          <Text variant="bodySmall" tone="subheader" colors={colors}>
            Unfinished bookmarks
          </Text>
        </View>

        <View style={styles.otherBookmarksList}>
          {bookmarks.map((bookmark) => (
            <Pressable
              key={bookmark.id}
              accessibilityRole="button"
              accessibilityLabel={`Open bookmark ${bookmark.title}`}
              onPress={() => onBookmarkPress(bookmark.id)}
              style={({ pressed }) => [
                styles.otherBookmarkRow,
                { borderColor: colors.borderSubtle },
                pressed && { opacity: 0.72 },
              ]}
            >
              <View style={styles.otherBookmarkTextGroup}>
                <Text variant="bodyMedium" colors={colors} numberOfLines={2}>
                  {bookmark.title}
                </Text>
                <Text variant="bodySmall" tone="subheader" colors={colors} numberOfLines={1}>
                  {bookmark.publisher ?? bookmark.creator}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={IconSizes.sm} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>
      </Surface>
    </View>
  );
}
