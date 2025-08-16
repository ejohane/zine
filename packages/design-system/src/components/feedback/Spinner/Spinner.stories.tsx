import type { Meta, StoryObj } from '@storybook/react';
import { Spinner } from './Spinner';
import { Flex } from '../../layout/Flex';

const meta: Meta<typeof Spinner> = {
  title: 'Feedback/Spinner',
  component: Spinner,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'xl'],
    },
    color: {
      control: { type: 'select' },
      options: ['primary', 'secondary', 'muted', 'white', 'current'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    size: 'md',
    color: 'primary',
  },
};

export const Sizes: Story = {
  render: () => (
    <Flex gap={8} align="center">
      <div className="text-center">
        <Spinner size="sm" />
        <p className="mt-2 text-sm text-gray-600">Small</p>
      </div>
      <div className="text-center">
        <Spinner size="md" />
        <p className="mt-2 text-sm text-gray-600">Medium</p>
      </div>
      <div className="text-center">
        <Spinner size="lg" />
        <p className="mt-2 text-sm text-gray-600">Large</p>
      </div>
      <div className="text-center">
        <Spinner size="xl" />
        <p className="mt-2 text-sm text-gray-600">Extra Large</p>
      </div>
    </Flex>
  ),
};

export const Colors: Story = {
  render: () => (
    <Flex gap={8} align="center">
      <div className="text-center">
        <Spinner color="primary" />
        <p className="mt-2 text-sm text-gray-600">Primary</p>
      </div>
      <div className="text-center">
        <Spinner color="secondary" />
        <p className="mt-2 text-sm text-gray-600">Secondary</p>
      </div>
      <div className="text-center">
        <Spinner color="muted" />
        <p className="mt-2 text-sm text-gray-600">Muted</p>
      </div>
      <div className="text-center p-4 bg-gray-800 rounded">
        <Spinner color="white" />
        <p className="mt-2 text-sm text-white">White</p>
      </div>
    </Flex>
  ),
};

export const WithText: Story = {
  render: () => (
    <Flex direction="col" gap={4} align="center">
      <Flex gap={2} align="center">
        <Spinner size="sm" />
        <span>Loading...</span>
      </Flex>
      <Flex gap={2} align="center">
        <Spinner size="md" color="primary" />
        <span className="text-lg">Processing your request</span>
      </Flex>
    </Flex>
  ),
};