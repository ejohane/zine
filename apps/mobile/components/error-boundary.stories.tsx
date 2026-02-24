import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

import { ErrorBoundary } from './error-boundary';

function Crash({ message }: { message: string }) {
  throw new Error(message);
}

function RecoveryContent({ resetKeyValue }: { resetKeyValue: number }) {
  if (resetKeyValue === 0) {
    throw new Error('Initial render failed. Change reset key to recover.');
  }

  return (
    <View style={styles.successBox}>
      <Text style={styles.successText}>Recovered after reset key change.</Text>
    </View>
  );
}

function ResetKeysDemo() {
  const [resetKeyValue, setResetKeyValue] = useState(0);

  return (
    <View style={styles.demoStack}>
      <Pressable onPress={() => setResetKeyValue(1)} style={styles.controlButton}>
        <Text style={styles.controlButtonText}>Change Reset Key</Text>
      </Pressable>
      <View style={styles.boundaryFrame}>
        <ErrorBoundary resetKeys={[resetKeyValue]} colorScheme="dark">
          <RecoveryContent resetKeyValue={resetKeyValue} />
        </ErrorBoundary>
      </View>
    </View>
  );
}

const meta = {
  title: 'Boundary/ErrorBoundary',
  component: ErrorBoundary,
  decorators: [createDarkCanvasDecorator({ height: 520, padding: Spacing.md })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof ErrorBoundary>;

export default meta;

type Story = StoryObj<typeof meta>;

export const DefaultFallback: Story = {
  render: () => (
    <View style={styles.boundaryFrame}>
      <ErrorBoundary colorScheme="dark">
        <Crash message="Render crashed while loading component tree." />
      </ErrorBoundary>
    </View>
  ),
};

export const CustomFallback: Story = {
  render: () => (
    <View style={styles.boundaryFrame}>
      <ErrorBoundary
        fallback={
          <View style={styles.customFallback}>
            <Text style={styles.customFallbackTitle}>Custom Recovery UI</Text>
            <Text style={styles.customFallbackBody}>
              This boundary can render custom fallback surfaces per feature area.
            </Text>
          </View>
        }
      >
        <Crash message="Custom fallback test error." />
      </ErrorBoundary>
    </View>
  ),
};

export const ResetKeys: Story = {
  render: () => <ResetKeysDemo />,
};

const styles = StyleSheet.create({
  boundaryFrame: {
    minHeight: 320,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.dark.card,
  },
  customFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.sm,
    backgroundColor: Colors.dark.card,
  },
  customFallbackTitle: {
    ...Typography.titleMedium,
    color: Colors.dark.text,
    fontWeight: '700',
  },
  customFallbackBody: {
    ...Typography.bodyMedium,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
  },
  demoStack: {
    gap: Spacing.md,
  },
  controlButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.dark.primary,
  },
  controlButtonText: {
    ...Typography.labelMedium,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  successBox: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: Spacing.xl,
  },
  successText: {
    ...Typography.bodyMedium,
    color: Colors.dark.text,
  },
});
