import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, Text, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

import { SyncStatusIndicator } from './sync-status-indicator';

const meta = {
  title: 'Dev/SyncStatusIndicator',
  component: SyncStatusIndicator,
  decorators: [createDarkCanvasDecorator({ height: 280, padding: Spacing.md })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof SyncStatusIndicator>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PendingCounts: Story = {
  render: () => (
    <View style={styles.stack}>
      <View style={styles.row}>
        <Text style={styles.label}>1 pending change</Text>
        <SyncStatusIndicator pendingCountOverride={1} />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>5 pending changes</Text>
        <SyncStatusIndicator pendingCountOverride={5} />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>24 pending changes</Text>
        <SyncStatusIndicator pendingCountOverride={24} />
      </View>
    </View>
  ),
};

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.md,
  },
  row: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.dark.card,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    ...Typography.bodySmall,
    color: Colors.dark.textSecondary,
  },
});
