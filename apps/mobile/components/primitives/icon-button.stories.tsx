import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, View } from 'react-native';

import { ArchiveIcon, BookmarkIcon, SearchIcon } from '@/components/icons';
import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Colors, Spacing } from '@/constants/theme';
import { IconButton } from './icon-button';
import { Surface } from './surface';
import { Text } from './text';

const meta = {
  title: 'Primitives/IconButton',
  component: IconButton,
  args: {
    children: null,
  },
  decorators: [createDarkCanvasDecorator({ padding: Spacing.xl })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof IconButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  args: {
    children: null,
  },
  render: () => (
    <View style={styles.row}>
      <IconButton variant="subtle" accessibilityLabel="Archive">
        <ArchiveIcon size={18} color={Colors.dark.textSecondary} />
      </IconButton>
      <IconButton variant="solid" accessibilityLabel="Save">
        <BookmarkIcon size={18} color={Colors.dark.accentForeground} />
      </IconButton>
      <IconButton variant="outline" accessibilityLabel="Search">
        <SearchIcon size={18} color={Colors.dark.textPrimary} />
      </IconButton>
      <IconButton variant="ghost" accessibilityLabel="Archive quietly">
        <ArchiveIcon size={18} color={Colors.dark.textSecondary} />
      </IconButton>
    </View>
  ),
};

export const SizesAndStates: Story = {
  args: {
    children: null,
  },
  render: () => (
    <View style={styles.stack}>
      <View style={styles.row}>
        <IconButton size="sm" accessibilityLabel="Small archive">
          <ArchiveIcon size={16} color={Colors.dark.textSecondary} />
        </IconButton>
        <IconButton size="md" accessibilityLabel="Medium archive">
          <ArchiveIcon size={20} color={Colors.dark.textSecondary} />
        </IconButton>
        <IconButton size="lg" accessibilityLabel="Large archive">
          <ArchiveIcon size={24} color={Colors.dark.textSecondary} />
        </IconButton>
      </View>
      <View style={styles.row}>
        <IconButton disabled accessibilityLabel="Disabled archive">
          <ArchiveIcon size={18} color={Colors.dark.textTertiary} />
        </IconButton>
        <IconButton tone="danger" variant="outline" accessibilityLabel="Remove item">
          <ArchiveIcon size={18} color={Colors.dark.statusError} />
        </IconButton>
      </View>
    </View>
  ),
};

export const InContext: Story = {
  args: {
    children: null,
  },
  render: () => (
    <Surface tone="elevated" border="subtle" padding="lg" style={styles.contextCard}>
      <Text variant="titleSmall">Item actions</Text>
      <Text tone="secondary">
        Icon-only controls should share size, radius, and press feedback instead of redefining the
        container every time.
      </Text>
      <View style={styles.row}>
        <IconButton variant="subtle" accessibilityLabel="Archive item">
          <ArchiveIcon size={18} color={Colors.dark.textSecondary} />
        </IconButton>
        <IconButton variant="solid" accessibilityLabel="Bookmark item">
          <BookmarkIcon size={18} color={Colors.dark.accentForeground} />
        </IconButton>
      </View>
    </Surface>
  ),
};

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  contextCard: {
    gap: Spacing.sm,
  },
});
