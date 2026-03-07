import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, View } from 'react-native';

import { BookmarkIcon, CheckIcon, SearchIcon } from '@/components/icons';
import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Colors, ContentColors, ProviderColors, Radius, Spacing } from '@/constants/theme';

import { Badge } from './badge';
import { Surface } from './surface';
import { Text } from './text';

const meta = {
  title: 'Primitives/Badge',
  component: Badge,
  args: {
    label: 'Connected',
    tone: 'success',
  },
  decorators: [createDarkCanvasDecorator({ padding: Spacing.xl })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
  render: () => (
    <View style={styles.stack}>
      <View style={styles.row}>
        <Badge label="Subtle" tone="subtle" />
        <Badge label="Neutral" tone="neutral" />
        <Badge label="Accent" tone="accent" />
      </View>
      <View style={styles.row}>
        <Badge label="Success" tone="success" />
        <Badge label="Warning" tone="warning" />
        <Badge label="Error" tone="error" />
        <Badge label="Info" tone="info" />
        <Badge label="Overlay" tone="overlay" />
      </View>
    </View>
  ),
};

export const AccessoriesAndShapes: Story = {
  render: () => (
    <View style={styles.stack}>
      <View style={styles.row}>
        <Badge
          label="Connected"
          tone="success"
          leadingAccessory={<CheckIcon size={12} color={Colors.dark.overlayForeground} />}
        />
        <Badge
          label="Saved"
          tone="success"
          shape="pill"
          leadingAccessory={<BookmarkIcon size={12} color={Colors.dark.overlayForeground} />}
        />
      </View>
      <View style={styles.row}>
        <Badge label="Rounded" tone="overlay" shape="rounded" />
        <Badge label="Pill" tone="overlay" shape="pill" />
        <Badge label="Medium" tone="subtle" size="md" />
      </View>
      <Surface tone="elevated" border="subtle" padding="lg" style={styles.noteCard}>
        <Text variant="titleSmall">Usage notes</Text>
        <Text tone="secondary">
          Use `Badge` for pill and overlay metadata treatments. Keep provider and content wrappers
          thin so cards do not invent their own spacing, radius, or label styling.
        </Text>
      </Surface>
    </View>
  ),
};

export const CustomFills: Story = {
  render: () => (
    <View style={styles.row}>
      <Badge
        label="Substack"
        shape="pill"
        backgroundColor={ProviderColors.substack}
        textTone="overlay"
        leadingAccessory={<SearchIcon size={12} color={Colors.dark.overlayForeground} />}
      />
      <Badge label="Video" backgroundColor={ContentColors.video} textTone="overlay" />
      <Badge label="Podcast" backgroundColor={ContentColors.podcast} textTone="overlay" />
    </View>
  ),
};

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  noteCard: {
    gap: Spacing.sm,
    borderRadius: Radius.xl,
  },
});
