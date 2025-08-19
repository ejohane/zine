import type { Meta, StoryObj } from '@storybook/react';
import { BottomSheet } from './BottomSheet';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { 
  Plus, 
  Settings, 
  Share2, 
  Heart, 
  Bookmark, 
  Filter,
  Search,
  ChevronRight,
  Copy,
  Mail,
  MessageCircle
} from 'lucide-react';

const meta: Meta<typeof BottomSheet> = {
  title: 'Silk/BottomSheet',
  component: BottomSheet,
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
        component: 'A bottom sheet component built with Silk UI for mobile-friendly interactions. Click the trigger button to open the sheet.',
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
      <div style={{ minHeight: '500px', position: 'relative' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    trigger: <Button>Open Bottom Sheet</Button>,
    title: 'Bottom Sheet',
    description: 'This is a bottom sheet example',
    children: (
      <div className="p-4">
        <p>This is the content of the bottom sheet.</p>
      </div>
    ),
  },
};

export const QuickActions: Story = {
  args: {
    trigger: <Button>Open Quick Actions</Button>,
    title: 'Quick Actions',
    description: 'Choose an action to perform',
    children: (
      <div className="grid grid-cols-2 gap-4 pb-4">
        {[
          { icon: Plus, label: 'Add Bookmark', color: 'text-blue-500' },
          { icon: Search, label: 'Search', color: 'text-green-500' },
          { icon: Filter, label: 'Filter', color: 'text-purple-500' },
          { icon: Settings, label: 'Settings', color: 'text-gray-500' },
        ].map((action) => (
          <button
            key={action.label}
            className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <action.icon className={`h-8 w-8 ${action.color} mx-auto mb-2`} />
            <span className="text-sm font-medium">{action.label}</span>
          </button>
        ))}
      </div>
    ),
  },
};

export const ShareSheet: Story = {
  args: {
    trigger: (
      <Button variant="secondary">
        <Share2 className="h-4 w-4 mr-2" />
        Share
      </Button>
    ),
    title: 'Share',
    description: 'Choose how you\'d like to share this content',
    children: (
      <div className="space-y-2 pb-4">
        {[
          { icon: Copy, label: 'Copy Link' },
          { icon: Mail, label: 'Share via Email' },
          { icon: MessageCircle, label: 'Send Message' },
          { icon: Share2, label: 'More Options' },
        ].map((option) => (
          <button
            key={option.label}
            className="w-full p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-3"
          >
            <option.icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            <span className="text-sm font-medium">{option.label}</span>
          </button>
        ))}
      </div>
    ),
  },
};

export const FilterOptions: Story = {
  args: {
    trigger: (
      <Button variant="outline">
        <Filter className="h-4 w-4 mr-2" />
        Open Filters
      </Button>
    ),
    title: 'Filter Content',
    description: 'Select content types to display',
    children: (
      <div className="space-y-2 pb-4">
        {[
          { label: 'All', count: 124 },
          { label: 'Articles', count: 45 },
          { label: 'Videos', count: 32 },
          { label: 'Podcasts', count: 28 },
          { label: 'Social Posts', count: 19 },
        ].map((option) => (
          <button
            key={option.label}
            className="w-full p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-between"
          >
            <span className="font-medium">{option.label}</span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{option.count}</Badge>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </div>
          </button>
        ))}
      </div>
    ),
  },
};

export const BookmarkActions: Story = {
  args: {
    trigger: (
      <Button size="icon" variant="ghost">
        <Heart className="h-4 w-4" />
      </Button>
    ),
    title: 'Bookmark Options',
    children: (
      <div className="space-y-2 pb-4">
        <button className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg flex items-center justify-between">
          <span>Add to Favorites</span>
          <Heart className="h-4 w-4" />
        </button>
        <button className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg flex items-center justify-between">
          <span>Save to Collection</span>
          <Bookmark className="h-4 w-4" />
        </button>
        <button className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg flex items-center justify-between">
          <span>Share</span>
          <Share2 className="h-4 w-4" />
        </button>
      </div>
    ),
  },
};

export const WithForm: Story = {
  args: {
    trigger: <Button variant="outline">Open Form</Button>,
    title: 'Create New Bookmark',
    children: (
      <form className="space-y-4 pb-4">
        <div>
          <label className="block text-sm font-medium mb-2">Title</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
            placeholder="Enter bookmark title"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">URL</label>
          <input
            type="url"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
            placeholder="https://example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Notes</label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
            rows={4}
            placeholder="Add your notes here..."
          />
        </div>
        <div className="flex gap-2 pt-4">
          <Button type="submit" className="flex-1">Save Bookmark</Button>
          <Button type="button" variant="outline" className="flex-1">Cancel</Button>
        </div>
      </form>
    ),
  },
};

export const LongContent: Story = {
  args: {
    trigger: <Button>Open Long Content</Button>,
    title: 'Terms and Conditions',
    description: 'Please review our terms',
    children: (
      <div className="space-y-4 pb-4 max-h-96 overflow-y-auto">
        <p className="text-sm">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
        </p>
        <p className="text-sm">
          Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
        </p>
        <p className="text-sm">
          Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
        </p>
        <p className="text-sm">
          Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
        </p>
        <p className="text-sm">
          Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.
        </p>
        <p className="text-sm">
          Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores.
        </p>
        <div className="pt-4 border-t">
          <Button className="w-full">Accept Terms</Button>
        </div>
      </div>
    ),
  },
};