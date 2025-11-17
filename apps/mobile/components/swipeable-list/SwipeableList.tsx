import { useState, useCallback, useRef } from 'react';
import { FlatList } from 'react-native';
import { SwipeableRow } from './SwipeableRow';
import type { SwipeableListProps } from './types';

export function SwipeableList<T>({
  data,
  renderItem,
  keyExtractor,
  getLeftActions,
  getRightActions,
  enableHaptics = true,
  onRefresh,
  refreshing,
  onEndReached,
  onEndReachedThreshold,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
}: SwipeableListProps<T>) {
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);
  const [closeSignal, setCloseSignal] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  // Close currently open row
  const closeOpenRow = useCallback(() => {
    if (openRowKey) {
      setCloseSignal((prev) => prev + 1);
      setOpenRowKey(null);
    }
  }, [openRowKey]);

  // Handle row opening
  const handleRowOpen = useCallback(
    (rowKey: string) => {
      if (openRowKey && openRowKey !== rowKey) {
        // Close the currently open row
        setCloseSignal((prev) => prev + 1);
      }
      setOpenRowKey(rowKey);
    },
    [openRowKey]
  );

  // Handle row closing
  const handleRowClose = useCallback((rowKey: string) => {
    setOpenRowKey((current) => (current === rowKey ? null : current));
  }, []);

  // Handle scroll - close open row
  const handleScroll = useCallback(() => {
    closeOpenRow();
  }, [closeOpenRow]);

  const renderSwipeableItem = useCallback(
    ({ item, index }: { item: T; index: number }) => {
      const rowKey = keyExtractor(item, index);
      const leftActions = getLeftActions?.(item) || [];
      const rightActions = getRightActions?.(item) || [];

      return (
        <SwipeableRow
          rowKey={rowKey}
          leftActions={leftActions}
          rightActions={rightActions}
          onOpen={() => handleRowOpen(rowKey)}
          onClose={() => handleRowClose(rowKey)}
          closeSignal={openRowKey === rowKey ? 0 : closeSignal}
          enableHaptics={enableHaptics}
        >
          {renderItem({ item, index })}
        </SwipeableRow>
      );
    },
    [
      keyExtractor,
      getLeftActions,
      getRightActions,
      handleRowOpen,
      handleRowClose,
      openRowKey,
      closeSignal,
      enableHaptics,
      renderItem,
    ]
  );

  return (
    <FlatList
      ref={flatListRef}
      data={data}
      renderItem={renderSwipeableItem}
      keyExtractor={keyExtractor}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      onRefresh={onRefresh}
      refreshing={refreshing}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      ListHeaderComponent={ListHeaderComponent as any}
      ListFooterComponent={ListFooterComponent as any}
      ListEmptyComponent={ListEmptyComponent as any}
    />
  );
}
