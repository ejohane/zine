import { BottomSheet, Group, Host, RNHostView } from '@expo/ui/swift-ui';
import {
  background,
  frame,
  ignoreSafeArea,
  presentationBackground,
  presentationBackgroundInteraction,
  presentationDetents,
  presentationDragIndicator,
  type PresentationDetent,
} from '@expo/ui/swift-ui/modifiers';
import { Fragment, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

const initialDetent: PresentationDetent = { fraction: 0.75 };

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
  const { height, width } = useWindowDimensions();
  const [selectedDetent, setSelectedDetent] = useState<PresentationDetent>(initialDetent);

  useEffect(() => {
    if (visible) {
      setSelectedDetent(initialDetent);
    }
  }, [visible]);

  const modifiers = useMemo(
    () => [
      frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
      background(backgroundColor),
      ignoreSafeArea({ regions: 'all', edges: 'bottom' }),
      presentationDetents([initialDetent, 'large'], {
        selection: selectedDetent,
        onSelectionChange: setSelectedDetent,
      }),
      presentationDragIndicator('visible'),
      presentationBackground(backgroundColor),
      presentationBackgroundInteraction({ type: 'enabledUpThrough', detent: initialDetent }),
    ],
    [backgroundColor, selectedDetent]
  );

  return (
    <Fragment>
      {visible ? (
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          style={[styles.backdropPressTarget, { height, width }]}
        />
      ) : null}
      <Host
        colorScheme="dark"
        ignoreSafeArea="all"
        pointerEvents="box-none"
        style={[styles.host, { height, width }]}
      >
        <BottomSheet
          isPresented={visible}
          onIsPresentedChange={(isPresented) => {
            if (!isPresented) {
              onClose();
            }
          }}
          fitToContents={false}
        >
          <Group modifiers={modifiers}>
            <RNHostView>
              <View style={[styles.content, { backgroundColor }]}>{children}</View>
            </RNHostView>
          </Group>
        </BottomSheet>
      </Host>
    </Fragment>
  );
}

const styles = StyleSheet.create({
  backdropPressTarget: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  host: {
    position: 'absolute',
    zIndex: 2,
  },
  content: {
    flex: 1,
  },
});
