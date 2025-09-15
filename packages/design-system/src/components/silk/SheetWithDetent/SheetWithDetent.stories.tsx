import type { Meta, StoryObj } from '@storybook/react';
import { SheetWithDetent } from './SheetWithDetent';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { cn } from '../../../lib/utils';
import { 
  User, 
  CreditCard, 
  Bell, 
  Lock, 
  HelpCircle,
  ChevronRight,
  Music,
  Play,
  SkipForward,
  SkipBack,
  Volume2,
  Heart,
  MoreVertical
} from 'lucide-react';

const meta: Meta<typeof SheetWithDetent> = {
  title: 'Silk/SheetWithDetent',
  component: SheetWithDetent,
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
        component: 'A sheet with detent points that allows users to snap to specific heights. Click the trigger to open and use the detent buttons to change heights.',
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
    trigger: <Button>Open Sheet with Detents</Button>,
    title: 'Settings',
    description: 'Adjust your preferences',
    children: (
      <div className="space-y-4">
        {[
          { icon: User, label: 'Profile', description: 'Manage your account' },
          { icon: Bell, label: 'Notifications', description: 'Control your alerts' },
          { icon: Lock, label: 'Privacy', description: 'Manage privacy settings' },
          { icon: CreditCard, label: 'Billing', description: 'Payment and subscription' },
          { icon: HelpCircle, label: 'Help', description: 'Get support' },
        ].map((item) => (
          <button
            key={item.label}
            className="w-full p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-3"
          >
            <item.icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            <div className="flex-1 text-left">
              <div className="font-medium">{item.label}</div>
              <div className="text-sm text-gray-500">{item.description}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </button>
        ))}
      </div>
    ),
  },
};

export const MusicPlayer: Story = {
  args: {
    trigger: (
      <Button variant="secondary">
        <Music className="h-4 w-4 mr-2" />
        Open Music Player
      </Button>
    ),
    title: 'Now Playing',
    description: 'The Weeknd - Blinding Lights',
    detents: ['small', 'medium', 'large'],
    initialDetent: 'small',
    children: (
      <div className="space-y-6">
        {/* Album Art */}
        <div className="aspect-square bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
          <Music className="h-16 w-16 text-white/80" />
        </div>
        
        {/* Song Info */}
        <div className="text-center">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Blinding Lights</h3>
          <p className="text-gray-600 dark:text-gray-400">The Weeknd</p>
        </div>
        
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
            <div className="bg-purple-500 h-1 rounded-full" style={{ width: '40%' }}></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>1:23</span>
            <span>3:20</span>
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <Button size="icon" variant="ghost">
            <SkipBack className="h-5 w-5" />
          </Button>
          <Button size="icon" className="h-12 w-12">
            <Play className="h-6 w-6" />
          </Button>
          <Button size="icon" variant="ghost">
            <SkipForward className="h-5 w-5" />
          </Button>
        </div>
        
        {/* Additional Controls */}
        <div className="flex items-center justify-between pt-4">
          <Button size="icon" variant="ghost">
            <Heart className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost">
            <Volume2 className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>
    ),
  },
};

export const TaskList: Story = {
  args: {
    trigger: <Button variant="outline">View Tasks</Button>,
    title: 'Today\'s Tasks',
    description: 'You have 5 tasks remaining',
    detents: ['medium', 'large', 'full'],
    initialDetent: 'medium',
    children: (
      <div className="space-y-3">
        {[
          { task: 'Review quarterly reports', completed: false, priority: 'high' },
          { task: 'Update project documentation', completed: true, priority: 'medium' },
          { task: 'Schedule team meeting', completed: false, priority: 'low' },
          { task: 'Respond to client emails', completed: false, priority: 'high' },
          { task: 'Design mockups for new feature', completed: true, priority: 'medium' },
          { task: 'Test mobile app updates', completed: false, priority: 'medium' },
          { task: 'Prepare presentation slides', completed: false, priority: 'high' },
          { task: 'Code review for PR #123', completed: true, priority: 'low' },
        ].map((item, index) => (
          <div
            key={index}
            className={cn(
              "p-4 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3",
              item.completed && "opacity-60"
            )}
          >
            <input
              type="checkbox"
              checked={item.completed}
              className="rounded border-gray-300"
              readOnly
            />
            <div className="flex-1">
              <div className={cn(
                "font-medium",
                item.completed && "line-through text-gray-500"
              )}>
                {item.task}
              </div>
            </div>
            <Badge 
              variant={
                item.priority === 'high' ? 'destructive' : 
                item.priority === 'medium' ? 'default' : 
                'secondary'
              }
            >
              {item.priority}
            </Badge>
          </div>
        ))}
      </div>
    ),
  },
};

export const ProductDetails: Story = {
  args: {
    trigger: <Button>View Product</Button>,
    title: 'Wireless Headphones',
    description: 'Premium audio experience',
    detents: ['small', 'medium', 'large', 'full'],
    initialDetent: 'small',
    children: (
      <div className="space-y-6">
        {/* Product Image */}
        <div className="aspect-square bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900 dark:to-blue-800 rounded-xl flex items-center justify-center">
          <div className="text-6xl">🎧</div>
        </div>
        
        {/* Price */}
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-900 dark:text-white">$299.99</div>
          <div className="text-gray-500 line-through">$399.99</div>
        </div>
        
        {/* Features */}
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Key Features</h3>
          {[
            'Active Noise Cancellation',
            '30-hour battery life',
            'Wireless charging case',
            'Premium sound quality',
            'Comfortable fit',
          ].map((feature, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm">{feature}</span>
            </div>
          ))}
        </div>
        
        {/* Color Options */}
        <div className="space-y-3">
          <h3 className="font-semibold text-gray-900 dark:text-white">Colors</h3>
          <div className="flex gap-2">
            {['bg-black', 'bg-white', 'bg-blue-500', 'bg-pink-500'].map((color, index) => (
              <button
                key={index}
                className={cn(
                  "w-8 h-8 rounded-full border-2 border-gray-300",
                  color,
                  index === 0 && "ring-2 ring-blue-500 ring-offset-2"
                )}
              />
            ))}
          </div>
        </div>
        
        {/* Actions */}
        <div className="space-y-2 pt-4">
          <Button className="w-full">Add to Cart</Button>
          <Button variant="outline" className="w-full">Add to Wishlist</Button>
        </div>
      </div>
    ),
  },
};

export const CustomDetents: Story = {
  args: {
    trigger: <Button variant="outline">Custom Detents</Button>,
    title: 'Photo Editor',
    description: 'Edit your photos with precision',
    detents: ['small', 'large'],
    initialDetent: 'small',
    children: (
      <div className="space-y-4">
        <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-lg flex items-center justify-center">
          <div className="text-4xl">📸</div>
        </div>
        
        <div className="grid grid-cols-4 gap-2">
          {['Brightness', 'Contrast', 'Saturation', 'Blur'].map((tool) => (
            <Button key={tool} variant="outline" size="sm">
              {tool}
            </Button>
          ))}
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Brightness</label>
          <input
            type="range"
            className="w-full"
            min="0"
            max="100"
            defaultValue="50"
          />
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Contrast</label>
          <input
            type="range"
            className="w-full"
            min="0"
            max="100"
            defaultValue="50"
          />
        </div>
      </div>
    ),
  },
};