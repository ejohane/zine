import type { Meta, StoryObj } from '@storybook/react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

import { QueryErrorBoundary } from './query-error-boundary';

function NetworkCrash() {
  throw new Error('Network request failed: unable to reach API endpoint.');
}

function AppCrash() {
  throw new Error('Unexpected data shape returned by backend.');
}

function ResetContractDemo() {
  const [queryVersion, setQueryVersion] = useState(0);

  return (
    <View style={styles.demoStack}>
      <Pressable onPress={() => setQueryVersion(1)} style={styles.controlButton}>
        <Text style={styles.controlButtonText}>Change Query Key</Text>
      </Pressable>
      <View style={styles.boundaryFrame}>
        <QueryErrorBoundary queryKey={['creator', queryVersion]}>
          {queryVersion === 0 ? (
            <AppCrash />
          ) : (
            <View style={styles.successBox}>
              <Text style={styles.successText}>Query boundary reset after key change.</Text>
            </View>
          )}
        </QueryErrorBoundary>
      </View>
    </View>
  );
}

const meta = {
  title: 'Boundary/QueryErrorBoundary',
  component: QueryErrorBoundary,
  decorators: [createDarkCanvasDecorator({ height: 520, padding: Spacing.md })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof QueryErrorBoundary>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NetworkError: Story = {
  render: () => (
    <View style={styles.boundaryFrame}>
      <QueryErrorBoundary>
        <NetworkCrash />
      </QueryErrorBoundary>
    </View>
  ),
};

export const ApplicationError: Story = {
  render: () => (
    <View style={styles.boundaryFrame}>
      <QueryErrorBoundary fallbackMessage="Failed to process server response for this query.">
        <AppCrash />
      </QueryErrorBoundary>
    </View>
  ),
};

export const ResetKeys: Story = {
  render: () => <ResetContractDemo />,
};

const styles = StyleSheet.create({
  boundaryFrame: {
    minHeight: 320,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.dark.card,
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
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  successText: {
    ...Typography.bodyMedium,
    color: Colors.dark.text,
  },
});
