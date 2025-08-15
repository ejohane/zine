import type { Meta, StoryObj } from '@storybook/react'
import { QuickActionButton } from './QuickActionButton'
import { Plus, Upload, Download, Share2, Settings, Camera } from 'lucide-react'

const meta = {
  title: 'Navigation/QuickActionButton',
  component: QuickActionButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'secondary'],
      description: 'Button variant style',
    },
    loading: {
      control: 'boolean',
      description: 'Show loading state',
    },
  },
} satisfies Meta<typeof QuickActionButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    icon: <Plus className="w-6 h-6" />,
    label: 'Add New',
    onClick: () => console.log('Add clicked'),
  },
}

export const Primary: Story = {
  args: {
    icon: <Upload className="w-6 h-6" />,
    label: 'Upload',
    variant: 'primary',
    onClick: () => console.log('Upload clicked'),
  },
}

export const Secondary: Story = {
  args: {
    icon: <Download className="w-6 h-6" />,
    label: 'Download',
    variant: 'secondary',
    onClick: () => console.log('Download clicked'),
  },
}

export const Loading: Story = {
  args: {
    icon: <Share2 className="w-6 h-6" />,
    label: 'Processing...',
    loading: true,
  },
}

export const Grid: Story = {
  args: {
    icon: <Plus className="w-6 h-6" />,
    label: 'Add New',
  },
  render: () => (
    <div className="grid grid-cols-2 gap-3 p-4 bg-background rounded-lg">
      <QuickActionButton
        icon={<Plus className="w-6 h-6" />}
        label="Add New"
        onClick={() => console.log('Add clicked')}
      />
      <QuickActionButton
        icon={<Upload className="w-6 h-6" />}
        label="Upload"
        onClick={() => console.log('Upload clicked')}
      />
      <QuickActionButton
        icon={<Camera className="w-6 h-6" />}
        label="Capture"
        onClick={() => console.log('Capture clicked')}
      />
      <QuickActionButton
        icon={<Settings className="w-6 h-6" />}
        label="Settings"
        onClick={() => console.log('Settings clicked')}
      />
    </div>
  ),
}

export const Variants: Story = {
  args: {
    icon: <Plus className="w-6 h-6" />,
    label: 'Default',
  },
  render: () => (
    <div className="flex gap-3 p-4 bg-background rounded-lg">
      <QuickActionButton
        icon={<Plus className="w-6 h-6" />}
        label="Default"
        variant="default"
      />
      <QuickActionButton
        icon={<Upload className="w-6 h-6" />}
        label="Primary"
        variant="primary"
      />
      <QuickActionButton
        icon={<Download className="w-6 h-6" />}
        label="Secondary"
        variant="secondary"
      />
    </div>
  ),
}