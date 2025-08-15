import type { Meta, StoryObj } from '@storybook/react'
import { QuickActionGrid } from './QuickActionGrid'
import { Plus, Upload, Download, Share2, Settings, Camera, Mic, Video } from 'lucide-react'

const meta = {
  title: 'Navigation/QuickActionGrid',
  component: QuickActionGrid,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    columns: {
      control: 'object',
      description: 'Number of columns at different breakpoints',
    },
  },
} satisfies Meta<typeof QuickActionGrid>

export default meta
type Story = StoryObj<typeof meta>

const defaultActions = [
  {
    id: '1',
    icon: <Plus className="w-6 h-6" />,
    label: 'Add New',
    onClick: () => console.log('Add clicked'),
  },
  {
    id: '2',
    icon: <Upload className="w-6 h-6" />,
    label: 'Upload',
    onClick: () => console.log('Upload clicked'),
  },
  {
    id: '3',
    icon: <Camera className="w-6 h-6" />,
    label: 'Capture',
    onClick: () => console.log('Capture clicked'),
  },
  {
    id: '4',
    icon: <Settings className="w-6 h-6" />,
    label: 'Settings',
    onClick: () => console.log('Settings clicked'),
  },
]

export const Default: Story = {
  args: {
    actions: defaultActions,
  },
}

export const TwoByTwo: Story = {
  args: {
    actions: defaultActions,
    columns: 2,
  },
}

export const Responsive: Story = {
  args: {
    actions: defaultActions,
    columns: { sm: 2, md: 4, lg: 4 },
  },
}

export const ManyActions: Story = {
  args: {
    actions: [
      ...defaultActions,
      {
        id: '5',
        icon: <Download className="w-6 h-6" />,
        label: 'Download',
        onClick: () => console.log('Download clicked'),
      },
      {
        id: '6',
        icon: <Share2 className="w-6 h-6" />,
        label: 'Share',
        onClick: () => console.log('Share clicked'),
      },
      {
        id: '7',
        icon: <Mic className="w-6 h-6" />,
        label: 'Record',
        onClick: () => console.log('Record clicked'),
      },
      {
        id: '8',
        icon: <Video className="w-6 h-6" />,
        label: 'Video',
        onClick: () => console.log('Video clicked'),
      },
    ],
    columns: { sm: 2, md: 4 },
  },
}

export const MixedVariants: Story = {
  args: {
    actions: [
      {
        id: '1',
        icon: <Plus className="w-6 h-6" />,
        label: 'Add New',
        variant: 'primary' as const,
        onClick: () => console.log('Add clicked'),
      },
      {
        id: '2',
        icon: <Upload className="w-6 h-6" />,
        label: 'Upload',
        onClick: () => console.log('Upload clicked'),
      },
      {
        id: '3',
        icon: <Camera className="w-6 h-6" />,
        label: 'Capture',
        variant: 'secondary' as const,
        onClick: () => console.log('Capture clicked'),
      },
      {
        id: '4',
        icon: <Settings className="w-6 h-6" />,
        label: 'Settings',
        onClick: () => console.log('Settings clicked'),
      },
    ],
  },
}

export const WithLoading: Story = {
  args: {
    actions: [
      {
        id: '1',
        icon: <Plus className="w-6 h-6" />,
        label: 'Add New',
        onClick: () => console.log('Add clicked'),
      },
      {
        id: '2',
        icon: <Upload className="w-6 h-6" />,
        label: 'Uploading...',
        loading: true,
      },
      {
        id: '3',
        icon: <Camera className="w-6 h-6" />,
        label: 'Capture',
        onClick: () => console.log('Capture clicked'),
      },
      {
        id: '4',
        icon: <Settings className="w-6 h-6" />,
        label: 'Settings',
        onClick: () => console.log('Settings clicked'),
      },
    ],
  },
}