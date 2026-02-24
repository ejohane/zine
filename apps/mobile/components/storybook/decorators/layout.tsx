import type { PropsWithChildren, ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

interface StoryCanvasProps extends PropsWithChildren {
  padding?: number;
  height?: number;
}

export function StoryCanvas({ children, padding = Spacing.lg, height }: StoryCanvasProps) {
  return (
    <View style={[styles.base, height ? { height } : styles.flex, { padding }]}>{children}</View>
  );
}

interface DecoratorOptions {
  padding?: number;
  height?: number;
}

type StoryRender = () => ReactElement;

export function createDarkCanvasDecorator(options: DecoratorOptions = {}) {
  function DarkCanvasDecorator(Story: StoryRender) {
    return (
      <StoryCanvas padding={options.padding} height={options.height}>
        <Story />
      </StoryCanvas>
    );
  }

  DarkCanvasDecorator.displayName = 'DarkCanvasDecorator';

  return DarkCanvasDecorator;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.dark.background,
  },
  flex: {
    flex: 1,
  },
});
