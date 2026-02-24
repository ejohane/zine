import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Colors, Radius, Spacing } from '@/constants/theme';

import { SubscriptionErrorBoundary } from './subscription-error-boundary';

function SubscriptionCrash({ message }: { message: string }) {
  throw new Error(message);
}

const meta = {
  title: 'Boundary/SubscriptionErrorBoundary',
  component: SubscriptionErrorBoundary,
  decorators: [createDarkCanvasDecorator({ height: 420, padding: Spacing.md })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof SubscriptionErrorBoundary>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AuthError: Story = {
  render: () => (
    <View style={styles.boundaryFrame}>
      <SubscriptionErrorBoundary subscriptionId="sub-yt-1" provider="YOUTUBE">
        <SubscriptionCrash message="401 Unauthorized: token expired for provider sync." />
      </SubscriptionErrorBoundary>
    </View>
  ),
};

export const RetryPath: Story = {
  render: () => (
    <View style={styles.boundaryFrame}>
      <SubscriptionErrorBoundary subscriptionId="sub-sp-1" provider="SPOTIFY" onRetry={() => {}}>
        <SubscriptionCrash message="Server timeout while loading subscription metadata." />
      </SubscriptionErrorBoundary>
    </View>
  ),
};

const styles = StyleSheet.create({
  boundaryFrame: {
    minHeight: 280,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.dark.card,
    justifyContent: 'center',
    padding: Spacing.md,
  },
});
