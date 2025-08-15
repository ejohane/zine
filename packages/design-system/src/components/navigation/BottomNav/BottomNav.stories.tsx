import type { Meta, StoryObj } from '@storybook/react'
import { BottomNav } from './BottomNav'
import { Home, Search, Library, User, Plus } from 'lucide-react'

const meta = {
  title: 'Navigation/BottomNav',
  component: BottomNav,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    activeColor: {
      control: 'text',
      description: 'Color class for active nav items',
    },
  },
} satisfies Meta<typeof BottomNav>

export default meta
type Story = StoryObj<typeof meta>

const defaultItems = [
  {
    icon: <Home className="w-5 h-5" />,
    label: 'Home',
    isActive: true,
    onClick: () => console.log('Home clicked'),
  },
  {
    icon: <Search className="w-5 h-5" />,
    label: 'Search',
    onClick: () => console.log('Search clicked'),
  },
  {
    icon: <Library className="w-5 h-5" />,
    label: 'Library',
    onClick: () => console.log('Library clicked'),
  },
  {
    icon: <User className="w-5 h-5" />,
    label: 'Profile',
    onClick: () => console.log('Profile clicked'),
  },
]

export const Default: Story = {
  args: {
    items: defaultItems,
  },
  render: (args) => (
    <div className="h-screen bg-background relative">
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Page Content</h1>
        <p className="text-muted-foreground">
          The bottom navigation is fixed at the bottom of the viewport.
        </p>
      </div>
      <BottomNav {...args} />
    </div>
  ),
}

export const FiveItems: Story = {
  args: {
    items: [
      ...defaultItems,
      {
        icon: <Plus className="w-5 h-5" />,
        label: 'Add',
        onClick: () => console.log('Add clicked'),
      },
    ],
  },
  render: (args) => (
    <div className="h-screen bg-background relative">
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Five Navigation Items</h1>
        <p className="text-muted-foreground">
          The navigation supports up to 5 items comfortably.
        </p>
      </div>
      <BottomNav {...args} />
    </div>
  ),
}

export const ThreeItems: Story = {
  args: {
    items: defaultItems.slice(0, 3),
  },
  render: (args) => (
    <div className="h-screen bg-background relative">
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Three Navigation Items</h1>
        <p className="text-muted-foreground">
          Works well with fewer items too.
        </p>
      </div>
      <BottomNav {...args} />
    </div>
  ),
}

export const CustomActiveColor: Story = {
  args: {
    items: defaultItems,
    activeColor: 'text-green-500',
  },
  render: (args) => (
    <div className="h-screen bg-background relative">
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Custom Active Color</h1>
        <p className="text-muted-foreground">
          The active item uses a custom green color.
        </p>
      </div>
      <BottomNav {...args} />
    </div>
  ),
}