import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Spacing } from '@/constants/theme';
import { Surface } from './surface';
import { Text } from './text';

const meta = {
  title: 'Primitives/Surface',
  component: Surface,
  decorators: [createDarkCanvasDecorator({ padding: Spacing.xl })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof Surface>;

export default meta;

type Story = StoryObj<typeof meta>;

const tones = [
  'canvas',
  'subtle',
  'elevated',
  'raised',
  'success',
  'warning',
  'error',
  'info',
] as const;

export const Tones: Story = {
  render: () => (
    <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
      {tones.map((tone) => (
        <Surface
          key={tone}
          tone={tone}
          border={tone === 'canvas' ? 'default' : 'tone'}
          padding="md"
          style={styles.panel}
        >
          <Text variant="labelSmall" tone="tertiary">
            {tone}
          </Text>
          <Text variant="titleMedium">
            {tone === 'canvas'
              ? 'Canvas surface'
              : `${tone[0].toUpperCase()}${tone.slice(1)} surface`}
          </Text>
          <Text tone="secondary">Reuse this role before introducing a one-off container fill.</Text>
        </Surface>
      ))}
    </ScrollView>
  ),
};

export const RadiusAndElevation: Story = {
  render: () => (
    <View style={styles.stack}>
      <Surface tone="subtle" border="subtle" radius="md" padding="md">
        <Text variant="titleSmall">Subtle / md radius</Text>
        <Text tone="secondary">Compact grouped rows or low-emphasis containers.</Text>
      </Surface>
      <Surface tone="elevated" border="default" radius="lg" padding="lg" shadow="md">
        <Text variant="titleSmall">Elevated / lg radius</Text>
        <Text tone="secondary">Primary cards and interactive modules.</Text>
      </Surface>
      <Surface tone="raised" border="default" radius="xl" padding="lg">
        <Text variant="titleSmall">Raised / xl radius</Text>
        <Text tone="secondary">Selected, pressed, or stronger separation states.</Text>
      </Surface>
      <Surface tone="error" border="tone" radius="2xl" padding="lg">
        <Text variant="titleSmall" tone="error">
          Error / tone border
        </Text>
        <Text tone="secondary">
          Status surfaces should still feel like part of the same system.
        </Text>
      </Surface>
    </View>
  ),
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingBottom: Spacing['3xl'],
  },
  stack: {
    gap: Spacing.sm,
    paddingBottom: Spacing['3xl'],
  },
  panel: {
    width: '48%',
    minWidth: 160,
    gap: Spacing.sm,
  },
});
