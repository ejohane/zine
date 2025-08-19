import type { Meta, StoryObj } from '@storybook/react';
import { Page } from './Page';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Card } from '../Card';
import { 
  Search,
  Filter,
  MoreVertical,
  Heart,
  Share2,
  Bookmark,
  Settings,
  Bell,
  User,
  ChevronRight
} from 'lucide-react';

const meta: Meta<typeof Page> = {
  title: 'Silk/Page',
  component: Page,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'A full-page component with navigation header for creating app-like experiences.',
      },
      story: {
        inline: false,
        iframeHeight: 600,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'fullscreen', 'modal'],
    },
    showHeader: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Page Title',
    subtitle: 'Page subtitle or description',
    onBack: () => console.log('Back clicked'),
    children: (
      <div className="p-4 space-y-4">
        <Card>
          <h3 className="font-semibold mb-2">Content Section</h3>
          <p className="text-gray-600 dark:text-gray-400">
            This is a page component with navigation controls.
          </p>
        </Card>
      </div>
    ),
  },
};

export const ArticlePage: Story = {
  args: {
    title: 'Article',
    onBack: () => console.log('Back clicked'),
    headerAction: (
      <>
        <Button size="icon" variant="ghost">
          <Bookmark className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost">
          <Share2 className="h-4 w-4" />
        </Button>
      </>
    ),
    children: (
      <article className="max-w-3xl mx-auto p-6">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-4">
            Building Modern Web Applications with React and TypeScript
          </h1>
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span>By John Doe</span>
            <span>•</span>
            <span>Dec 15, 2024</span>
            <span>•</span>
            <span>10 min read</span>
          </div>
        </header>
        
        <div className="prose dark:prose-invert max-w-none">
          <p>
            Modern web development has evolved significantly over the past few years, with React and TypeScript becoming the de facto standard for building scalable, maintainable applications.
          </p>
          
          <h2>Getting Started</h2>
          <p>
            To begin building a modern web application, you'll need to set up your development environment with the right tools and frameworks. This guide will walk you through the process step by step.
          </p>
          
          <h2>Key Concepts</h2>
          <p>
            Understanding the fundamental concepts of React and TypeScript is crucial for building efficient applications. Let's explore the core principles that will guide your development process.
          </p>
          
          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg my-6">
            <p className="text-sm">
              <strong>Pro Tip:</strong> Always use TypeScript's strict mode to catch potential errors early in the development process.
            </p>
          </div>
          
          <h2>Best Practices</h2>
          <p>
            Following industry best practices ensures your code is maintainable, scalable, and performs well in production environments.
          </p>
        </div>
      </article>
    ),
  },
};

export const SettingsPage: Story = {
  args: {
    title: 'Settings',
    onClose: () => console.log('Close clicked'),
    variant: 'modal',
    children: (
      <div className="p-4 space-y-6">
        <section>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Account
          </h2>
          <div className="space-y-2">
            {[
              { icon: User, label: 'Profile', value: 'Edit' },
              { icon: Bell, label: 'Notifications', value: 'On' },
              { icon: Settings, label: 'Preferences', value: null },
            ].map((item) => (
              <button
                key={item.label}
                className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  <span className="font-medium">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {item.value && (
                    <span className="text-sm text-gray-500">{item.value}</span>
                  )}
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </div>
              </button>
            ))}
          </div>
        </section>
        
        <section>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Content
          </h2>
          <div className="space-y-2">
            <label className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="font-medium">Auto-play videos</span>
              <input type="checkbox" className="toggle" />
            </label>
            <label className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="font-medium">Show images</span>
              <input type="checkbox" defaultChecked className="toggle" />
            </label>
            <label className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="font-medium">Enable previews</span>
              <input type="checkbox" defaultChecked className="toggle" />
            </label>
          </div>
        </section>
      </div>
    ),
  },
};

export const ListPage: Story = {
  args: {
    title: 'Bookmarks',
    subtitle: '156 items',
    onBack: () => console.log('Back clicked'),
    headerAction: (
      <>
        <Button size="icon" variant="ghost">
          <Search className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost">
          <Filter className="h-4 w-4" />
        </Button>
      </>
    ),
    children: (
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="font-medium mb-1">Bookmark Title {i + 1}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  This is a description of the bookmark content that might be quite long so we need to truncate it properly.
                </p>
                <div className="flex items-center gap-4 mt-2">
                  <Badge variant="secondary">Article</Badge>
                  <span className="text-xs text-gray-500">2 hours ago</span>
                </div>
              </div>
              <Button size="icon" variant="ghost">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    ),
  },
};

export const FullscreenGallery: Story = {
  args: {
    variant: 'fullscreen',
    title: 'Gallery',
    onClose: () => console.log('Close clicked'),
    headerAction: (
      <span className="text-sm text-gray-500">3 of 12</span>
    ),
    children: (
      <div className="h-full flex items-center justify-center bg-black">
        <div className="max-w-4xl w-full aspect-video bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg" />
      </div>
    ),
  },
};

export const ProfilePage: Story = {
  args: {
    title: 'Profile',
    onBack: () => console.log('Back clicked'),
    headerAction: (
      <Button size="sm" variant="outline">Edit</Button>
    ),
    children: (
      <div className="p-4">
        <div className="text-center mb-8">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-400 to-purple-600 rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-1">Jane Smith</h2>
          <p className="text-gray-600 dark:text-gray-400">Product Designer</p>
        </div>
        
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="text-center">
            <div className="text-2xl font-bold">234</div>
            <div className="text-sm text-gray-500">Bookmarks</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">12</div>
            <div className="text-sm text-gray-500">Collections</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">5.2k</div>
            <div className="text-sm text-gray-500">Views</div>
          </div>
        </div>
        
        <div className="space-y-4">
          <Card>
            <h3 className="font-medium mb-2">About</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Passionate about design and technology. Always exploring new ways to create beautiful and functional user experiences.
            </p>
          </Card>
          
          <Card>
            <h3 className="font-medium mb-3">Recent Activity</h3>
            <div className="space-y-2">
              {['Added new bookmark', 'Created collection', 'Shared article'].map((activity, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>{activity}</span>
                  <span className="text-gray-500">{i + 1}h ago</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    ),
  },
};

export const EmptyStatePage: Story = {
  args: {
    title: 'Collections',
    onBack: () => console.log('Back clicked'),
    children: (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
        <div className="w-16 h-16 bg-gray-200 dark:bg-gray-800 rounded-full mb-4 flex items-center justify-center">
          <Bookmark className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No collections yet</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-sm">
          Create your first collection to organize your bookmarks
        </p>
        <Button>Create Collection</Button>
      </div>
    ),
  },
};