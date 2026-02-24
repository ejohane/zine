import type { ComponentType } from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import {
  ArchiveIcon,
  ArticleIcon,
  BookmarkIcon,
  BookmarkOutlineIcon,
  CheckIcon,
  CheckOutlineIcon,
  CheckboxIcon,
  ChevronRightIcon,
  FilterIcon,
  HeadphonesIcon,
  InboxArrowIcon,
  PlayIcon,
  PlusCircleIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  SparklesIcon,
  SubscriptionsIcon,
  VideoIcon,
} from './index';

type IconProps = {
  size?: number;
  color?: string;
};

type IconEntry = {
  label: string;
  Icon: ComponentType<IconProps>;
};

const iconEntries: IconEntry[] = [
  { label: 'Article', Icon: ArticleIcon },
  { label: 'Headphones', Icon: HeadphonesIcon },
  { label: 'Video', Icon: VideoIcon },
  { label: 'Checkbox', Icon: CheckboxIcon },
  { label: 'ChevronRight', Icon: ChevronRightIcon },
  { label: 'Archive', Icon: ArchiveIcon },
  { label: 'Bookmark', Icon: BookmarkIcon },
  { label: 'BookmarkOutline', Icon: BookmarkOutlineIcon },
  { label: 'Check', Icon: CheckIcon },
  { label: 'CheckOutline', Icon: CheckOutlineIcon },
  { label: 'Filter', Icon: FilterIcon },
  { label: 'Play', Icon: PlayIcon },
  { label: 'Plus', Icon: PlusIcon },
  { label: 'PlusCircle', Icon: PlusCircleIcon },
  { label: 'Search', Icon: SearchIcon },
  { label: 'Settings', Icon: SettingsIcon },
  { label: 'Share', Icon: ShareIcon },
  { label: 'InboxArrow', Icon: InboxArrowIcon },
  { label: 'Sparkles', Icon: SparklesIcon },
  { label: 'Subscriptions', Icon: SubscriptionsIcon },
];

function IconGallery({ size, color }: Required<IconProps>) {
  return (
    <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
      {iconEntries.map(({ label, Icon }) => (
        <View
          key={label}
          style={[styles.cell, { backgroundColor: Colors.dark.backgroundSecondary }]}
        >
          <Icon size={size} color={color} />
          <Text style={[styles.label, { color: Colors.dark.textSecondary }]}>{label}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const meta = {
  title: 'Primitives/Icons',
  component: ArticleIcon,
  args: {
    size: 24,
    color: '#FFFFFF',
  },
  argTypes: {
    size: {
      control: { type: 'range', min: 12, max: 48, step: 2 },
    },
    color: {
      control: { type: 'color' },
    },
  },
  decorators: [createDarkCanvasDecorator()],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof ArticleIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Gallery: Story = {
  render: ({ size, color }) => <IconGallery size={size ?? 24} color={color ?? '#FFFFFF'} />,
};

export const Sizes: Story = {
  render: ({ color }) => (
    <View style={styles.sizesContainer}>
      {[16, 24, 32, 40].map((size) => (
        <View
          key={size}
          style={[styles.sizeRow, { backgroundColor: Colors.dark.backgroundSecondary }]}
        >
          <Text style={[styles.sizeLabel, { color: Colors.dark.textSecondary }]}>{size}px</Text>
          <View style={styles.sizeIconRow}>
            <SearchIcon size={size} color={color ?? '#FFFFFF'} />
            <PlayIcon size={size} color={color ?? '#FFFFFF'} />
            <BookmarkIcon size={size} color={color ?? '#FFFFFF'} />
          </View>
        </View>
      ))}
    </View>
  ),
};

export const ColorContrast: Story = {
  render: () => (
    <View style={styles.contrastContainer}>
      <View style={[styles.contrastPanel, { backgroundColor: '#111827' }]}>
        <Text style={styles.contrastLabel}>Dark Surface</Text>
        <View style={styles.contrastIcons}>
          <SearchIcon size={28} color="#FFFFFF" />
          <FilterIcon size={28} color="#FFFFFF" />
          <SettingsIcon size={28} color="#FFFFFF" />
        </View>
      </View>
      <View style={[styles.contrastPanel, { backgroundColor: '#F8FAFC' }]}>
        <Text style={[styles.contrastLabel, { color: '#111827' }]}>Light Surface</Text>
        <View style={styles.contrastIcons}>
          <SearchIcon size={28} color="#111827" />
          <FilterIcon size={28} color="#111827" />
          <SettingsIcon size={28} color="#111827" />
        </View>
      </View>
    </View>
  ),
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  cell: {
    width: '31%',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  label: {
    ...Typography.labelSmall,
    textTransform: 'none',
    letterSpacing: 0,
    textAlign: 'center',
  },
  sizesContainer: {
    gap: Spacing.sm,
  },
  sizeRow: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sizeLabel: {
    ...Typography.labelMedium,
  },
  sizeIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  contrastContainer: {
    gap: Spacing.md,
  },
  contrastPanel: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  contrastLabel: {
    ...Typography.labelMedium,
    color: '#FFFFFF',
  },
  contrastIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
});
