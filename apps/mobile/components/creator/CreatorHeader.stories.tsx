import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { creatorProfileFixture } from '@/components/storybook/fixtures';
import { Colors, Radius, Spacing } from '@/constants/theme';

import { CreatorHeader } from './CreatorHeader';

const meta = {
  title: 'Creator/CreatorHeader',
  component: CreatorHeader,
  decorators: [createDarkCanvasDecorator({ height: 420, padding: Spacing.md })],
  args: {
    creator: creatorProfileFixture,
  },
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof CreatorHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Subscribable: Story = {
  render: (args) => (
    <View style={styles.cardFrame}>
      <CreatorHeader
        {...args}
        subscriptionStateOverride={{
          isSubscribed: false,
          canSubscribe: true,
          isSubscribing: false,
          subscribe: () => {},
        }}
      />
    </View>
  ),
};

export const AlreadySubscribed: Story = {
  render: (args) => (
    <View style={styles.cardFrame}>
      <CreatorHeader
        {...args}
        subscriptionStateOverride={{
          isSubscribed: true,
          canSubscribe: false,
          isSubscribing: false,
        }}
      />
    </View>
  ),
};

export const RequiresConnection: Story = {
  render: (args) => (
    <View style={styles.cardFrame}>
      <CreatorHeader
        {...args}
        subscriptionStateOverride={{
          isSubscribed: false,
          canSubscribe: false,
          isSubscribing: false,
          reason: 'NOT_CONNECTED',
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
