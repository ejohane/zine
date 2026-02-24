import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, Text, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { creatorCollectionFixtures } from '@/components/storybook/fixtures';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

import { CreatorBookmarks } from './CreatorBookmarks';

const meta = {
  title: 'Creator/CreatorBookmarks',
  component: CreatorBookmarks,
  decorators: [createDarkCanvasDecorator({ height: 500, padding: Spacing.md })],
  args: {
    creatorId: 'creator-design-weekly',
  },
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof CreatorBookmarks>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  render: (args) => (
    <View style={styles.cardFrame}>
      <CreatorBookmarks
        {...args}
        stateOverride={{
          bookmarks: creatorCollectionFixtures.bookmarks,
          isLoading: false,
          isFetchingNextPage: false,
          hasNextPage: false,
        }}
      />
    </View>
  ),
};

export const Empty: Story = {
  render: (args) => (
    <View style={styles.emptyFrame}>
      <Text style={styles.emptyHint}>
        Section intentionally hidden when bookmark list is empty.
      </Text>
      <CreatorBookmarks
        {...args}
        stateOverride={{
          bookmarks: [],
          isLoading: false,
          isFetchingNextPage: false,
          hasNextPage: false,
        }}
      />
    </View>
  ),
};

export const Error: Story = {
  render: (args) => (
    <View style={styles.cardFrame}>
      <CreatorBookmarks
        {...args}
        stateOverride={{
          bookmarks: [],
          isLoading: false,
          isFetchingNextPage: false,
          hasNextPage: false,
          error: new Error('Failed to load bookmarks.'),
          refetch: () => {},
        }}
      />
    </View>
  ),
};

const styles = StyleSheet.create({
  cardFrame: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.dark.card,
    overflow: 'hidden',
  },
  emptyFrame: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.dark.card,
    padding: Spacing.lg,
    minHeight: 180,
  },
  emptyHint: {
    ...Typography.bodySmall,
    color: Colors.dark.textSecondary,
  },
});
