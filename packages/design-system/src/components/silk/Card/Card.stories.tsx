import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { 
  Heart, 
  Share2, 
  Bookmark, 
  MoreVertical,
  Play,
  Clock,
  User,
  Calendar,
  ChevronRight,
  Star
} from 'lucide-react';

const meta: Meta<typeof Card> = {
  title: 'Silk/Card',
  component: Card,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: 'A versatile card component built with Silk UI for displaying content in a contained format.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'elevated', 'bordered', 'ghost'],
    },
    padding: {
      control: 'select',
      options: ['none', 'sm', 'md', 'lg'],
    },
    interactive: {
      control: 'boolean',
    },
    selected: {
      control: 'boolean',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <div>
        <h3 className="text-lg font-semibold mb-2">Card Title</h3>
        <p className="text-gray-600 dark:text-gray-400">
          This is a basic card component with default styling.
        </p>
      </div>
    ),
  },
};

export const MediaCard: Story = {
  args: {
    padding: 'none',
    interactive: true,
    children: (
      <>
        <div className="relative">
          <div className="h-48 bg-gradient-to-br from-blue-400 to-purple-600 rounded-t-lg" />
          <div className="absolute bottom-2 right-2 bg-black/50 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
            <Play className="h-3 w-3" />
            <span>12:34</span>
          </div>
        </div>
        <div className="p-4">
          <h3 className="font-semibold mb-1">Video Title</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Channel Name • 1.2M views • 2 days ago
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost">
              <Heart className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost">
              <Share2 className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost">
              <Bookmark className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </>
    ),
  },
};

export const ArticleCard: Story = {
  args: {
    interactive: true,
    children: (
      <article className="flex gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary">Technology</Badge>
            <span className="text-xs text-gray-500">5 min read</span>
          </div>
          <h3 className="font-semibold mb-2">
            The Future of Web Development: Trends to Watch
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
            Explore the latest trends shaping the future of web development, from AI integration to new frameworks and tools that are revolutionizing how we build for the web.
          </p>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              John Doe
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Dec 1, 2024
            </span>
          </div>
        </div>
        <div className="w-32 h-32 bg-gradient-to-br from-green-400 to-blue-500 rounded-lg flex-shrink-0" />
      </article>
    ),
  },
};

export const StatsCard: Story = {
  args: {
    variant: 'elevated',
    children: (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Revenue</h3>
          <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            +12.5%
          </Badge>
        </div>
        <div className="text-2xl font-bold mb-2">$45,231.89</div>
        <p className="text-xs text-gray-500">+20.1% from last month</p>
      </div>
    ),
  },
};

export const ProfileCard: Story = {
  args: {
    children: (
      <div className="text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-pink-400 to-purple-600 rounded-full mx-auto mb-4" />
        <h3 className="font-semibold mb-1">Jane Smith</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Product Designer</p>
        <div className="flex justify-center gap-4 mb-4">
          <div>
            <div className="text-lg font-semibold">234</div>
            <div className="text-xs text-gray-500">Followers</div>
          </div>
          <div>
            <div className="text-lg font-semibold">123</div>
            <div className="text-xs text-gray-500">Following</div>
          </div>
          <div>
            <div className="text-lg font-semibold">45</div>
            <div className="text-xs text-gray-500">Posts</div>
          </div>
        </div>
        <Button className="w-full">Follow</Button>
      </div>
    ),
  },
};

export const ListCard: Story = {
  args: {
    padding: 'none',
    children: (
      <div>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold">Recent Activity</h3>
        </div>
        {[
          { title: 'New bookmark added', time: '2 hours ago', icon: Bookmark },
          { title: 'Shared collection', time: '5 hours ago', icon: Share2 },
          { title: 'Liked an article', time: '1 day ago', icon: Heart },
          { title: 'Created new folder', time: '2 days ago', icon: Star },
        ].map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <item.icon className="h-4 w-4 text-gray-400" />
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-gray-500">{item.time}</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </div>
        ))}
      </div>
    ),
  },
};

export const InteractiveStates: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <h4 className="font-medium mb-2">Default State</h4>
        <p className="text-sm text-gray-600">Static card without interaction</p>
      </Card>
      <Card interactive>
        <h4 className="font-medium mb-2">Interactive</h4>
        <p className="text-sm text-gray-600">Hover and click me!</p>
      </Card>
      <Card selected>
        <h4 className="font-medium mb-2">Selected State</h4>
        <p className="text-sm text-gray-600">This card is selected</p>
      </Card>
      <Card interactive selected>
        <h4 className="font-medium mb-2">Interactive + Selected</h4>
        <p className="text-sm text-gray-600">Combined states</p>
      </Card>
    </div>
  ),
};

export const Variants: Story = {
  render: () => (
    <div className="space-y-4">
      <Card variant="default">
        <h4 className="font-medium mb-2">Default Variant</h4>
        <p className="text-sm text-gray-600">Standard card with border</p>
      </Card>
      <Card variant="elevated">
        <h4 className="font-medium mb-2">Elevated Variant</h4>
        <p className="text-sm text-gray-600">Card with shadow for emphasis</p>
      </Card>
      <Card variant="bordered">
        <h4 className="font-medium mb-2">Bordered Variant</h4>
        <p className="text-sm text-gray-600">Prominent border styling</p>
      </Card>
      <Card variant="ghost">
        <h4 className="font-medium mb-2">Ghost Variant</h4>
        <p className="text-sm text-gray-600">Minimal styling, no background</p>
      </Card>
    </div>
  ),
};