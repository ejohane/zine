import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { creatorCollectionFixtures } from '@/components/storybook/fixtures';
import { Colors, Radius, Spacing } from '@/constants/theme';

import { CreatorPublications } from './CreatorPublications';

const meta = {
  title: 'Creator/CreatorPublications',
  component: CreatorPublications,
  decorators: [createDarkCanvasDecorator({ height: 520, padding: Spacing.md })],
  args: {
    creatorId: 'creator-design-weekly',
  },
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof CreatorPublications>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  render: (args) => (
    <View style={styles.cardFrame}>
      <CreatorPublications
        {...args}
        stateOverride={{
          publications: creatorCollectionFixtures.publications,
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
    <View style={styles.cardFrame}>
      <CreatorPublications
        {...args}
        stateOverride={{
          publications: [],
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
      <CreatorPublications
        {...args}
        stateOverride={{
          publications: [],
          isLoading: false,
          isFetchingNextPage: false,
          hasNextPage: false,
          error: new Error('Failed to load publications.'),
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
});
