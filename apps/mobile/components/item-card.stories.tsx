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
    shape: 'row',
  },
};

export const FeaturedRow: Story = {
  render: (args) => (
    <View style={styles.featuredGrid}>
      <View style={styles.featuredGridItem}>
        <ItemCard {...args} item={itemCardFixtures.article} shape="row" rowStyle="featured" />
      </View>
    </View>
  ),
};

export const Stack: Story = {
  args: {
    item: itemCardFixtures.video,
    shape: 'stack',
  },
};

export const Cover: Story = {
  args: {
    item: itemCardFixtures.video,
    shape: 'cover',
  },
};

export const ContentStress: Story = {
  render: () => (
    <ScrollView contentContainerStyle={styles.stack} showsVerticalScrollIndicator={false}>
      <ItemCard item={itemCardFixtures.stress} shape="row" onPress={() => {}} />
      <ItemCard item={itemCardFixtures.stress} shape="row" rowStyle="featured" onPress={() => {}} />
      <ItemCard item={itemCardFixtures.stress} shape="stack" onPress={() => {}} />
      <ItemCard item={itemCardFixtures.stress} shape="cover" onPress={() => {}} />
    </ScrollView>
  ),
};

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.md,
  },
  featuredGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  featuredGridItem: {
    flexBasis: '48%',
    flexGrow: 1,
  },
});
