import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ErrorState,
  InvalidParamState,
  LoadingState,
  NotFoundState,
} from '@/components/list-states';

import { styles } from '../../item-detail-styles';
import type { ItemDetailColors } from '../types';

type ItemDetailStateWrapperProps = {
  colors: ItemDetailColors;
  children: ReactNode;
};

function ItemDetailStateWrapper({ colors, children }: ItemDetailStateWrapperProps) {
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: '', headerShown: false }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

export function ItemDetailInvalidParamState({
  colors,
  message,
}: {
  colors: ItemDetailColors;
  message: string;
}) {
  return (
    <ItemDetailStateWrapper colors={colors}>
      <InvalidParamState message={message} />
    </ItemDetailStateWrapper>
  );
}

export function ItemDetailLoadingState({
  colors,
  message,
}: {
  colors: ItemDetailColors;
  message: string;
}) {
  return (
    <ItemDetailStateWrapper colors={colors}>
      <LoadingState message={message} />
    </ItemDetailStateWrapper>
  );
}

export function ItemDetailErrorState({
  colors,
  message,
  onRetry,
}: {
  colors: ItemDetailColors;
  message: string;
  onRetry: () => void;
}) {
  return (
    <ItemDetailStateWrapper colors={colors}>
      <ErrorState message={message} onRetry={onRetry} />
    </ItemDetailStateWrapper>
  );
}

export function ItemDetailNotFoundState({ colors }: { colors: ItemDetailColors }) {
  return (
    <ItemDetailStateWrapper colors={colors}>
      <NotFoundState
        title="Item not found"
        message="This item may have been deleted or does not exist."
      />
    </ItemDetailStateWrapper>
  );
}
