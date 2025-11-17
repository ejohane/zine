import type { ReactNode, ComponentType } from 'react';

/**
 * Defines a single swipe action that appears when the row is swiped
 */
export interface SwipeAction {
  /** Unique identifier for the action */
  key: string;
  /** Display label for the action */
  label: string;
  /** Background color for the action button */
  color: string;
  /** Optional icon to display */
  icon?: ReactNode;
  /** If true, this action can be triggered by a full swipe */
  isPrimary?: boolean;
  /** Callback when the action is pressed */
  onPress: () => void;
}

/**
 * Props for the SwipeableRow component
 */
export interface SwipeableRowProps {
  /** Unique key for the row */
  rowKey: string;
  /** Content to render in the row */
  children: ReactNode;
  /** Actions that appear when swiping left (appear on the right side) */
  leftActions?: SwipeAction[];
  /** Actions that appear when swiping right (appear on the left side) */
  rightActions?: SwipeAction[];
  /** Callback when the row opens */
  onOpen?: () => void;
  /** Callback when the row closes */
  onClose?: () => void;
  /** Signal from parent to close this row (increments to trigger close) */
  closeSignal?: number;
  /** Enable haptic feedback */
  enableHaptics?: boolean;
}

/**
 * Props for the SwipeableList component
 */
export interface SwipeableListProps<T> {
  /** Array of data items to render */
  data: T[];
  /** Function to render each item */
  renderItem: (info: { item: T; index: number }) => ReactNode;
  /** Function to extract a unique key for each item */
  keyExtractor: (item: T, index: number) => string;
  /** Function to get left actions for each item */
  getLeftActions?: (item: T) => SwipeAction[];
  /** Function to get right actions for each item */
  getRightActions?: (item: T) => SwipeAction[];
  /** Enable haptic feedback for all rows */
  enableHaptics?: boolean;
  /** Standard FlatList props */
  onRefresh?: () => void;
  refreshing?: boolean;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  ListHeaderComponent?: ComponentType<any> | ReactNode;
  ListFooterComponent?: ComponentType<any> | ReactNode;
  ListEmptyComponent?: ComponentType<any> | ReactNode;
}

/**
 * Props for the SwipeActions component
 */
export interface SwipeActionsProps {
  /** Array of actions to display */
  actions: SwipeAction[];
  /** Side where actions appear */
  side: 'left' | 'right';
  /** Current translation value of the row */
  translateX: number;
}
