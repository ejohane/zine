import { View, Text } from 'react-native';

import { SourceBadge, TypeBadge } from '@/components/badges';

import { styles } from '../../item-detail-styles';
import type { ItemDetailColors, ItemDetailItem } from '../types';

type ItemDetailHeaderProps = {
  item: ItemDetailItem;
  colors: ItemDetailColors;
  onTitleLayout?: (titleOffsetY: number) => void;
};

export function ItemDetailHeader({ item, colors, onTitleLayout }: ItemDetailHeaderProps) {
  return (
    <>
      <View style={styles.badgeRow}>
        <SourceBadge provider={item.provider} />
        <TypeBadge contentType={item.contentType} />
      </View>

      <Text
        style={[styles.title, { color: colors.text }]}
        onLayout={({ nativeEvent }) => onTitleLayout?.(nativeEvent.layout.y)}
      >
        {item.title}
      </Text>
    </>
  );
}
