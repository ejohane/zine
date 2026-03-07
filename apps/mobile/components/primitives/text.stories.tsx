import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { Text } from './text';

const meta = {
  title: 'Primitives/Text',
  component: Text,
  args: {
    children: 'Shared type should feel editorial and calm.',
    variant: 'bodyMedium',
    tone: 'primary',
  },
  decorators: [createDarkCanvasDecorator({ padding: Spacing.xl })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof Text>;

export default meta;

type Story = StoryObj<typeof meta>;

const variants = [
  'displayLarge',
  'displayMedium',
  'headlineLarge',
  'headlineMedium',
  'headlineSmall',
  'titleLarge',
  'titleMedium',
  'titleSmall',
  'bodyLarge',
  'bodyMedium',
  'bodySmall',
  'labelLarge',
  'labelMedium',
  'labelSmall',
] as const;

const tones = [
  'primary',
  'secondary',
  'tertiary',
  'accent',
  'accentForeground',
  'success',
  'warning',
  'warningForeground',
  'error',
  'info',
] as const;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <ScrollView contentContainerStyle={styles.stack} showsVerticalScrollIndicator={false}>
      {variants.map((variant) => (
        <View key={variant} style={styles.card}>
          <Text variant="labelSmall" tone="tertiary">
            {variant}
          </Text>
          <Text variant={variant}>Editorial hierarchy should be obvious without noise.</Text>
        </View>
      ))}
    </ScrollView>
  ),
};

export const Tones: Story = {
  render: () => (
    <View style={styles.stack}>
      {tones.map((tone) => (
        <View key={tone} style={styles.card}>
          <Text variant="labelSmall" tone="tertiary">
            {tone}
          </Text>
          <Text tone={tone}>This is the tone sample for {tone}.</Text>
        </View>
      ))}
    </View>
  ),
};

export const FontFamilies: Story = {
  render: () => (
    <View style={styles.stack}>
      <View style={styles.card}>
        <Text variant="labelSmall" tone="tertiary">
          sans
        </Text>
        <Text font="sans">Used for most interface copy and labels.</Text>
      </View>
      <View style={styles.card}>
        <Text variant="labelSmall" tone="tertiary">
          serif
        </Text>
        <Text font="serif" variant="headlineSmall">
          Used sparingly for editorial emphasis.
        </Text>
      </View>
      <View style={styles.card}>
        <Text variant="labelSmall" tone="tertiary">
          mono
        </Text>
        <Text font="mono" tone="secondary">
          surfaceElevated / spacing.xl / motion.fast
        </Text>
      </View>
    </View>
  ),
};

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.sm,
    paddingBottom: Spacing['3xl'],
  },
  card: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
    backgroundColor: Colors.dark.surfaceElevated,
  },
});
