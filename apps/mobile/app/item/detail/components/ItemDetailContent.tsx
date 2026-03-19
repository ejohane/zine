import type { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { styles } from '../../item-detail-styles';
import type { ItemDetailColors, ItemDetailCreator, ItemDetailItem } from '../types';
import { ItemDetailActions } from './ItemDetailActions';
import { ItemDetailCreatorRow } from './ItemDetailCreatorRow';
import { ItemDetailDescription } from './ItemDetailDescription';
import { ItemDetailHeader } from './ItemDetailHeader';
import { ItemDetailMetaRow } from './ItemDetailMetaRow';

type ItemDetailContentProps = {
  item: ItemDetailItem;
  colors: ItemDetailColors;
  creatorData?: ItemDetailCreator;
  creatorImageUrl?: string | null;
  onCreatorPress?: () => void;
  descriptionLabel: string;
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
  useAnimatedDescription: boolean;
  useAnimatedActions: boolean;
};

export function ItemDetailContent({
  item,
  colors,
  creatorData,
  creatorImageUrl,
  onCreatorPress,
  descriptionLabel,
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
  useAnimatedActions,
  useAnimatedDescription,
}: ItemDetailContentProps) {
  const DescriptionContainer = useAnimatedDescription ? Animated.View : View;

  return (
    <>
      <Animated.View style={styles.contentContainer}>
        <ItemDetailHeader item={item} colors={colors} />
        <ItemDetailCreatorRow
          item={item}
          colors={colors}
          creatorImageUrl={creatorImageUrl}
          onCreatorPress={onCreatorPress}
        />
        <ItemDetailMetaRow item={item} colors={colors} creatorData={creatorData} />
      </Animated.View>

      <ItemDetailActions
        item={item}
        colors={colors}
        bookmarkActionIcon={bookmarkActionIcon}
        bookmarkActionColor={bookmarkActionColor}
        isBookmarkActionDisabled={isBookmarkActionDisabled}
        secondaryActionIcon={secondaryActionIcon}
        secondaryActionColor={secondaryActionColor}
        isSecondaryActionDisabled={isSecondaryActionDisabled}
        onBookmarkToggle={onBookmarkToggle}
        onSecondaryAction={onSecondaryAction}
        onManageTags={onManageTags}
        onShare={onShare}
        onOpenLink={onOpenLink}
        useAnimatedContainer={useAnimatedActions}
      />

      {item.summary && (
        <DescriptionContainer style={styles.descriptionContainer}>
          <ItemDetailDescription summary={item.summary} label={descriptionLabel} colors={colors} />
        </DescriptionContainer>
      )}
    </>
  );
}
