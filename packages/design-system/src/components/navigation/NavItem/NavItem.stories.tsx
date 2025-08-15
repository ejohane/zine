import type { Meta, StoryObj } from '@storybook/react'
import { NavItem } from './NavItem'
import { Home, Search, Library, User } from 'lucide-react'

const meta = {
  title: 'Navigation/NavItem',
  component: NavItem,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    isActive: {
      control: 'boolean',
      description: 'Whether the nav item is active',
    },
    activeColor: {
      control: 'text',
      description: 'Color class for active state',
    },
  },
} satisfies Meta<typeof NavItem>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    icon: <Home className="w-5 h-5" />,
    label: 'Home',
    isActive: false,
  },
}

export const Active: Story = {
  args: {
    icon: <Home className="w-5 h-5" />,
    label: 'Home',
    isActive: true,
  },
}

export const CustomActiveColor: Story = {
  args: {
    icon: <Search className="w-5 h-5" />,
    label: 'Search',
    isActive: true,
    activeColor: 'text-green-500',
  },
}

export const Group: Story = {
  args: {
    icon: <Home className="w-5 h-5" />,
    label: 'Home',
  },
  render: () => (
    <div className="flex gap-2 bg-background p-4 rounded-lg border">
      <NavItem icon={<Home className="w-5 h-5" />} label="Home" isActive />
      <NavItem icon={<Search className="w-5 h-5" />} label="Search" />
      <NavItem icon={<Library className="w-5 h-5" />} label="Library" />
      <NavItem icon={<User className="w-5 h-5" />} label="Profile" />
    </div>
  ),
}