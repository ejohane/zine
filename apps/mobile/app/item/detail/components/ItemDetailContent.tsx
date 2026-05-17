import type { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Surface } from '@/components/primitives/surface';

import { styles } from '../../item-detail-styles';
import type {
  ItemDetailColors,
  ItemDetailCreator,
  ItemDetailEnrichment,
  ItemDetailItem,
} from '../types';
import { ItemDetailActions } from './ItemDetailActions';
import { ItemDetailCreatorRow } from './ItemDetailCreatorRow';
import { ItemDetailDescription } from './ItemDetailDescription';
import { ItemDetailHeader } from './ItemDetailHeader';
import { ItemDetailMetaRow } from './ItemDetailMetaRow';
import { ItemDetailOtherBookmarks } from './ItemDetailOtherBookmarks';
import { ItemDetailPeopleCard } from './ItemDetailPeopleCard';

type ItemDetailContentProps = {
  item: ItemDetailItem;
  enrichment?: ItemDetailEnrichment;
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
  onPersonPress?: (personId: string) => void;
  otherUnfinishedBookmarks?: ItemDetailItem[];
  onOtherBookmarkPress?: (id: string) => void;
  useAnimatedDescription: boolean;
  useAnimatedActions: boolean;
  onContentLayout?: (contentTopY: number) => void;
  onTitleLayout?: (titleOffsetY: number) => void;
};

export function ItemDetailContent({
  item,
  enrichment,
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
  onPersonPress,
  otherUnfinishedBookmarks = [],
  onOtherBookmarkPress,
  useAnimatedActions,
  useAnimatedDescription,
  onContentLayout,
  onTitleLayout,
}: ItemDetailContentProps) {
  const DescriptionContainer = useAnimatedDescription ? Animated.View : View;
  const shouldExpandDescriptionByDefault = otherUnfinishedBookmarks.length === 0;

  return (
    <>
      <Animated.View
        style={styles.contentContainer}
        onLayout={({ nativeEvent }) => onContentLayout?.(nativeEvent.layout.y)}
      >
        <ItemDetailHeader item={item} colors={colors} onTitleLayout={onTitleLayout} />
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

      <ItemDetailPeopleCard
        item={item}
        enrichment={enrichment}
        colors={colors}
        onPersonPress={onPersonPress}
      />

      {item.summary && (
        <DescriptionContainer style={styles.descriptionContainer}>
          <Surface
            tone="subtle"
            radius="lg"
            padding="lg"
            colors={colors}
            style={styles.descriptionSurface}
          >
            <ItemDetailDescription
              summary={item.summary}
              label={descriptionLabel}
              colors={colors}
              expandedByDefault={shouldExpandDescriptionByDefault}
            />
          </Surface>
        </DescriptionContainer>
      )}

      {onOtherBookmarkPress && (
        <ItemDetailOtherBookmarks
          bookmarks={otherUnfinishedBookmarks}
          colors={colors}
          onBookmarkPress={onOtherBookmarkPress}
        />
      )}
    </>
  );
}
