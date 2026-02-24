import type { Href } from 'expo-router';
import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, Text, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

import { ExternalLink } from './external-link';

const href = 'https://zine.app' as Href & string;

const meta = {
  title: 'Dev/ExternalLink',
  component: ExternalLink,
  decorators: [createDarkCanvasDecorator({ height: 280, padding: Spacing.md })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof ExternalLink>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NativeVsWeb: Story = {
  render: () => (
    <View style={styles.stack}>
      <View style={styles.cardFrame}>
        <Text style={styles.label}>Native branch (in-app browser)</Text>
        <ExternalLink href={href} platformOverride="native" onOpenExternal={() => {}}>
          <Text style={styles.linkText}>Open zine.app in app browser</Text>
        </ExternalLink>
      </View>

      <View style={styles.cardFrame}>
        <Text style={styles.label}>Web branch (default link behavior)</Text>
        <ExternalLink href={href} platformOverride="web">
          <Text style={styles.linkText}>Open zine.app in new tab</Text>
        </ExternalLink>
      </View>
    </View>
  ),
};

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.md,
  },
  cardFrame: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.dark.card,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  label: {
    ...Typography.bodySmall,
    color: Colors.dark.textSecondary,
  },
  linkText: {
    ...Typography.bodyMedium,
    color: Colors.dark.primary,
    textDecorationLine: 'underline',
  },
});
