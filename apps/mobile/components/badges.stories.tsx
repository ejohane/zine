import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { SourceBadge as SourceBadgeComponent, TypeBadge as TypeBadgeComponent } from './badges';

const sourceProviders = ['YOUTUBE', 'SPOTIFY', 'GMAIL', 'SUBSTACK', 'X', 'TWITTER', 'WEB'];
const contentTypes = ['VIDEO', 'PODCAST', 'ARTICLE', 'POST'];

const meta = {
  title: 'Primitives/Badges',
  component: SourceBadgeComponent,
  args: {
    provider: 'YOUTUBE',
  },
  decorators: [createDarkCanvasDecorator()],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof SourceBadgeComponent>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SourceBadge: Story = {
  name: 'SourceBadge',
  render: () => (
    <View style={styles.section}>
      <Text style={styles.heading}>Providers</Text>
      <View style={styles.row}>
        {sourceProviders.map((provider) => (
          <SourceBadgeComponent key={provider} provider={provider} />
        ))}
      </View>
    </View>
  ),
};

export const TypeBadge: Story = {
  name: 'TypeBadge',
  render: () => (
    <View style={styles.section}>
      <Text style={styles.heading}>Content Types</Text>
      <View style={styles.row}>
        {contentTypes.map((contentType) => (
          <TypeBadgeComponent key={contentType} contentType={contentType} />
        ))}
      </View>
    </View>
  ),
};

export const FallbackLabels: Story = {
  render: () => (
    <View style={styles.section}>
      <Text style={styles.heading}>Fallback Mapping</Text>
      <View style={styles.row}>
        <SourceBadgeComponent provider="UNKNOWN_PROVIDER" />
        <TypeBadgeComponent contentType="UNKNOWN_CONTENT_TYPE" />
      </View>
      <Text style={styles.caption}>Unknown values should resolve to safe default labels.</Text>
    </View>
  ),
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  heading: {
    ...Typography.labelLarge,
    color: Colors.dark.text,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  caption: {
    ...Typography.bodySmall,
    color: Colors.dark.textSecondary,
  },
});
