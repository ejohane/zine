import type { Meta, StoryObj } from '@storybook/react';
import { Stack } from './Stack';
import { Card } from '../../ui/card';

const meta: Meta<typeof Stack> = {
  title: 'Layout/Stack',
  component: Stack,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    direction: {
      control: { type: 'select' },
      options: ['horizontal', 'vertical'],
    },
    align: {
      control: { type: 'select' },
      options: ['start', 'center', 'end', 'stretch', 'baseline'],
    },
    justify: {
      control: { type: 'select' },
      options: ['start', 'center', 'end', 'between', 'around', 'evenly'],
    },
    wrap: {
      control: { type: 'select' },
      options: ['wrap', 'nowrap', 'wrap-reverse'],
    },
    gap: {
      control: { type: 'select' },
      options: [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Vertical: Story = {
  args: {
    direction: 'vertical',
    gap: 4,
  },
  render: (args) => (
    <Stack {...args}>
      <Card className="p-4">Item 1</Card>
      <Card className="p-4">Item 2</Card>
      <Card className="p-4">Item 3</Card>
    </Stack>
  ),
};

export const Horizontal: Story = {
  args: {
    direction: 'horizontal',
    gap: 4,
  },
  render: (args) => (
    <Stack {...args}>
      <Card className="p-4">Item 1</Card>
      <Card className="p-4">Item 2</Card>
      <Card className="p-4">Item 3</Card>
    </Stack>
  ),
};

export const Centered: Story = {
  args: {
    direction: 'vertical',
    align: 'center',
    justify: 'center',
    gap: 4,
    className: 'min-h-[400px] border-2 border-dashed border-gray-300 rounded-lg',
  },
  render: (args) => (
    <Stack {...args}>
      <h2 className="text-2xl font-bold">Centered Content</h2>
      <p className="text-gray-600">This content is centered both horizontally and vertically</p>
      <Card className="p-4">Centered Card</Card>
    </Stack>
  ),
};

export const SpaceBetween: Story = {
  args: {
    direction: 'horizontal',
    justify: 'between',
    align: 'center',
    className: 'p-4 border rounded-lg',
  },
  render: (args) => (
    <Stack {...args}>
      <div>Left content</div>
      <div>Center content</div>
      <div>Right content</div>
    </Stack>
  ),
};

export const Wrapping: Story = {
  args: {
    direction: 'horizontal',
    wrap: 'wrap',
    gap: 4,
  },
  render: (args) => (
    <Stack {...args}>
      {Array.from({ length: 10 }, (_, i) => (
        <Card key={i} className="p-4 min-w-[150px]">
          Item {i + 1}
        </Card>
      ))}
    </Stack>
  ),
};