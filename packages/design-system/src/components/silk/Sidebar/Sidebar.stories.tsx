import type { Meta, StoryObj } from '@storybook/react';
import { Sidebar, type SidebarItem } from './Sidebar';
import { Button } from '../../ui/button';
import { useState } from 'react';
import { 
  Home, 
  Search, 
  Star, 
  Settings, 
  User, 
  File, 
  Folder, 
  Image, 
  Video, 
  Music,
  Download,
  Trash2,
  Archive,
  Tag,
  Calendar,
  Clock,
  MessageSquare,
  Bell,
  Lock,
  CreditCard,
  Bookmark,
  Heart,
  Share2,
  Database,
  Monitor,
  Smartphone,
  Tablet,
  Headphones,
  Camera,
  Globe,
  Zap
} from 'lucide-react';

const meta: Meta<typeof Sidebar> = {
  title: 'Silk/Sidebar',
  component: Sidebar,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'A flexible sidebar navigation component with support for collapsing, nesting, and various configurations.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ height: '100vh', position: 'relative', display: 'flex' }}>
        <Story />
        <div className="flex-1 p-8 bg-gray-50 dark:bg-gray-900">
          <h1 className="text-2xl font-bold mb-4">Main Content Area</h1>
          <p className="text-gray-600 dark:text-gray-400">
            This is the main content area. The sidebar appears on the left side.
          </p>
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const basicItems: SidebarItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    active: true,
  },
  {
    id: 'search',
    label: 'Search',
    icon: Search,
  },
  {
    id: 'favorites',
    label: 'Favorites',
    icon: Star,
    badge: '12',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
  },
];

const fileSystemItems: SidebarItem[] = [
  {
    id: 'documents',
    label: 'Documents',
    icon: Folder,
    children: [
      {
        id: 'work',
        label: 'Work Files',
        icon: File,
        badge: '15',
      },
      {
        id: 'personal',
        label: 'Personal',
        icon: File,
        badge: '8',
      },
    ],
  },
  {
    id: 'media',
    label: 'Media',
    icon: Folder,
    children: [
      {
        id: 'photos',
        label: 'Photos',
        icon: Image,
        badge: '120',
      },
      {
        id: 'videos',
        label: 'Videos',
        icon: Video,
        badge: '45',
      },
      {
        id: 'music',
        label: 'Music',
        icon: Music,
        badge: '200',
      },
    ],
  },
  {
    id: 'downloads',
    label: 'Downloads',
    icon: Download,
    badge: '5',
  },
  {
    id: 'trash',
    label: 'Trash',
    icon: Trash2,
    badge: '3',
  },
];

const applicationItems: SidebarItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: Monitor,
    active: true,
  },
  {
    id: 'content',
    label: 'Content',
    icon: File,
    children: [
      {
        id: 'posts',
        label: 'Posts',
        icon: File,
        badge: '24',
      },
      {
        id: 'pages',
        label: 'Pages',
        icon: File,
        badge: '8',
      },
      {
        id: 'media-library',
        label: 'Media Library',
        icon: Image,
        badge: '156',
      },
    ],
  },
  {
    id: 'users',
    label: 'Users',
    icon: User,
    children: [
      {
        id: 'all-users',
        label: 'All Users',
        icon: User,
        badge: '1.2k',
      },
      {
        id: 'administrators',
        label: 'Administrators',
        icon: Lock,
        badge: '5',
      },
      {
        id: 'moderators',
        label: 'Moderators',
        icon: User,
        badge: '12',
      },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: Zap,
    badge: 'New',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    children: [
      {
        id: 'general',
        label: 'General',
        icon: Settings,
      },
      {
        id: 'security',
        label: 'Security',
        icon: Lock,
      },
      {
        id: 'billing',
        label: 'Billing',
        icon: CreditCard,
      },
    ],
  },
];

export const Default: Story = {
  args: {
    items: basicItems,
    title: 'Navigation',
    subtitle: 'Main menu',
  },
};

export const FileExplorer: Story = {
  args: {
    items: fileSystemItems,
    title: 'File Explorer',
    subtitle: 'Browse your files',
    width: 'lg',
  },
};

export const ApplicationSidebar: Story = {
  args: {
    items: applicationItems,
    title: 'Admin Panel',
    subtitle: 'Content Management',
    width: 'md',
  },
};

export const Collapsible: Story = {
  render: () => {
    const [collapsed, setCollapsed] = useState(false);
    
    return (
      <Sidebar
        items={applicationItems}
        title="Admin Panel"
        subtitle="Content Management"
        collapsible
        collapsed={collapsed}
        onCollapseChange={setCollapsed}
      />
    );
  },
};

