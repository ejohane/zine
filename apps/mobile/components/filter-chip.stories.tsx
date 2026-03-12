import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, View } from 'react-native';

import { FilterChipPalette, Spacing } from '@/constants/theme';
import {
  ArticleIcon,
  CheckOutlineIcon,
  HeadphonesIcon,
  PostIcon,
  VideoIcon,
} from '@/components/icons';
import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { FilterChip } from './filter-chip';

const meta = {
  title: 'Primitives/FilterChip',
  component: FilterChip,
  args: {
    label: 'Podcasts',
    isSelected: false,
    icon: HeadphonesIcon,
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
    icon: VideoIcon,
    selectedColor: FilterChipPalette.video.accent,
    selectedSurfaceColor: FilterChipPalette.video.surface,
  },
};

export const WithCount: Story = {
  args: {
    label: 'Articles',
    count: 42,
    icon: ArticleIcon,
  },
};

export const SuccessSelection: Story = {
  args: {
    label: 'Completed',
    count: 18,
    isSelected: true,
    icon: CheckOutlineIcon,
    selectedColor: FilterChipPalette.completed.accent,
    selectedSurfaceColor: FilterChipPalette.completed.surface,
  },
};

export const TypePalette: Story = {
  render: () => (
    <View style={styles.row}>
      <FilterChip
        label="Articles"
        isSelected={true}
        icon={ArticleIcon}
        selectedColor={FilterChipPalette.article.accent}
        selectedSurfaceColor={FilterChipPalette.article.surface}
        onPress={() => {}}
      />
      <FilterChip
        label="Podcasts"
        isSelected={true}
        icon={HeadphonesIcon}
        selectedColor={FilterChipPalette.podcast.accent}
        selectedSurfaceColor={FilterChipPalette.podcast.surface}
        onPress={() => {}}
      />
      <FilterChip
        label="Videos"
        isSelected={true}
        icon={VideoIcon}
        selectedColor={FilterChipPalette.video.accent}
        selectedSurfaceColor={FilterChipPalette.video.surface}
        onPress={() => {}}
      />
      <FilterChip
        label="Posts"
        isSelected={true}
        icon={PostIcon}
        selectedColor={FilterChipPalette.post.accent}
        selectedSurfaceColor={FilterChipPalette.post.surface}
        onPress={() => {}}
      />
    </View>
  ),
};

export const SmallVsMedium: Story = {
  render: () => (
    <View style={styles.group}>
      <View style={styles.row}>
        <FilterChip
          label="Podcasts"
          isSelected={false}
          size="small"
          icon={HeadphonesIcon}
          onPress={() => {}}
        />
        <FilterChip
          label="Podcasts"
          isSelected={true}
          size="small"
          count={12}
          icon={HeadphonesIcon}
          onPress={() => {}}
        />
      </View>
      <View style={styles.row}>
        <FilterChip
          label="Articles"
          isSelected={false}
          size="medium"
          icon={ArticleIcon}
          onPress={() => {}}
        />
        <FilterChip
          label="Articles"
          isSelected={true}
          size="medium"
          count={7}
          icon={ArticleIcon}
          onPress={() => {}}
        />
      </View>
      <View style={styles.row}>
        <FilterChip
          label="Posts"
          isSelected={false}
          size="small"
          icon={PostIcon}
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
