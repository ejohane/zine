import type { Meta, StoryObj } from '@storybook/react-native';
import type { JSX } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

import ParallaxScrollView from './ParallaxScrollView';

function SafeAreaDecorator(Story: () => JSX.Element) {
  return (
    <SafeAreaProvider>
      <Story />
    </SafeAreaProvider>
  );
}

SafeAreaDecorator.displayName = 'SafeAreaDecorator';

function HeaderBlock({ label }: { label: string }) {
  return (
    <View style={styles.headerBlock}>
      <Text style={styles.headerText}>{label}</Text>
    </View>
  );
}

function DemoContent() {
  return (
    <View style={styles.contentStack}>
      <Text style={styles.sectionTitle}>Overview</Text>
      <Text style={styles.bodyText}>
        This story demonstrates parallax behavior with deterministic static content.
      </Text>
      <Text style={styles.sectionTitle}>Design Notes</Text>
      <Text style={styles.bodyText}>
        Header opacity and scale shift while the content remains readable on dark backgrounds.
      </Text>
      <Text style={styles.sectionTitle}>Stress</Text>
      <Text style={styles.bodyText}>
        Long body text confirms layout stability across nested content sections and line wrapping.
      </Text>
      <Text style={styles.bodyText}>
        Building a design system in Storybook means validating edge cases before wiring live data.
      </Text>
    </View>
  );
}

const meta = {
  title: 'Layout/Parallax',
  component: ParallaxScrollView,
  decorators: [SafeAreaDecorator, createDarkCanvasDecorator({ padding: 0, height: 720 })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof ParallaxScrollView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ParallaxScrollView headerImage={<HeaderBlock label="Square Header" />}>
      <DemoContent />
    </ParallaxScrollView>
  ),
};

export const WideHeader: Story = {
  render: () => (
    <ParallaxScrollView
      headerImage={<HeaderBlock label="16:9 Header" />}
      headerAspectRatio={16 / 9}
    >
      <DemoContent />
    </ParallaxScrollView>
  ),
};

export const StaticContent: Story = {
  render: () => (
    <ParallaxScrollView
      headerImage={<HeaderBlock label="Static Header" />}
      headerAspectRatio={16 / 9}
      scrollEnabled={false}
    >
      <DemoContent />
    </ParallaxScrollView>
  ),
};

const styles = StyleSheet.create({
  headerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
  },
  headerText: {
    ...Typography.titleMedium,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  contentStack: {
    backgroundColor: Colors.dark.card,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
    minHeight: 520,
  },
  sectionTitle: {
    ...Typography.titleSmall,
    color: Colors.dark.text,
    marginTop: Spacing.sm,
  },
  bodyText: {
    ...Typography.bodyMedium,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
  },
});
