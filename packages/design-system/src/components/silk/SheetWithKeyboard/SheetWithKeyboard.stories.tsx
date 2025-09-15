import type { Meta, StoryObj } from '@storybook/react';
import { SheetWithKeyboard } from './SheetWithKeyboard';
import { Button } from '../../ui/button';
import { 
  MessageSquare, 
  Send, 
  Paperclip, 
  Smile, 
  Mic,
  User,
  CreditCard,
  Search,
  Filter,
} from 'lucide-react';

const meta: Meta<typeof SheetWithKeyboard> = {
  title: 'Silk/SheetWithKeyboard',
  component: SheetWithKeyboard,
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
      defaultViewport: 'mobile',
    },
    docs: {
      description: {
        component: 'A sheet optimized for keyboard input scenarios. Automatically adjusts layout when virtual keyboard appears on mobile devices.',
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
    trigger: <Button>Open Form</Button>,
    title: 'Contact Form',
    description: 'Get in touch with us',
    autoFocus: true,
    children: (
      <form className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Name</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter your name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Email</label>
          <input
            type="email"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter your email"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Message</label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={4}
            placeholder="Type your message here..."
          />
        </div>
        <Button type="submit" className="w-full">Send Message</Button>
      </form>
    ),
  },
};

export const ChatInterface: Story = {
  args: {
    trigger: (
      <Button variant="secondary">
        <MessageSquare className="h-4 w-4 mr-2" />
        Open Chat
      </Button>
    ),
    title: 'Chat with Support',
    description: 'We\'re here to help!',
    adjustForKeyboard: true,
    autoFocus: true,
    children: (
      <div className="flex flex-col h-full">
        {/* Messages */}
        <div className="flex-1 space-y-4 mb-4">
          <div className="flex gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                <p className="text-sm">Hello! How can I help you today?</p>
              </div>
              <p className="text-xs text-gray-500 mt-1">Just now</p>
            </div>
          </div>
          
          <div className="flex gap-2 flex-row-reverse">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <div className="bg-blue-500 text-white rounded-lg p-3 ml-auto max-w-[80%]">
                <p className="text-sm">I need help with my account settings</p>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-right">2 min ago</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
                <p className="text-sm">I'd be happy to help with that! What specific setting would you like to change?</p>
              </div>
              <p className="text-xs text-gray-500 mt-1">1 min ago</p>
            </div>
          </div>
        </div>
        
        {/* Input */}
        <div className="border-t pt-4">
          <div className="flex gap-2 items-end">
            <Button size="icon" variant="ghost">
              <Paperclip className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <textarea
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={1}
                placeholder="Type a message..."
              />
            </div>
            <Button size="icon" variant="ghost">
              <Smile className="h-4 w-4" />
            </Button>
            <Button size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    ),
  },
};

export const AddressForm: Story = {
  args: {
    trigger: <Button variant="outline">Add Address</Button>,
    title: 'Delivery Address',
    description: 'Enter your delivery details',
    autoFocus: true,
    children: (
      <form className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">First Name</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="John"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Last Name</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Doe"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Street Address</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="123 Main Street"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">City</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="New York"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">ZIP Code</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="10001"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Phone Number</label>
          <input
            type="tel"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="+1 (555) 123-4567"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <input type="checkbox" id="default" className="rounded" />
          <label htmlFor="default" className="text-sm">Set as default address</label>
        </div>
        
        <div className="flex gap-2 pt-4">
          <Button type="submit" className="flex-1">Save Address</Button>
          <Button type="button" variant="outline" className="flex-1">Cancel</Button>
        </div>
      </form>
    ),
  },
};

export const SearchAndFilter: Story = {
  args: {
    trigger: (
      <Button variant="outline">
        <Search className="h-4 w-4 mr-2" />
        Search & Filter
      </Button>
    ),
    title: 'Search Content',
    description: 'Find what you\'re looking for',
    autoFocus: true,
    children: (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Search bookmarks..."
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Content Type</label>
          <div className="space-y-2">
            {['All', 'Articles', 'Videos', 'Podcasts', 'Social Posts'].map((type) => (
              <label key={type} className="flex items-center gap-2">
                <input type="radio" name="contentType" value={type.toLowerCase()} />
                <span className="text-sm">{type}</span>
              </label>
            ))}
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Date Range</label>
          <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            <option>Any time</option>
            <option>Last 24 hours</option>
            <option>Last week</option>
            <option>Last month</option>
            <option>Last year</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Tags</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter tags separated by commas"
          />
        </div>
        
        <div className="flex gap-2 pt-4">
          <Button className="flex-1">
            <Search className="h-4 w-4 mr-2" />
            Search
          </Button>
          <Button variant="outline" className="flex-1">
            <Filter className="h-4 w-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>
    ),
  },
};

export const VoiceMessage: Story = {
  args: {
    trigger: (
      <Button variant="secondary">
        <Mic className="h-4 w-4 mr-2" />
        Voice Message
      </Button>
    ),
    title: 'Record Voice Message',
    description: 'Hold to record, release to send',
    children: (
      <div className="text-center space-y-6">
        <div className="w-32 h-32 bg-red-500 rounded-full flex items-center justify-center mx-auto">
          <Mic className="h-16 w-16 text-white" />
        </div>
        
        <div>
          <div className="text-2xl font-mono">00:15</div>
          <p className="text-gray-500 text-sm">Recording...</p>
        </div>
        
        <div className="flex justify-center gap-4">
          <Button variant="outline" size="icon">
            <span className="text-xl">⏹️</span>
          </Button>
          <Button variant="outline" size="icon">
            <span className="text-xl">⏸️</span>
          </Button>
          <Button size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="text-center">
          <p className="text-xs text-gray-500">
            Tap and hold the microphone to record
          </p>
        </div>
      </div>
    ),
  },
};

export const PaymentForm: Story = {
  args: {
    trigger: <Button>Add Payment Method</Button>,
    title: 'Payment Information',
    description: 'Secure payment processing',
    autoFocus: true,
    children: (
      <form className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Card Number</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="1234 5678 9012 3456"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Expiry Date</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="MM/YY"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">CVV</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="123"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Cardholder Name</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="John Doe"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <input type="checkbox" id="save-card" className="rounded" />
          <label htmlFor="save-card" className="text-sm">Save this card for future purchases</label>
        </div>
        
        <div className="pt-4">
          <Button type="submit" className="w-full">
            <CreditCard className="h-4 w-4 mr-2" />
            Add Payment Method
          </Button>
        </div>
      </form>
    ),
  },
};