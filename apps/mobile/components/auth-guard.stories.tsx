import type { Meta, StoryObj } from '@storybook/react-native';
import { StyleSheet, Text, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

import { AuthGuard } from './auth-guard';

function ProtectedContent() {
  return (
    <View style={styles.protectedContent}>
      <Text style={styles.protectedTitle}>Protected Screen</Text>
      <Text style={styles.protectedBody}>Signed-in users can access this content.</Text>
    </View>
  );
}

function SignedOutFallback() {
  return (
    <View style={styles.fallbackContent}>
      <Text style={styles.fallbackTitle}>Redirecting to sign-in...</Text>
      <Text style={styles.fallbackBody}>Story fallback shown instead of navigation redirect.</Text>
    </View>
  );
}

const meta = {
  title: 'Boundary/AuthGuard',
  component: AuthGuard,
  decorators: [createDarkCanvasDecorator({ height: 360, padding: Spacing.md })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof AuthGuard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: () => (
    <AuthGuard authStateOverride={{ isLoaded: false, isSignedIn: false }}>
      <ProtectedContent />
    </AuthGuard>
  ),
};

export const SignedOut: Story = {
  render: () => (
    <AuthGuard
      authStateOverride={{ isLoaded: true, isSignedIn: false }}
      signedOutFallback={<SignedOutFallback />}
    >
      <ProtectedContent />
    </AuthGuard>
  ),
};

export const SignedIn: Story = {
  render: () => (
    <AuthGuard authStateOverride={{ isLoaded: true, isSignedIn: true }}>
      <ProtectedContent />
    </AuthGuard>
  ),
};

const styles = StyleSheet.create({
  protectedContent: {
    flex: 1,
    minHeight: 240,
    borderRadius: Radius.lg,
    backgroundColor: Colors.dark.card,
    padding: Spacing.xl,
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  protectedTitle: {
    ...Typography.titleMedium,
    color: Colors.dark.text,
    fontWeight: '700',
  },
  protectedBody: {
    ...Typography.bodyMedium,
    color: Colors.dark.textSecondary,
  },
  fallbackContent: {
    flex: 1,
    minHeight: 240,
    borderRadius: Radius.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.xl,
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  fallbackTitle: {
    ...Typography.titleSmall,
    color: Colors.dark.text,
    fontWeight: '600',
  },
  fallbackBody: {
    ...Typography.bodyMedium,
    color: Colors.dark.textSecondary,
  },
});