export const RightSidebar: Story = {
  args: {
    items: [
      {
        id: 'notifications',
        label: 'Notifications',
        icon: Bell,
        badge: '5',
      },
      {
        id: 'messages',
        label: 'Messages',
        icon: MessageSquare,
        badge: '12',
      },
      {
        id: 'calendar',
        label: 'Calendar',
        icon: Calendar,
      },
      {
        id: 'contacts',
        label: 'Contacts',
        icon: User,
        badge: '150',
      },
    ],
    position: 'right',
    title: 'Quick Access',
    width: 'sm',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '100vh', position: 'relative', display: 'flex' }}>
        <div className="flex-1 p-8 bg-gray-50 dark:bg-gray-900">
          <h1 className="text-2xl font-bold mb-4">Main Content Area</h1>
          <p className="text-gray-600 dark:text-gray-400">
            This shows a sidebar on the right side instead of the left.
          </p>
        </div>
        <Story />
      </div>
    ),
  ],
};

export const WithOverlay: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    
    return (
      <div style={{ height: '100vh', position: 'relative' }}>
        <div className="p-8">
          <Button onClick={() => setOpen(true)}>Open Sidebar</Button>
          <h1 className="text-2xl font-bold mt-4 mb-4">Main Content</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Click the button to open a sidebar with overlay. Click outside to close.
          </p>
        </div>
        
        {open && (
          <Sidebar
            items={fileSystemItems}
            title="File Explorer"
            subtitle="Browse files"
            overlay
            showCloseButton
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    );
  },
};

export const BookmarkManager: Story = {
  args: {
    items: [
      {
        id: 'all-bookmarks',
        label: 'All Bookmarks',
        icon: Bookmark,
        active: true,
        badge: '1.2k',
      },
      {
        id: 'favorites',
        label: 'Favorites',
        icon: Heart,
        badge: '45',
      },
      {
        id: 'recent',
        label: 'Recently Added',
        icon: Clock,
        badge: '12',
      },
      {
        id: 'collections',
        label: 'Collections',
        icon: Folder,
        children: [
          {
            id: 'work',
            label: 'Work',
            icon: Folder,
            badge: '89',
          },
          {
            id: 'learning',
            label: 'Learning',
            icon: Folder,
            badge: '156',
          },
          {
            id: 'inspiration',
            label: 'Inspiration',
            icon: Folder,
            badge: '67',
          },
        ],
      },
      {
        id: 'tags',
        label: 'Tags',
        icon: Tag,
        children: [
          {
            id: 'react',
            label: 'React',
            icon: Tag,
            badge: '23',
          },
          {
            id: 'design',
            label: 'Design',
            icon: Tag,
            badge: '45',
          },
          {
            id: 'tutorials',
            label: 'Tutorials',
            icon: Tag,
            badge: '67',
          },
        ],
      },
      {
        id: 'shared',
        label: 'Shared with Me',
        icon: Share2,
        badge: '8',
      },
      {
        id: 'archived',
        label: 'Archived',
        icon: Archive,
        badge: '156',
      },
    ],
    title: 'Bookmarks',
    subtitle: 'Organize your links',
    width: 'lg',
  },
};

export const DeviceManager: Story = {
  args: {
    items: [
      {
        id: 'overview',
        label: 'Overview',
        icon: Monitor,
        active: true,
      },
      {
        id: 'devices',
        label: 'Devices',
        icon: Database,
        children: [
          {
            id: 'desktops',
            label: 'Desktops',
            icon: Monitor,
            badge: '12',
          },
          {
            id: 'laptops',
            label: 'Laptops',
            icon: Monitor,
            badge: '8',
          },
          {
            id: 'tablets',
            label: 'Tablets',
            icon: Tablet,
            badge: '5',
          },
          {
            id: 'phones',
            label: 'Phones',
            icon: Smartphone,
            badge: '15',
          },
        ],
      },
      {
        id: 'accessories',
        label: 'Accessories',
        icon: Headphones,
        children: [
          {
            id: 'headphones',
            label: 'Headphones',
            icon: Headphones,
            badge: '6',
          },
          {
            id: 'cameras',
            label: 'Cameras',
            icon: Camera,
            badge: '3',
          },
        ],
      },
      {
        id: 'network',
        label: 'Network',
        icon: Globe,
        badge: 'Online',
      },
      {
        id: 'maintenance',
        label: 'Maintenance',
        icon: Settings,
      },
    ],
    title: 'Device Manager',
    subtitle: 'Manage your devices',
  },
};

export const CompactWidth: Story = {
  args: {
    items: basicItems,
    title: 'Compact',
    width: 'sm',
  },
};

export const WideWidth: Story = {
  args: {
    items: applicationItems,
    title: 'Wide Sidebar',
    subtitle: 'Expanded layout',
    width: 'xl',
  },
};