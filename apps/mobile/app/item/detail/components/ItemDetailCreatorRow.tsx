import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { getContentIcon } from '@/lib/content-utils';

import { styles } from '../../item-detail-styles';
import type { ItemDetailColors, ItemDetailItem } from '../types';

type ItemDetailCreatorRowProps = {
  item: ItemDetailItem;
  colors: ItemDetailColors;
  creatorImageUrl?: string | null;
  onCreatorPress?: () => void;
};

export function ItemDetailCreatorRow({
  item,
  colors,
  creatorImageUrl,
  onCreatorPress,
}: ItemDetailCreatorRowProps) {
  const resolvedImageUrl = creatorImageUrl ?? item.creatorImageUrl ?? undefined;

  if (item.creatorId && onCreatorPress) {
    return (
      <Pressable
        style={styles.creatorRow}
        onPress={onCreatorPress}
        accessibilityRole="button"
        accessibilityLabel={`View ${item.creator}'s profile`}
      >
        {resolvedImageUrl ? (
          <Image
            source={{ uri: resolvedImageUrl }}
            style={styles.creatorThumbnail}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.creatorPlaceholder, { backgroundColor: colors.backgroundTertiary }]}>
            <Text style={[styles.creatorInitial, { color: colors.textTertiary }]}>
              {item.creator?.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={[styles.creatorName, { color: colors.text }]}>{item.creator}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </Pressable>
    );
  }

  return (
    <View style={styles.sourceRow}>
      {resolvedImageUrl ? (
        <Image
          source={{ uri: resolvedImageUrl }}
          style={styles.sourceThumbnail}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.sourcePlaceholder, { backgroundColor: colors.backgroundTertiary }]}>
          {getContentIcon(item.contentType, 14, colors.textTertiary)}
        </View>
      )}
      <Text style={[styles.sourceName, { color: colors.text }]}>{item.creator}</Text>
    </View>
  );
}
