import type { Bookmark } from '@zine/shared';
import type { ComponentType } from 'react';
import type { OpenDirection } from 'react-native-swipeable-item';

export interface BookmarkListItemProps {
  bookmark: Bookmark;
  variant?: 'compact' | 'comfortable' | 'media-rich';
  onPress?: (bookmarkId: string) => void;
  showThumbnail?: boolean;
  showMetadata?: boolean;
  showPublishDate?: boolean;
  showPlatformIcon?: boolean;
  enableHaptics?: boolean;
}

export interface BookmarkListProps {
  bookmarks: Bookmark[];
  variant?: 'compact' | 'comfortable' | 'media-rich';
  layout?: 'vertical' | 'horizontal' | 'grid';
  enableSwipeActions?: boolean;
  leftSwipeActions?: SwipeAction[];
  rightSwipeActions?: SwipeAction[];
  onBookmarkPress?: (bookmarkId: string) => void;
  ListHeaderComponent?: ComponentType<any>;
  ListFooterComponent?: ComponentType<any>;
  ListEmptyComponent?: ComponentType<any>;
  onRefresh?: () => void;
  refreshing?: boolean;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  loadingMore?: boolean;
  LoadingMoreComponent?: ComponentType<any>;
  enableHaptics?: boolean;
}

export interface SwipeAction {
  id: string;
  icon: string;
  iconColor?: string;
  backgroundColor: string;
  onPress: (bookmarkId: string) => void;
  label?: string;
}

export interface SwipeableBookmarkItemProps extends BookmarkListItemProps {
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  swipeThreshold?: number;
  overshootFriction?: number;
  enableHapticFeedback?: boolean;
}

export interface BookmarkListSkeletonProps {
  variant?: 'compact' | 'comfortable' | 'media-rich';
  layout?: 'vertical' | 'horizontal' | 'grid';
  count?: number;
}

export interface BookmarkListEmptyStateProps {
  icon?: string;
  title?: string;
  message?: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export interface BookmarkGridProps extends Omit<BookmarkListProps, 'layout'> {
  numColumns?: number;
  columnGap?: number;
  rowGap?: number;
}

export interface BookmarkListHeaderProps {
  title?: string;
  subtitle?: string;
  rightAction?: {
    label: string;
    icon?: string;
    onPress: () => void;
  };
}

export interface SwipeChangeParams {
  openDirection: OpenDirection;
  snapPoint: number;
}

export interface SwipeableBookmarkItemV2Props extends BookmarkListItemProps {
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  onSwipeChange?: (params: SwipeChangeParams) => void;
  swipeEnabled?: boolean;
  activationThreshold?: number;
  swipeDamping?: number;
  enableHapticFeedback?: boolean;
}
