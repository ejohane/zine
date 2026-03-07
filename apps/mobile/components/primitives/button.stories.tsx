import type { Meta, StoryObj } from '@storybook/react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { SearchIcon } from '@/components/icons';
import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { Button } from './button';
import { Surface } from './surface';
import { Text } from './text';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: {
    label: 'Save changes',
    onPress: () => {},
  },
  decorators: [createDarkCanvasDecorator({ padding: Spacing.xl })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <View style={styles.stack}>
      <Button label="Primary action" variant="primary" onPress={() => {}} />
      <Button label="Secondary action" variant="secondary" onPress={() => {}} />
      <Button label="Outline action" variant="outline" onPress={() => {}} />
      <Button label="Ghost action" variant="ghost" onPress={() => {}} />
      <Button label="Danger action" variant="outline" tone="danger" onPress={() => {}} />
    </View>
  ),
};

export const StatesAndSizes: Story = {
  render: () => (
    <View style={styles.stack}>
      <View style={styles.row}>
        <Button label="Small" size="sm" onPress={() => {}} />
        <Button label="Medium" size="md" onPress={() => {}} />
        <Button label="Large" size="lg" onPress={() => {}} />
      </View>
      <View style={styles.row}>
        <Button label="Loading" loading onPress={() => {}} />
        <Button label="Disabled" disabled onPress={() => {}} />
      </View>
    </View>
  ),
};

export const AccessoriesAndLayout: Story = {
  render: () => (
    <ScrollView contentContainerStyle={styles.stack} showsVerticalScrollIndicator={false}>
      <Button
        label="Search library"
        variant="secondary"
        fullWidth
        leadingAccessory={<SearchIcon size={18} color={Colors.dark.textPrimary} />}
        onPress={() => {}}
      />
      <Button
        label="Sync now"
        fullWidth
        leadingAccessory={<Text variant="labelMedium">⟳</Text>}
        trailingAccessory={
          <Text variant="labelSmall" tone="overlayMuted">
            fast
          </Text>
        }
        onPress={() => {}}
      />
      <Surface tone="subtle" border="subtle" padding="lg" style={styles.noteCard}>
        <Text variant="titleSmall">Usage notes</Text>
        <Text tone="secondary">
          Start with variant and size. Only reach for direct style overrides when the component
          needs a provider-specific fill or an intentionally different shape.
        </Text>
      </Surface>
    </ScrollView>
  ),
};

const styles = StyleSheet.create({
  stack: {
    gap: Spacing.sm,
    paddingBottom: Spacing['3xl'],
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  noteCard: {
    gap: Spacing.sm,
    borderRadius: Radius.xl,
  },
});
