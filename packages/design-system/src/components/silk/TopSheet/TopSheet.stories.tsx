import type { Meta, StoryObj } from '@storybook/react';
import { TopSheet } from './TopSheet';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { cn } from '../../../lib/utils';
import { 
  Bell, 
  Mail, 
  MessageSquare, 
  Download, 
  AlertTriangle, 
  Info, 
  CheckCircle,
  Clock,
  Calendar,
  User,
  Settings,
  Search,
  Wifi,
  Battery,
  Volume2,
  Bluetooth,
  Plane,
  Globe,
  MapPin,
  Thermometer,
  Cloud,
  Sun,
  Moon
} from 'lucide-react';

const meta: Meta<typeof TopSheet> = {
  title: 'Silk/TopSheet',
  component: TopSheet,
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
        component: 'A sheet component that slides down from the top, perfect for notifications, announcements, or system controls.',
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
    trigger: <Button>Open Top Sheet</Button>,
    title: 'Notification',
    description: 'You have new messages',
    children: (
      <div className="space-y-4">
        <p>This is content in the top sheet. It slides down from the top of the screen.</p>
        <Button className="w-full">Take Action</Button>
      </div>
    ),
  },
};

export const NotificationCenter: Story = {
  args: {
    trigger: (
      <Button variant="outline">
        <Bell className="h-4 w-4 mr-2" />
        Notifications
        <Badge className="ml-2">3</Badge>
      </Button>
    ),
    title: 'Notifications',
    description: 'Recent activity and updates',
    height: 'lg',
    showCloseButton: true,
    children: (
      <div className="space-y-3">
        {[
          {
            icon: Mail,
            title: 'New email from Sarah',
            description: 'RE: Project update meeting',
            time: '2 min ago',
            unread: true,
          },
          {
            icon: MessageSquare,
            title: 'Team chat message',
            description: 'John mentioned you in #general',
            time: '5 min ago',
            unread: true,
          },
          {
            icon: Download,
            title: 'Download complete',
            description: 'report.pdf has finished downloading',
            time: '10 min ago',
            unread: false,
          },
          {
            icon: Calendar,
            title: 'Meeting reminder',
            description: 'Daily standup in 15 minutes',
            time: '15 min ago',
            unread: false,
          },
        ].map((notification, index) => (
          <div
            key={index}
            className={cn(
              "p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-start gap-3",
              notification.unread && "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
            )}
          >
            <div className={cn(
              "p-2 rounded-full",
              notification.unread 
                ? "bg-blue-100 dark:bg-blue-800" 
                : "bg-gray-100 dark:bg-gray-800"
            )}>
              <notification.icon className={cn(
                "h-4 w-4",
                notification.unread 
                  ? "text-blue-600 dark:text-blue-400" 
                  : "text-gray-600 dark:text-gray-400"
              )} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <h4 className="font-medium text-sm">{notification.title}</h4>
                {notification.unread && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-1 ml-2" />
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {notification.description}
              </p>
              <p className="text-xs text-gray-500 mt-2">{notification.time}</p>
            </div>
          </div>
        ))}
        
        <div className="pt-3 border-t">
          <Button variant="outline" className="w-full">
            View All Notifications
          </Button>
        </div>
      </div>
    ),
  },
};

export const SystemAlert: Story = {
  args: {
    trigger: (
      <Button variant="destructive">
        <AlertTriangle className="h-4 w-4 mr-2" />
        System Alert
      </Button>
    ),
    title: 'System Maintenance',
    description: 'Scheduled maintenance window',
    height: 'sm',
    showCloseButton: true,
    children: (
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Maintenance Scheduled
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
              System will be unavailable on Sunday from 2-4 AM EST for routine maintenance.
            </p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button size="sm" className="flex-1">Learn More</Button>
          <Button size="sm" variant="outline" className="flex-1">Dismiss</Button>
        </div>
      </div>
    ),
  },
};

export const ControlCenter: Story = {
  args: {
    trigger: (
      <Button variant="secondary">
        <Settings className="h-4 w-4 mr-2" />
        Control Center
      </Button>
    ),
    title: 'Quick Controls',
    height: 'md',
    children: (
      <div className="space-y-4">
        {/* Connectivity */}
        <div>
          <h3 className="text-sm font-medium mb-3">Connectivity</h3>
          <div className="grid grid-cols-4 gap-3">
            {[
              { icon: Wifi, label: 'WiFi', active: true },
              { icon: Bluetooth, label: 'Bluetooth', active: false },
              { icon: Plane, label: 'Airplane', active: false },
              { icon: Globe, label: 'Mobile', active: true },
            ].map((control) => (
              <button
                key={control.label}
                className={cn(
                  "p-3 rounded-xl flex flex-col items-center gap-2 transition-colors",
                  control.active
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                )}
              >
                <control.icon className="h-6 w-6" />
                <span className="text-xs font-medium">{control.label}</span>
              </button>
            ))}
          </div>
        </div>
        
        {/* System */}
        <div>
          <h3 className="text-sm font-medium mb-3">System</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-3">
                <Volume2 className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                <span className="text-sm font-medium">Volume</span>
              </div>
              <div className="flex-1 mx-4">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: '60%' }} />
                </div>
              </div>
              <span className="text-sm text-gray-500">60%</span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-3">
                <Battery className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium">Battery</span>
              </div>
              <span className="text-sm font-medium text-green-600">85%</span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
};

export const WeatherWidget: Story = {
  args: {
    trigger: (
      <Button variant="outline">
        <Cloud className="h-4 w-4 mr-2" />
        Weather
      </Button>
    ),
    title: 'Current Weather',
    description: 'San Francisco, CA',
    height: 'md',
    children: (
      <div className="space-y-4">
        {/* Current weather */}
        <div className="text-center py-4">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Cloud className="h-12 w-12 text-gray-600 dark:text-gray-400" />
            <div className="text-4xl font-light">72°F</div>
          </div>
          <p className="text-lg font-medium">Partly Cloudy</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Feels like 75°F
          </p>
        </div>
        
        {/* Details */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Thermometer className="h-4 w-4 text-gray-500" />
              <span className="text-xs text-gray-500">High / Low</span>
            </div>
            <p className="font-medium">78° / 65°</p>
          </div>
          
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-gray-500" />
              <span className="text-xs text-gray-500">Location</span>
            </div>
            <p className="font-medium">Downtown</p>
          </div>
        </div>
        
        {/* 24-hour forecast */}
        <div>
          <h3 className="text-sm font-medium mb-3">24-Hour Forecast</h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {[
              { time: 'Now', temp: '72°', icon: Cloud },
              { time: '3 PM', temp: '75°', icon: Sun },
              { time: '6 PM', temp: '73°', icon: Cloud },
              { time: '9 PM', temp: '69°', icon: Moon },
              { time: '12 AM', temp: '66°', icon: Moon },
            ].map((hour, index) => (
              <div key={index} className="flex flex-col items-center gap-2 min-w-[60px]">
                <span className="text-xs text-gray-500">{hour.time}</span>
                <hour.icon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                <span className="text-sm font-medium">{hour.temp}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
};

export const SearchPalette: Story = {
  args: {
    trigger: (
      <Button variant="outline">
        <Search className="h-4 w-4 mr-2" />
        Search
      </Button>
    ),
    title: 'Search',
    description: 'Find anything quickly',
    height: 'lg',
    children: (
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Search files, contacts, apps..."
            autoFocus
          />
        </div>
        
        <div className="space-y-3">
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Recent Searches
            </h3>
            <div className="space-y-1">
              {[
                'Project proposal',
                'Team meeting notes',
                'Budget spreadsheet',
              ].map((search, index) => (
                <button
                  key={index}
                  className="w-full text-left p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-3"
                >
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="text-sm">{search}</span>
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Quick Actions
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Calendar, label: 'New Event' },
                { icon: Mail, label: 'Compose' },
                { icon: User, label: 'Add Contact' },
                { icon: Settings, label: 'Settings' },
              ].map((action) => (
                <button
                  key={action.label}
                  className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
                >
                  <action.icon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm font-medium">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
  },
};

export const Announcement: Story = {
  args: {
    trigger: (
      <Button>
        <Info className="h-4 w-4 mr-2" />
        Show Announcement
      </Button>
    ),
    title: 'New Features Available!',
    description: 'Check out what\'s new in this update',
    height: 'md',
    showCloseButton: true,
    children: (
      <div className="space-y-4">
        <div className="space-y-3">
          {[
            {
              icon: CheckCircle,
              title: 'Dark Mode Support',
              description: 'Switch between light and dark themes in settings.',
            },
            {
              icon: Bell,
              title: 'Smart Notifications',
              description: 'Get notified about important updates automatically.',
            },
            {
              icon: Search,
              title: 'Improved Search',
              description: 'Find what you need faster with enhanced search.',
            },
          ].map((feature, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <feature.icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="font-medium text-sm">{feature.title}</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
        
        <div className="pt-4 border-t">
          <Button className="w-full">
            Explore New Features
          </Button>
        </div>
      </div>
    ),
  },
};

export const SmallHeight: Story = {
  args: {
    trigger: <Button variant="outline">Small Height</Button>,
    title: 'Quick Message',
    height: 'sm',
    children: (
      <p className="text-sm">This is a compact top sheet with limited height.</p>
    ),
  },
};

export const AutoHeight: Story = {
  args: {
    trigger: <Button variant="outline">Auto Height</Button>,
    title: 'Dynamic Content',
    description: 'Height adjusts to content',
    height: 'auto',
    children: (
      <div className="space-y-4">
        <p>This sheet adjusts its height based on the content inside.</p>
        <p>You can add more content and the sheet will grow accordingly, up to the maximum allowed height.</p>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="p-2 bg-gray-100 dark:bg-gray-800 rounded text-center text-sm">
              Item {i + 1}
            </div>
          ))}
        </div>
        <p>The sheet will never exceed 90% of the viewport height.</p>
      </div>
    ),
  },
};

export const NonDismissible: Story = {
  args: {
    trigger: <Button variant="destructive">Critical Alert</Button>,
    title: 'Critical System Alert',
    description: 'Action required - cannot be dismissed',
    dismissible: false,
    showCloseButton: true,
    children: (
      <div className="space-y-4">
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-800 dark:text-red-200">
                Security Update Required
              </h4>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                Your system requires an immediate security update. Please install the update to continue using the application safely.
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button className="flex-1">Install Update</Button>
          <Button variant="outline" className="flex-1">Learn More</Button>
        </div>
      </div>
    ),
  },
};