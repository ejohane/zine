import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, View } from 'react-native';

import { Colors, ContentColors, Spacing } from '@/constants/theme';
import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { FilterChip } from './filter-chip';

const meta = {
  title: 'Primitives/FilterChip',
  component: FilterChip,
  args: {
    label: 'Podcasts',
    isSelected: false,
    dotColor: ContentColors.podcast,
    onPress: () => {},
  },
  decorators: [createDarkCanvasDecorator()],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof FilterChip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Selected: Story = {
  args: {
    label: 'Videos',
    isSelected: true,
    selectedColor: Colors.dark.primary,
  },
};

export const WithCount: Story = {
  args: {
    label: 'Articles',
    count: 42,
    dotColor: ContentColors.article,
  },
};

export const SmallVsMedium: Story = {
  render: () => (
    <View style={styles.group}>
      <View style={styles.row}>
        <FilterChip
          label="Podcasts"
          isSelected={false}
          size="small"
          dotColor={ContentColors.podcast}
          onPress={() => {}}
        />
        <FilterChip
          label="Podcasts"
          isSelected={true}
          size="small"
          count={12}
          selectedColor={Colors.dark.primary}
          onPress={() => {}}
        />
      </View>
      <View style={styles.row}>
        <FilterChip
          label="Articles"
          isSelected={false}
          size="medium"
          dotColor={ContentColors.article}
          onPress={() => {}}
        />
        <FilterChip
          label="Articles"
          isSelected={true}
          size="medium"
          count={7}
          selectedColor={Colors.dark.primary}
          onPress={() => {}}
        />
      </View>
    </View>
  ),
};

const styles = StyleSheet.create({
  group: {
    gap: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
});
