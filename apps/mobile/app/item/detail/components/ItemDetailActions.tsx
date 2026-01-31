import type { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { IconActionButton } from '../../item-detail-components';
import { getFabConfig } from '../../item-detail-helpers';
import { styles } from '../../item-detail-styles';
import type { ItemDetailColors, ItemDetailItem } from '../types';

type ItemDetailActionsProps = {
  item: ItemDetailItem;
  colors: ItemDetailColors;
  bookmarkActionIcon: keyof typeof Ionicons.glyphMap;
  bookmarkActionColor: string;
  isBookmarkActionDisabled: boolean;
  completeActionIcon: keyof typeof Ionicons.glyphMap;
  completeActionColor: string;
  isCompleteActionDisabled: boolean;
  onBookmarkToggle: () => void;
  onComplete: () => void;
  onShare: () => void;
  onOpenLink: () => void;
  useAnimatedContainer: boolean;
};

export function ItemDetailActions({
  item,
  colors,
  bookmarkActionIcon,
  bookmarkActionColor,
  isBookmarkActionDisabled,
  completeActionIcon,
  completeActionColor,
  isCompleteActionDisabled,
  onBookmarkToggle,
  onComplete,
  onShare,
  onOpenLink,
  useAnimatedContainer,
}: ItemDetailActionsProps) {
  const fabConfig = getFabConfig(item.provider);
  const Container = useAnimatedContainer ? Animated.View : View;

  return (
    <Container style={styles.actionRow}>
      <View style={styles.actionRowLeft}>
        <IconActionButton
          icon={bookmarkActionIcon}
          color={bookmarkActionColor}
          onPress={onBookmarkToggle}
          disabled={isBookmarkActionDisabled}
        />
        <IconActionButton
          icon={completeActionIcon}
          color={completeActionColor}
          onPress={onComplete}
          disabled={isCompleteActionDisabled}
        />
        <IconActionButton icon="add-circle-outline" color={colors.textSecondary} />
        <IconActionButton icon="share-outline" color={colors.textSecondary} onPress={onShare} />
        <IconActionButton icon="ellipsis-horizontal" color={colors.textSecondary} />
      </View>
      <Pressable
        onPress={onOpenLink}
        style={[styles.fabButton, { backgroundColor: fabConfig.backgroundColor }]}
      >
        {fabConfig.providerIcon}
      </Pressable>
    </Container>
  );
}
