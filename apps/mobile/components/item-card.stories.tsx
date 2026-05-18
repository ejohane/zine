import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Spacing } from '@/constants/theme';
import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { itemCardFixtures } from '@/components/storybook/fixtures';
import { getFeaturedGridItemWidth, getFeaturedGridRows } from '@/lib/home-layout';
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
  args: {
    item: itemCardFixtures.article,
    shape: 'row',
    rowStyle: 'featured',
  },
  render: function Render(args) {
    const { width } = useWindowDimensions();
    const featuredGridItemWidth = getFeaturedGridItemWidth(width - Spacing.md * 2, Spacing.md);
    const items = [itemCardFixtures.article, itemCardFixtures.video];

    return (
      <View style={styles.featuredGrid}>
        {getFeaturedGridRows(items).map((row) => (
          <View key={row.map((item) => item.id).join(':')} style={styles.featuredGridRow}>
            {row.map((item) => (
              <View
                key={item.id}
                style={[styles.featuredGridItem, { width: featuredGridItemWidth }]}
              >
                <ItemCard {...args} item={item} />
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  },
};

export const Stack: Story = {
  args: {
    item: itemCardFixtures.video,
    shape: 'stack',
  },
};

export const StackSizing: Story = {
  render: () => (
    <ScrollView
      horizontal
      contentContainerStyle={styles.horizontalStack}
      showsHorizontalScrollIndicator={false}
    >
      <ItemCard item={itemCardFixtures.video} shape="stack" onPress={() => {}} />
      <ItemCard item={itemCardFixtures.article} shape="stack" onPress={() => {}} />
    </ScrollView>
  ),
};

export const Cover: Story = {
  args: {
    item: itemCardFixtures.video,
    shape: 'cover',
  },
};

export const CreatorImageFallback: Story = {
  render: function Render() {
    const { width } = useWindowDimensions();
    const featuredGridItemWidth = getFeaturedGridItemWidth(width - Spacing.md * 2, Spacing.md);

    return (
      <ScrollView contentContainerStyle={styles.stack} showsVerticalScrollIndicator={false}>
        <ItemCard item={itemCardFixtures.creatorFallback} shape="row" onPress={() => {}} />
        <View style={styles.featuredGrid}>
          <View style={[styles.featuredGridItem, { width: featuredGridItemWidth }]}>
            <ItemCard
              item={itemCardFixtures.creatorFallback}
              shape="row"
              rowStyle="featured"
              onPress={() => {}}
            />
          </View>
        </View>
        <ItemCard item={itemCardFixtures.creatorFallback} shape="stack" onPress={() => {}} />
        <ItemCard item={itemCardFixtures.creatorFallback} shape="cover" onPress={() => {}} />
      </ScrollView>
    );
  },
};

export const ContentStress: Story = {
  render: function Render() {
    const { width } = useWindowDimensions();
    const featuredGridItemWidth = getFeaturedGridItemWidth(width - Spacing.md * 2, Spacing.md);

    return (
      <ScrollView contentContainerStyle={styles.stack} showsVerticalScrollIndicator={false}>
        <ItemCard item={itemCardFixtures.stress} shape="row" onPress={() => {}} />
        <View style={styles.featuredGrid}>
          <View style={[styles.featuredGridItem, { width: featuredGridItemWidth }]}>
            <ItemCard
              item={itemCardFixtures.stress}
              shape="row"
              rowStyle="featured"
              onPress={() => {}}
            />
          </View>
        </View>
        <ItemCard item={itemCardFixtures.stress} shape="stack" onPress={() => {}} />
        <ItemCard item={itemCardFixtures.stress} shape="cover" onPress={() => {}} />
      </ScrollView>
    );
  },
};

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.md,
  },
  horizontalStack: {
    gap: Spacing.md,
  },
  featuredGrid: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
  },
  featuredGridRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  featuredGridItem: {
    minWidth: 0,
  },
});
