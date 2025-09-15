import type { Meta, StoryObj } from '@storybook/react';
import { DetachedSheet } from './DetachedSheet';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { 
  Search,
  Settings,
  User,
  Bell,
  Lock,
  Palette,
  Globe,
  HelpCircle,
  ChevronRight
} from 'lucide-react';

const meta: Meta<typeof DetachedSheet> = {
  title: 'Silk/DetachedSheet',
  component: DetachedSheet,
  parameters: {
    layout: 'fullscreen',
    viewport: {
      viewports: {
        mobile: {
          name: 'Mobile',
          styles: {
            width: '375px',
            height: '812px',
          },
        },
        tablet: {
          name: 'Tablet',
          styles: {
            width: '768px',
            height: '1024px',
          },
        },
      },
      defaultViewport: 'responsive',
    },
    docs: {
      description: {
        component: 'A detached sheet component that appears as a floating modal-like overlay, perfect for forms, settings, and focused content.',
      },
      story: {
        inline: false,
        iframeHeight: 600,
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ minHeight: '500px', position: 'relative', padding: '2rem' }}>
        <Story />
      </div>
    ),
  ],
  argTypes: {
    position: {
      control: 'select',
      options: ['center', 'top', 'bottom'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'full'],
    },
    showCloseButton: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    trigger: <Button>Open Detached Sheet</Button>,
    title: 'Detached Sheet',
    description: 'This sheet floats above the content',
    children: (
      <div className="space-y-4">
        <p>This is a detached sheet that appears as a floating modal.</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          It can be positioned at the center, top, or bottom of the screen.
        </p>
      </div>
    ),
  },
};

export const SearchModal: Story = {
  args: {
    trigger: (
      <Button variant="outline">
        <Search className="h-4 w-4 mr-2" />
        Search
      </Button>
    ),
    title: 'Search Everything',
    size: 'lg',
    children: (
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input 
            placeholder="Search bookmarks, collections, tags..." 
            className="pl-10"
            autoFocus
          />
        </div>
        
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Recent Searches</p>
          {['React tutorials', 'Design systems', 'TypeScript best practices'].map((search) => (
            <button
              key={search}
              className="w-full text-left p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-between"
            >
              <span className="text-sm">{search}</span>
              <ChevronRight className="h-3 w-3 text-gray-400" />
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Quick Filters</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700">
              Articles
            </Badge>
            <Badge variant="secondary" className="cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700">
              Videos
            </Badge>
            <Badge variant="secondary" className="cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700">
              Podcasts
            </Badge>
            <Badge variant="secondary" className="cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700">
              This Week
            </Badge>
          </div>
        </div>
      </div>
    ),
  },
};

export const SettingsPanel: Story = {
  args: {
    trigger: (
      <Button variant="ghost" size="icon">
        <Settings className="h-4 w-4" />
      </Button>
    ),
    title: 'Settings',
    position: 'center',
    size: 'md',
    children: (
      <div className="space-y-1">
        {[
          { icon: User, label: 'Profile', badge: null },
          { icon: Bell, label: 'Notifications', badge: '3' },
          { icon: Lock, label: 'Privacy & Security', badge: null },
          { icon: Palette, label: 'Appearance', badge: null },
          { icon: Globe, label: 'Language & Region', badge: null },
          { icon: HelpCircle, label: 'Help & Support', badge: null },
        ].map((item) => (
          <button
            key={item.label}
            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <item.icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              <span className="font-medium">{item.label}</span>
            </div>
            <div className="flex items-center gap-2">
              {item.badge && (
                <Badge variant="destructive" className="h-5 min-w-[1.25rem] px-1">
                  {item.badge}
                </Badge>
              )}
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </div>
          </button>
        ))}
      </div>
    ),
  },
};

export const FormDialog: Story = {
  args: {
    trigger: <Button>Create New</Button>,
    title: 'Create New Collection',
    description: 'Organize your bookmarks into themed collections',
    size: 'md',
    position: 'center',
    children: (
      <form className="space-y-4">
        <div>
          <Label htmlFor="name">Collection Name</Label>
          <Input 
            id="name" 
            placeholder="e.g., Web Development Resources" 
            className="mt-1"
          />
        </div>
        
        <div>
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm"
            rows={3}
            placeholder="What's this collection about?"
          />
        </div>
        
        <div>
          <Label>Color Theme</Label>
          <div className="flex gap-2 mt-2">
            {['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-yellow-500', 'bg-red-500'].map((color) => (
              <button
                key={color}
                type="button"
                className={`w-8 h-8 rounded-full ${color} hover:scale-110 transition-transform`}
                aria-label={`Select ${color} theme`}
              />
            ))}
          </div>
        </div>
        
        <div>
          <Label>Privacy</Label>
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2">
              <input type="radio" name="privacy" value="private" defaultChecked />
              <span className="text-sm">Private - Only you can see this</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="privacy" value="public" />
              <span className="text-sm">Public - Anyone can view</span>
            </label>
          </div>
        </div>
        
        <div className="flex gap-2 pt-4">
          <Button type="submit" className="flex-1">Create Collection</Button>
          <Button type="button" variant="outline" className="flex-1">Cancel</Button>
        </div>
      </form>
    ),
  },
};

export const ConfirmationDialog: Story = {
  args: {
    trigger: <Button variant="destructive">Delete Item</Button>,
    title: 'Are you sure?',
    description: 'This action cannot be undone.',
    size: 'sm',
    position: 'center',
    children: (
      <div className="space-y-4">
        <p className="text-sm">
          This will permanently delete your bookmark and remove it from all collections.
        </p>
        <div className="flex gap-2">
          <Button variant="destructive" className="flex-1">
            Yes, Delete
          </Button>
          <Button variant="outline" className="flex-1">
            Cancel
          </Button>
        </div>
      </div>
    ),
  },
};

export const Positions: Story = {
  render: () => (
    <div className="flex gap-4 flex-wrap">
      <DetachedSheet
        trigger={<Button variant="outline">Center Position</Button>}
        title="Centered Sheet"
        position="center"
        size="sm"
      >
        <p>This sheet appears in the center of the screen.</p>
      </DetachedSheet>
      
      <DetachedSheet
        trigger={<Button variant="outline">Top Position</Button>}
        title="Top Sheet"
        position="top"
        size="sm"
      >
        <p>This sheet appears at the top of the screen.</p>
      </DetachedSheet>
      
      <DetachedSheet
        trigger={<Button variant="outline">Bottom Position</Button>}
        title="Bottom Sheet"
        position="bottom"
        size="sm"
      >
        <p>This sheet appears at the bottom of the screen.</p>
      </DetachedSheet>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex gap-4 flex-wrap">
      <DetachedSheet
        trigger={<Button variant="outline">Small</Button>}
        title="Small Sheet"
        size="sm"
      >
        <p>This is a small detached sheet.</p>
      </DetachedSheet>
      
      <DetachedSheet
        trigger={<Button variant="outline">Medium</Button>}
        title="Medium Sheet"
        size="md"
      >
        <p>This is a medium detached sheet with more content space.</p>
      </DetachedSheet>
      
      <DetachedSheet
        trigger={<Button variant="outline">Large</Button>}
        title="Large Sheet"
        size="lg"
      >
        <p>This is a large detached sheet for complex forms or content.</p>
      </DetachedSheet>
      
      <DetachedSheet
        trigger={<Button variant="outline">Full</Button>}
        title="Full Sheet"
        size="full"
      >
        <p>This is a full-size detached sheet that takes most of the screen.</p>
      </DetachedSheet>
    </div>
  ),
};