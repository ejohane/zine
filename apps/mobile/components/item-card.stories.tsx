import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { itemCardFixtures } from '@/components/storybook/fixtures';
import { ItemCard } from './item-card';

const meta = {
  title: 'Cards/ItemCard',
  component: ItemCard,
  args: {
    item: itemCardFixtures.video,
    onPress: () => {},
  },
  decorators: [createDarkCanvasDecorator()],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof ItemCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Compact: Story = {
  args: {
    item: itemCardFixtures.podcast,
    variant: 'compact',
  },
};

export const Full: Story = {
  args: {
    item: itemCardFixtures.video,
    variant: 'full',
  },
};

export const Grid: Story = {
  render: () => (
    <View style={styles.gridRow}>
      <ItemCard item={itemCardFixtures.article} variant="grid" onPress={() => {}} />
      <ItemCard item={itemCardFixtures.podcast} variant="grid" onPress={() => {}} />
    </View>
  ),
};

export const Horizontal: Story = {
  args: {
    item: itemCardFixtures.video,
    variant: 'horizontal',
  },
};

export const Large: Story = {
  args: {
    item: itemCardFixtures.podcast,
    variant: 'large',
  },
};

export const LargeOverlay: Story = {
  args: {
    item: itemCardFixtures.video,
    variant: 'large',
    overlay: true,
  },
};

export const ActionStates: Story = {
  render: () => (
    <View style={styles.stack}>
      <ItemCard
        item={itemCardFixtures.video}
        variant="full"
        showActions={true}
        onArchive={() => {}}
        onBookmark={() => {}}
        onPress={() => {}}
      />
      <ItemCard
        item={itemCardFixtures.podcast}
        variant="full"
        showActions={true}
        isBookmarking={true}
        onArchive={() => {}}
        onBookmark={() => {}}
        onPress={() => {}}
      />
      <ItemCard
        item={itemCardFixtures.article}
        variant="full"
        showActions={true}
        isArchiving={true}
        onArchive={() => {}}
        onBookmark={() => {}}
        onPress={() => {}}
      />
    </View>
  ),
};

export const ContentStress: Story = {
  render: () => (
    <ScrollView contentContainerStyle={styles.stack} showsVerticalScrollIndicator={false}>
      <ItemCard item={itemCardFixtures.stress} variant="compact" onPress={() => {}} />
      <ItemCard item={itemCardFixtures.stress} variant="horizontal" onPress={() => {}} />
      <ItemCard item={itemCardFixtures.stress} variant="full" onPress={() => {}} />
      <ItemCard item={itemCardFixtures.stress} variant="large" overlay={true} onPress={() => {}} />
    </ScrollView>
  ),
};

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.md,
  },
  gridRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
});
