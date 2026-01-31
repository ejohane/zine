import { Stack } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import type { EdgeInsets } from 'react-native-safe-area-context';

import ParallaxScrollView from '@/components/ParallaxScrollView';

import { styles } from '../../item-detail-styles';
import type { ItemDetailColors } from '../types';
import { ItemDetailFloatingBack } from './ItemDetailFloatingBack';

type ItemDetailLayoutBaseProps = {
  colors: ItemDetailColors;
  insets: EdgeInsets;
  onBack: () => void;
  children: ReactNode;
};

export function ItemDetailParallaxLayout({
  colors,
  insets,
  onBack,
  children,
  headerImage,
  headerAspectRatio,
}: ItemDetailLayoutBaseProps & {
  headerImage: ReactElement;
  headerAspectRatio: number;
}) {
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: '', headerShown: false }} />

      <Animated.View style={styles.animatedContainer}>
        <ParallaxScrollView headerImage={headerImage} headerAspectRatio={headerAspectRatio}>
          {children}
        </ParallaxScrollView>
      </Animated.View>

      <ItemDetailFloatingBack colors={colors} insets={insets} onBack={onBack} />
    </View>
  );
}

export function ItemDetailScrollLayout({
  colors,
  insets,
  onBack,
  children,
}: ItemDetailLayoutBaseProps) {
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: '', headerShown: false }} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 56 }]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      <ItemDetailFloatingBack colors={colors} insets={insets} onBack={onBack} />
    </View>
  );
}
