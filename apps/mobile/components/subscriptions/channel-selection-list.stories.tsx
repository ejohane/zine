import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { subscriptionFixtures } from '@/components/storybook/fixtures';
import { ChannelSelectionActionBar, ChannelSelectionList } from './channel-selection-list';

const meta = {
  title: 'Subscriptions/ChannelSelectionList',
  component: ChannelSelectionList,
  args: {
    provider: 'YOUTUBE',
    channels: subscriptionFixtures.channels,
    isLoading: false,
    mode: 'multi',
  },
  decorators: [createDarkCanvasDecorator({ height: 680, padding: 0 })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof ChannelSelectionList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: () => (
    <ChannelSelectionList provider="YOUTUBE" channels={[]} isLoading={true} mode="multi" />
  ),
};

export const Error: Story = {
  render: () => (
    <ChannelSelectionList
      provider="YOUTUBE"
      channels={[]}
      isLoading={false}
      error={new Error('Could not reach YouTube API')}
      onRetry={() => {}}
      mode="multi"
    />
  ),
};

export const Empty: Story = {
  render: () => (
    <ChannelSelectionList
      provider="YOUTUBE"
      channels={[]}
      isLoading={false}
      mode="multi"
      emptyTitle="No channels available"
      emptyMessage="Try again in a few minutes."
    />
  ),
};

export const MultiSelect: Story = {
  render: () => (
    <ChannelSelectionList
      provider="YOUTUBE"
      channels={subscriptionFixtures.channels}
      isLoading={false}
      mode="multi"
      selectedIds={new Set(subscriptionFixtures.selectedIds)}
      onSelectionChange={() => {}}
    />
  ),
};

export const SingleAction: Story = {
  render: () => (
    <ChannelSelectionList
      provider="SPOTIFY"
      channels={subscriptionFixtures.channels}
      isLoading={false}
      mode="single"
      onSubscribe={() => {}}
      subscribingIds={new Set(subscriptionFixtures.subscribingIds)}
      isChannelSubscribed={(id) => id === 'ch-1'}
    />
  ),
};

export const ActionBarStates: Story = {
  render: () => (
    <View style={styles.actionBarStack}>
      <ChannelSelectionActionBar
        selectedCount={3}
        provider="YOUTUBE"
        isSubscribing={false}
        onSubscribe={() => {}}
      />
      <ChannelSelectionActionBar
        selectedCount={0}
        provider="SPOTIFY"
        isSubscribing={false}
        onSubscribe={() => {}}
        onSkip={() => {}}
      />
      <ChannelSelectionActionBar
        selectedCount={2}
        provider="YOUTUBE"
        isSubscribing={true}
        onSubscribe={() => {}}
      />
    </View>
  ),
};

const styles = StyleSheet.create({
  actionBarStack: {
    gap: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
});
