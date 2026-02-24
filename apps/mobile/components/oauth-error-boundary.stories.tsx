import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, Text, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { OAuthErrorCode } from '@/lib/oauth-errors';

import { OAuthErrorBoundary } from './oauth-error-boundary';

const meta = {
  title: 'Boundary/OAuthErrorBoundary',
  component: OAuthErrorBoundary,
  decorators: [createDarkCanvasDecorator({ height: 460, padding: Spacing.md })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof OAuthErrorBoundary>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Recoverable: Story = {
  render: () => (
    <OAuthErrorBoundary
      provider="YOUTUBE"
      error="Network request failed while connecting your account."
      onRetry={() => {}}
    >
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>OAuth content</Text>
      </View>
    </OAuthErrorBoundary>
  ),
};

export const Fatal: Story = {
  render: () => (
    <OAuthErrorBoundary
      provider="GMAIL"
      error={{
        code: OAuthErrorCode.PROVIDER_ERROR,
        message: 'OAuth configuration is invalid for this provider.',
        recoverable: false,
        action: 'contact_support',
      }}
    >
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>OAuth content</Text>
      </View>
    </OAuthErrorBoundary>
  ),
};

const styles = StyleSheet.create({
  placeholder: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.card,
  },
  placeholderText: {
    ...Typography.bodyMedium,
    color: Colors.dark.textSecondary,
  },
});
