import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Sidebar, type SidebarItem } from './Sidebar';
import { 
  Home, 
  Bookmark, 
  Rss, 
  Settings, 
  User,
  FileText,
  Folder,
  Star,
  Clock,
  Archive
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../../ui/avatar';
import { Button } from '../../ui/button';

const meta: Meta<typeof Sidebar> = {
  title: 'Navigation/Sidebar',
  component: Sidebar,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'floating', 'overlay'],
    },
    collapsed: {
      control: { type: 'boolean' },
    },
    collapsible: {
      control: { type: 'boolean' },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const sampleItems: SidebarItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: <Home className="h-4 w-4" />,
    active: true,
  },
  {
    id: 'bookmarks',
    label: 'Bookmarks',
    icon: <Bookmark className="h-4 w-4" />,
    badge: 12,
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    icon: <Rss className="h-4 w-4" />,
    badge: 3,
  },
  {
    id: 'collections',
    label: 'Collections',
    icon: <Folder className="h-4 w-4" />,
    children: [
      {
        id: 'favorites',
        label: 'Favorites',
        icon: <Star className="h-4 w-4" />,
      },
      {
        id: 'recent',
        label: 'Recent',
        icon: <Clock className="h-4 w-4" />,
      },
      {
        id: 'archive',
        label: 'Archive',
        icon: <Archive className="h-4 w-4" />,
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Settings className="h-4 w-4" />,
  },
];

export const Default: Story = {
  args: {
    items: sampleItems,
  },
};

export const Collapsible: Story = {
  args: {
    items: sampleItems,
    collapsible: true,
  },
};

export const WithHeaderAndFooter: Story = {
  args: {
    items: sampleItems,
    collapsible: true,
    header: (
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 bg-primary rounded" />
        <span className="font-bold text-lg">Zine</span>
      </div>
    ),
    footer: (
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src="https://github.com/shadcn.png" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">John Doe</p>
          <p className="text-xs text-muted-foreground truncate">john@example.com</p>
        </div>
      </div>
    ),
  },
};

export const FloatingVariant: Story = {
  args: {
    variant: 'floating',
    items: sampleItems,
    collapsible: true,
  },
  render: (args) => (
    <div className="flex h-screen">
      <Sidebar {...args} />
      <div className="flex-1 p-8 ml-64">
        <h1 className="text-2xl font-bold mb-4">Main Content</h1>
        <p>The sidebar is in floating mode and appears above the content.</p>
      </div>
    </div>
  ),
};

export const OverlayVariant: Story = {
  args: {
    variant: 'overlay',
    items: sampleItems,
    collapsed: false,
  },
  render: (args) => (
    <div className="flex h-screen">
      <Sidebar {...args} />
      <div className="flex-1 p-8">
        <h1 className="text-2xl font-bold mb-4">Main Content</h1>
        <p>The sidebar is in overlay mode with a backdrop.</p>
      </div>
    </div>
  ),
};

export const CompleteExample: Story = {
  render: () => {
    const [collapsed, setCollapsed] = useState(false);
    
    return (
      <div className="flex h-screen bg-background">
        <Sidebar
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          collapsible
          items={[
            {
              id: 'dashboard',
              label: 'Dashboard',
              icon: <Home className="h-4 w-4" />,
              active: true,
            },
            {
              id: 'content',
              label: 'Content',
              icon: <FileText className="h-4 w-4" />,
              children: [
                {
                  id: 'bookmarks',
                  label: 'Bookmarks',
                  icon: <Bookmark className="h-4 w-4" />,
                  badge: 24,
                },
                {
                  id: 'subscriptions',
                  label: 'Subscriptions',
                  icon: <Rss className="h-4 w-4" />,
                  badge: 5,
                },
              ],
            },
            {
              id: 'organize',
              label: 'Organize',
              icon: <Folder className="h-4 w-4" />,
              children: [
                {
                  id: 'tags',
                  label: 'Tags',
                  badge: 15,
                },
                {
                  id: 'collections',
                  label: 'Collections',
                  badge: 8,
                },
              ],
            },
            {
              id: 'account',
              label: 'Account',
              icon: <User className="h-4 w-4" />,
              children: [
                {
                  id: 'profile',
                  label: 'Profile',
                },
                {
                  id: 'settings',
                  label: 'Settings',
                },
              ],
            },
          ]}
          header={
            !collapsed && (
              <div className="flex items-center gap-2">
                <Bookmark className="h-6 w-6 text-primary" />
                <span className="font-bold text-xl">Zine</span>
              </div>
            )
          }
          footer={
            <div className="space-y-2">
              {!collapsed && (
                <Button variant="outline" className="w-full justify-start">
                  <User className="h-4 w-4 mr-2" />
                  Profile
                </Button>
              )}
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">John Doe</p>
                    <p className="text-xs text-muted-foreground truncate">john@example.com</p>
                  </div>
                )}
              </div>
            </div>
          }
        />
        <div className="flex-1 p-8 overflow-auto">
          <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
          <p className="text-gray-600 mb-8">
            Welcome back! Here's what's happening with your content.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="p-6 border rounded-lg">
                <h3 className="font-semibold mb-2">Card {i}</h3>
                <p className="text-sm text-muted-foreground">
                  Sample content for card {i}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
};