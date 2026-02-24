import type { Meta, StoryObj } from '@storybook/react-native';
import { createDarkCanvasDecorator } from '@/components/storybook/decorators';

import { StorybookButton } from './storybook-button';

const meta = {
  title: 'Dev/StorybookButton',
  component: StorybookButton,
  args: {
    label: 'Hello Storybook',
  },
  decorators: [createDarkCanvasDecorator({ padding: 16 })],
} satisfies Meta<typeof StorybookButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onPress: () => {},
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    label: 'Disabled',
  },
};
