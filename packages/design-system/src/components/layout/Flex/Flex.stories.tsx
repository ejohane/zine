import type { Meta, StoryObj } from '@storybook/react';
import { Flex } from './Flex';
import { Card } from '../../ui/card';

const meta: Meta<typeof Flex> = {
  title: 'Layout/Flex',
  component: Flex,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    flex: {
      control: { type: 'select' },
      options: ['1', 'auto', 'initial', 'none'],
    },
    direction: {
      control: { type: 'select' },
      options: ['row', 'row-reverse', 'col', 'col-reverse'],
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
    grow: {
      control: { type: 'boolean' },
    },
    shrink: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    gap: 4,
  },
  render: (args) => (
    <Flex {...args}>
      <Card className="p-4">Flex Item 1</Card>
      <Card className="p-4">Flex Item 2</Card>
      <Card className="p-4">Flex Item 3</Card>
    </Flex>
  ),
};

export const ResponsiveLayout: Story = {
  args: {
    direction: 'row',
    wrap: 'wrap',
    gap: 4,
    justify: 'between',
  },
  render: (args) => (
    <Flex {...args}>
      <Card className="p-4 flex-1 min-w-[200px]">
        <h3 className="font-semibold">Card 1</h3>
        <p className="text-sm text-gray-600">Flexible width card</p>
      </Card>
      <Card className="p-4 flex-1 min-w-[200px]">
        <h3 className="font-semibold">Card 2</h3>
        <p className="text-sm text-gray-600">Flexible width card</p>
      </Card>
      <Card className="p-4 flex-1 min-w-[200px]">
        <h3 className="font-semibold">Card 3</h3>
        <p className="text-sm text-gray-600">Flexible width card</p>
      </Card>
    </Flex>
  ),
};

export const FlexGrow: Story = {
  render: () => (
    <Flex gap={4}>
      <Card className="p-4">Fixed Width</Card>
      <Flex flex="1" className="p-4 bg-blue-50 rounded">
        <span>This item grows to fill available space</span>
      </Flex>
      <Card className="p-4">Fixed Width</Card>
    </Flex>
  ),
};

export const NestedFlex: Story = {
  render: () => (
    <Flex direction="col" gap={4} className="p-4 border rounded">
      <Flex justify="between" align="center">
        <h2 className="text-xl font-bold">Header</h2>
        <button className="px-4 py-2 bg-blue-500 text-white rounded">Action</button>
      </Flex>
      <Flex gap={4}>
        <Flex flex="1" direction="col" gap={2} className="p-4 bg-gray-50 rounded">
          <h3 className="font-semibold">Sidebar</h3>
          <p className="text-sm">Sidebar content</p>
        </Flex>
        <Flex flex="1" direction="col" gap={2} className="p-4 bg-gray-50 rounded" style={{ flex: 2 }}>
          <h3 className="font-semibold">Main Content</h3>
          <p className="text-sm">Main content area with more space</p>
        </Flex>
      </Flex>
    </Flex>
  ),
};