import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Spacing } from '@/constants/theme';

import {
  IntegrationCard,
  SourceEmptyState,
  SourceHero,
  SourceListRow,
  SourceSearchField,
  SourceSectionHeader,
  SourceSubscriptionRow,
} from './source-ui';

const meta = {
  title: 'Subscriptions/SourceUI',
  component: SourceHero,
  decorators: [createDarkCanvasDecorator({ height: 920, padding: Spacing.lg })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof SourceHero>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <View style={styles.stack}>
      <SourceHero source="YOUTUBE" summary="Integration connected · 12 subscriptions" />
      <SourceListRow
        source="GMAIL"
        summary="Integration connected · 8 newsletters"
        onPress={() => {}}
      />
      <IntegrationCard
        source="SPOTIFY"
        state="needsAttention"
        title="Integration needs attention"
        description="Reconnect Spotify to keep podcast subscriptions syncing into your inbox."
        actionLabel="Reconnect"
        onAction={() => {}}
      />
      <SourceSectionHeader
        eyebrow="Subscriptions"
        title="Subscriptions"
        summary="12 subscriptions"
      />
      <SourceSearchField value="" onChangeText={() => {}} placeholder="Search subscriptions" />
      <SourceSubscriptionRow
        source="RSS"
        title="Example Feed"
        subtitle="https://example.com/feed.xml"
        meta="Last synced Mar 22, 2026"
        statusLabel="Active"
        primaryActionLabel="Sync now"
        onPrimaryAction={() => {}}
        secondaryActionLabel="Pause"
        onSecondaryAction={() => {}}
        tertiaryActionLabel="Remove"
        onTertiaryAction={() => {}}
      />
      <SourceEmptyState
        title="No subscriptions yet"
        message="Connect an integration or add a feed URL to get started."
      />
    </View>
  ),
};

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.md,
  },
});
