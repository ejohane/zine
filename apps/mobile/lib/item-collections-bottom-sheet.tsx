import { BottomSheet, RNHostView } from '@expo/ui';
import { type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

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
      isPresented={visible}
      onDismiss={onClose}
      showDragIndicator
      snapPoints={['half', 'full']}
    >
      <RNHostView>
        <View style={[styles.content, { backgroundColor }]}>{children}</View>
      </RNHostView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
});
