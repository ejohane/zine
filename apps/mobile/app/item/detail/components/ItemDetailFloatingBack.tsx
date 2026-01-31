import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { EdgeInsets } from 'react-native-safe-area-context';

import { HeaderIconButton } from '../../item-detail-components';
import { styles } from '../../item-detail-styles';
import type { ItemDetailColors } from '../types';

type ItemDetailFloatingBackProps = {
  colors: ItemDetailColors;
  insets: EdgeInsets;
  onBack: () => void;
};

export function ItemDetailFloatingBack({ colors, insets, onBack }: ItemDetailFloatingBackProps) {
  return (
    <View style={[styles.floatingHeader, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Animated.View>
        <HeaderIconButton icon="chevron-back" colors={colors} onPress={onBack} />
      </Animated.View>
    </View>
  );
}
