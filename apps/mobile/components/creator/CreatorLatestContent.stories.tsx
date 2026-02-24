import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { creatorLatestContentFixtures } from '@/components/storybook/fixtures';
import { Colors, Radius, Spacing } from '@/constants/theme';

import { CreatorLatestContent } from './CreatorLatestContent';

const meta = {
  title: 'Creator/CreatorLatestContent',
  component: CreatorLatestContent,
  decorators: [createDarkCanvasDecorator({ height: 520, padding: Spacing.md })],
  args: {
    creatorId: 'creator-design-weekly',
    provider: 'YOUTUBE',
  },
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof CreatorLatestContent>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: (args) => (
    <View style={styles.cardFrame}>
      <CreatorLatestContent
        {...args}
        stateOverride={{
          content: [],
          isLoading: true,
        }}
      />
    </View>
  ),
};

export const NotConnected: Story = {
  render: (args) => (
    <View style={styles.cardFrame}>
      <CreatorLatestContent
        {...args}
        stateOverride={{
          content: [],
          reason: 'NOT_CONNECTED',
          connectUrl: 'https://zine.app/connect/youtube',
          isLoading: false,
        }}
      />
    </View>
  ),
};

export const TokenExpired: Story = {
  render: (args) => (
    <View style={styles.cardFrame}>
      <CreatorLatestContent
        {...args}
        stateOverride={{
          content: [],
          reason: 'TOKEN_EXPIRED',
          connectUrl: 'https://zine.app/reconnect/youtube',
          isLoading: false,
        }}
      />
    </View>
  ),
};

export const Loaded: Story = {
  render: (args) => (
    <View style={styles.cardFrame}>
      <CreatorLatestContent
        {...args}
        stateOverride={{
          content: creatorLatestContentFixtures.loaded,
          cacheStatus: 'HIT',
          isLoading: false,
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
