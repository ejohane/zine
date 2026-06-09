import BottomSheet, { BottomSheetView } from '@expo/ui/community/bottom-sheet';
import { type ReactElement } from 'react';
import { StyleSheet } from 'react-native';

type ItemCollectionsBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  backgroundColor: string;
  children: ReactElement;
};

export function ItemCollectionsBottomSheet({
  visible,
  onClose,
  backgroundColor,
  children,
}: ItemCollectionsBottomSheetProps) {
  return (
    <BottomSheet
      index={visible ? 0 : -1}
      onClose={onClose}
      snapPoints={['75%', '100%']}
      enablePanDownToClose
      enableDynamicSizing={false}
      backgroundStyle={{ backgroundColor }}
    >
      <BottomSheetView style={[styles.content, { backgroundColor }]}>{children}</BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
});
