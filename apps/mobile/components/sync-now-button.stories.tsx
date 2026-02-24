import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, Text, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

import { SyncNowButton } from './sync-now-button';

const meta = {
  title: 'Dev/SyncNowButton',
  component: SyncNowButton,
  args: {
    subscriptionId: 'sub-storybook-sync',
  },
  decorators: [createDarkCanvasDecorator({ height: 520, padding: Spacing.md })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof SyncNowButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const States: Story = {
  render: (args) => (
    <View style={styles.stack}>
      <View style={styles.cardFrame}>
        <Text style={styles.label}>Full - Ready</Text>
        <SyncNowButton
          {...args}
          stateOverride={{
            isLoading: false,
            cooldownSeconds: 0,
            lastResult: null,
            syncNow: () => {},
          }}
        />
      </View>

      <View style={styles.cardFrame}>
        <Text style={styles.label}>Full - Loading</Text>
        <SyncNowButton
          {...args}
          stateOverride={{
            isLoading: true,
            cooldownSeconds: 0,
            lastResult: null,
            syncNow: () => {},
          }}
        />
      </View>

      <View style={styles.cardFrame}>
        <Text style={styles.label}>Full - Cooldown + Result</Text>
        <SyncNowButton
          {...args}
          stateOverride={{
            isLoading: false,
            cooldownSeconds: 125,
            lastResult: {
              success: true,
              itemsFound: 3,
              message: 'Found 3 new items',
            },
            syncNow: () => {},
          }}
        />
      </View>

      <View style={styles.cardFrame}>
        <Text style={styles.label}>Compact - Ready / Cooldown</Text>
        <View style={styles.inlineRow}>
          <SyncNowButton
            {...args}
            compact={true}
            stateOverride={{
              isLoading: false,
              cooldownSeconds: 0,
              lastResult: null,
              syncNow: () => {},
            }}
          />
          <SyncNowButton
            {...args}
            compact={true}
            stateOverride={{
              isLoading: false,
              cooldownSeconds: 42,
              lastResult: null,
              syncNow: () => {},
            }}
          />
        </View>
      </View>
    </View>
  ),
};

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.md,
  },
  cardFrame: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.dark.card,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  label: {
    ...Typography.labelMedium,
    color: Colors.dark.textSecondary,
  },
});
