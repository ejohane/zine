import type { Meta, StoryObj } from '@storybook/react-native';
import { Colors } from '@/constants/theme';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { subscriptionFixtures } from '@/components/storybook/fixtures';
import { ChannelItem } from './channel-item';

const baseChannel = subscriptionFixtures.channels[0];

const meta = {
  title: 'Subscriptions/ChannelItem',
  component: ChannelItem,
  args: {
    channel: baseChannel,
    provider: 'YOUTUBE',
    colors: Colors.dark,
    mode: 'single',
  },
  decorators: [createDarkCanvasDecorator()],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof ChannelItem>;

export default meta;

type Story = StoryObj<typeof meta>;

export const MultiSelect: Story = {
  render: () => (
    <ChannelItem
      channel={baseChannel}
      provider="YOUTUBE"
      mode="multi"
      colors={Colors.dark}
      isSelected={true}
      onToggle={() => {}}
    />
  ),
};

export const SingleAction: Story = {
  render: () => (
    <ChannelItem
      channel={baseChannel}
      provider="SPOTIFY"
      mode="single"
      colors={Colors.dark}
      onSubscribe={() => {}}
    />
  ),
};

export const Subscribing: Story = {
  render: () => (
    <ChannelItem
      channel={baseChannel}
      provider="YOUTUBE"
      mode="single"
      colors={Colors.dark}
      isSubscribing={true}
      onSubscribe={() => {}}
    />
  ),
};

export const Subscribed: Story = {
  render: () => (
    <ChannelItem
      channel={{ ...baseChannel, isSubscribed: true }}
      provider="YOUTUBE"
      mode="single"
      colors={Colors.dark}
      isAlreadySubscribed={true}
      onSubscribe={() => {}}
    />
  ),
};
