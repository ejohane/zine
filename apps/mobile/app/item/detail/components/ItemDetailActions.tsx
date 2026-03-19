import type { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { UserItemState } from '@/hooks/use-items-trpc';

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
  secondaryActionIcon: keyof typeof Ionicons.glyphMap;
  secondaryActionColor: string;
  isSecondaryActionDisabled: boolean;
  onBookmarkToggle: () => void;
  onSecondaryAction: () => void;
  onManageTags: () => void;
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
  secondaryActionIcon,
  secondaryActionColor,
  isSecondaryActionDisabled,
  onBookmarkToggle,
  onSecondaryAction,
  onManageTags,
  onShare,
  onOpenLink,
  useAnimatedContainer,
}: ItemDetailActionsProps) {
  const fabConfig = getFabConfig(item.provider);
  const canManageTags = item.state === UserItemState.BOOKMARKED;
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
          icon={secondaryActionIcon}
          color={secondaryActionColor}
          onPress={onSecondaryAction}
          disabled={isSecondaryActionDisabled}
        />
        <IconActionButton
          icon="add-circle-outline"
          color={colors.textSecondary}
          onPress={onManageTags}
          disabled={!canManageTags}
        />
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
