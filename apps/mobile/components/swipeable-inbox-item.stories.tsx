import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { itemCardFixtures } from '@/components/storybook/fixtures';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

import { SwipeableInboxItem } from './swipeable-inbox-item';

function SwipeableHarness({ prompt }: { prompt: string }) {
  const [lastAction, setLastAction] = useState('No actions yet');

  return (
    <View style={styles.stack}>
      <Text style={styles.promptText}>{prompt}</Text>
      <Text style={styles.statusText}>Last action: {lastAction}</Text>
      <View style={styles.cardFrame}>
        <SwipeableInboxItem
          item={itemCardFixtures.video}
          onArchive={(id) => setLastAction(`Archived ${id}`)}
          onBookmark={(id) => setLastAction(`Saved ${id}`)}
          index={0}
        />
      </View>
    </View>
  );
}

const meta = {
  title: 'Interactions/SwipeableInbox',
  component: SwipeableInboxItem,
  decorators: [createDarkCanvasDecorator({ height: 380, padding: Spacing.md })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof SwipeableInboxItem>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <SwipeableHarness prompt="Swipe right to archive and left to save." />,
};

export const ArchivePath: Story = {
  render: () => <SwipeableHarness prompt="Archive path: swipe right until release threshold." />,
};

export const BookmarkPath: Story = {
  render: () => <SwipeableHarness prompt="Bookmark path: swipe left until release threshold." />,
};

export const AccessibilityActions: Story = {
  render: () => (
    <SwipeableHarness prompt="Use VoiceOver actions: 'Save to Library' or 'Archive' on this row." />
  ),
};

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.sm,
  },
  promptText: {
    ...Typography.bodySmall,
    color: Colors.dark.textSecondary,
  },
  statusText: {
    ...Typography.labelMedium,
    color: Colors.dark.text,
  },
  cardFrame: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.dark.card,
  },
});
