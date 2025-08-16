import type { Meta, StoryObj } from '@storybook/react';
import { Progress } from './Progress';
import { Stack } from '../../layout/Stack';

const meta: Meta<typeof Progress> = {
  title: 'Feedback/Progress',
  component: Progress,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'xl'],
    },
    variant: {
      control: { type: 'select' },
      options: ['default', 'success', 'warning', 'error'],
    },
    value: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
    },
    showValue: {
      control: { type: 'boolean' },
    },
    indeterminate: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 60,
    max: 100,
  },
};

export const WithLabel: Story = {
  args: {
    value: 75,
    label: 'Upload progress',
    showValue: true,
  },
};

export const Sizes: Story = {
  render: () => (
    <Stack gap={6}>
      <div>
        <p className="text-sm text-gray-600 mb-2">Small</p>
        <Progress size="sm" value={25} />
      </div>
      <div>
        <p className="text-sm text-gray-600 mb-2">Medium</p>
        <Progress size="md" value={50} />
      </div>
      <div>
        <p className="text-sm text-gray-600 mb-2">Large</p>
        <Progress size="lg" value={75} />
      </div>
      <div>
        <p className="text-sm text-gray-600 mb-2">Extra Large</p>
        <Progress size="xl" value={90} />
      </div>
    </Stack>
  ),
};

export const Variants: Story = {
  render: () => (
    <Stack gap={6}>
      <Progress variant="default" value={60} label="Default" showValue />
      <Progress variant="success" value={100} label="Success" showValue />
      <Progress variant="warning" value={75} label="Warning" showValue />
      <Progress variant="error" value={30} label="Error" showValue />
    </Stack>
  ),
};

export const Indeterminate: Story = {
  args: {
    indeterminate: true,
    label: 'Loading...',
  },
};

export const RealWorldExample: Story = {
  render: () => (
    <Stack gap={8}>
      <div className="p-6 border rounded-lg">
        <h3 className="font-semibold mb-4">File Upload</h3>
        <Stack gap={4}>
          <Progress value={100} variant="success" label="document.pdf" showValue />
          <Progress value={65} label="image.jpg" showValue />
          <Progress value={30} label="video.mp4" showValue />
          <Progress indeterminate label="Processing..." />
        </Stack>
      </div>
      
      <div className="p-6 border rounded-lg">
        <h3 className="font-semibold mb-4">Storage Usage</h3>
        <Stack gap={4}>
          <Progress value={45} max={100} label="Documents" showValue />
          <Progress value={78} max={100} variant="warning" label="Images" showValue />
          <Progress value={95} max={100} variant="error" label="Videos" showValue />
        </Stack>
      </div>
    </Stack>
  ),
};