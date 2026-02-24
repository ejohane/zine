import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { creatorFixtures } from '@/components/storybook/fixtures';
import { Colors, Radius, Spacing } from '@/constants/theme';

import { LatestContentCard } from './LatestContentCard';

const meta = {
  title: 'Creator/LatestContentCard',
  component: LatestContentCard,
  decorators: [createDarkCanvasDecorator({ height: 360, padding: Spacing.md })],
  args: {
    creatorId: 'creator-design-weekly',
    provider: 'YOUTUBE',
  },
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof LatestContentCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InternalNavigation: Story = {
  args: {
    item: creatorFixtures.latestContentInternal,
  },
  render: (args) => (
    <View style={styles.cardFrame}>
      <LatestContentCard {...args} />
    </View>
  ),
};

export const ExternalLink: Story = {
  args: {
    item: creatorFixtures.latestContentExternal,
  },
  render: (args) => (
    <View style={styles.cardFrame}>
      <LatestContentCard {...args} />
    </View>
  ),
};

export const Bookmarked: Story = {
  args: {
    provider: 'SPOTIFY',
    item: creatorFixtures.latestContentSaved,
  },
  render: (args) => (
    <View style={styles.cardFrame}>
      <LatestContentCard {...args} />
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
