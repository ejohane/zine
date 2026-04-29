import { View, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import type { EdgeInsets } from 'react-native-safe-area-context';

import { styles } from '../../item-detail-styles';
import type { ItemDetailColors } from '../types';
import { HeaderIconButton } from './ItemDetailButtons';

type ItemDetailFloatingBackProps = {
  colors: ItemDetailColors;
  insets: EdgeInsets;
  onBack: () => void;
  screenTitle: string;
  showCollapsedTitle: boolean;
};

export function ItemDetailFloatingBack({
  colors,
  insets,
  onBack,
  screenTitle,
  showCollapsedTitle,
}: ItemDetailFloatingBackProps) {
  const backdropHeight = showCollapsedTitle ? insets.top + 56 : 0;

  return (
    <View style={styles.floatingOverlay} pointerEvents="box-none">
      {backdropHeight > 0 ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(160)}
          style={[
            styles.floatingHeaderBackdrop,
            {
              backgroundColor: colors.background,
              height: backdropHeight,
            },
          ]}
          pointerEvents="none"
        />
      ) : null}

      {showCollapsedTitle ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(160)}
          style={[styles.floatingTitleContainer, { top: insets.top + 14 }]}
          pointerEvents="none"
        >
          <Text style={[styles.floatingTitle, { color: colors.text }]} numberOfLines={1}>
            {screenTitle}
          </Text>
        </Animated.View>
      ) : null}

      <View style={[styles.floatingHeader, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Animated.View>
          <HeaderIconButton icon="chevron-back" colors={colors} onPress={onBack} />
        </Animated.View>
      </View>
    </View>
  );
}
