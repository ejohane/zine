import type { Meta, StoryObj } from '@storybook/react-native';
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Colors, Spacing, Typography } from '@/constants/theme';

import { OfflineBanner } from './offline-banner';

function SafeAreaDecorator(Story: () => JSX.Element) {
  return (
    <SafeAreaProvider>
      <Story />
    </SafeAreaProvider>
  );
}

SafeAreaDecorator.displayName = 'SafeAreaDecorator';

const meta = {
  title: 'Dev/OfflineBanner',
  component: OfflineBanner,
  decorators: [SafeAreaDecorator, createDarkCanvasDecorator({ height: 280, padding: 0 })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof OfflineBanner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Offline: Story = {
  render: () => (
    <View style={styles.screen}>
      <OfflineBanner
        statusOverride={{
          isConnected: false,
          isInternetReachable: false,
        }}
        topInsetOverride={16}
      />
      <View style={styles.content}>
        <Text style={styles.title}>Inbox Screen</Text>
        <Text style={styles.body}>Banner should remain pinned and readable while offline.</Text>
      </View>
    </View>
  ),
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    marginTop: 96,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  title: {
    ...Typography.titleMedium,
    color: Colors.dark.text,
  },
  body: {
    ...Typography.bodySmall,
    color: Colors.dark.textSecondary,
  },
});
