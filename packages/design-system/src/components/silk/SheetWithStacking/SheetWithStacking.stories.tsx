import type { Meta, StoryObj } from '@storybook/react';
import { SheetWithStacking } from './SheetWithStacking';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { 
  Folder, 
  File, 
  ChevronRight, 
  User, 
  CreditCard, 
  Bell, 
  Lock,
  Image,
  Video,
  Music,
  Download,
  Share2,
  Star,
  Calendar,
  Clock,
  MapPin,
  Edit,
  Trash2
} from 'lucide-react';

const meta: Meta<typeof SheetWithStacking> = {
  title: 'Silk/SheetWithStacking',
  component: SheetWithStacking,
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
        component: 'A sheet component that supports stacking multiple sheets on top of each other, creating a layered navigation experience.',
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

// File Explorer Example
interface SheetData {
  type: string;
  data?: unknown;
  id?: string;
  title?: string;
  description?: string;
  children?: React.ReactNode;
}

const FileExplorerContent: React.FC<{ onOpenSheet?: (sheet: SheetData) => void }> = ({ onOpenSheet }) => {
  const folders = [
    { name: 'Documents', icon: Folder, count: 25 },
    { name: 'Photos', icon: Image, count: 150 },
    { name: 'Videos', icon: Video, count: 12 },
    { name: 'Music', icon: Music, count: 89 },
  ];

  const files = [
    { name: 'Report.pdf', icon: File, size: '2.4 MB' },
    { name: 'Presentation.pptx', icon: File, size: '5.8 MB' },
    { name: 'Budget.xlsx', icon: File, size: '1.2 MB' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Folders</h3>
        <div className="space-y-2">
          {folders.map((folder) => (
            <button
              key={folder.name}
              onClick={() => onOpenSheet?.({
                type: 'folder',
                id: folder.name.toLowerCase(),
                title: folder.name,
                description: `${folder.count} items`,
                children: <FolderContent folder={folder} onOpenSheet={onOpenSheet} />
              })}
              className="w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-3"
            >
              <folder.icon className="h-5 w-5 text-blue-500" />
              <div className="flex-1 text-left">
                <div className="font-medium">{folder.name}</div>
                <div className="text-sm text-gray-500">{folder.count} items</div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>
          ))}
        </div>
      </div>
      
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Files</h3>
        <div className="space-y-2">
          {files.map((file) => (
            <button
              key={file.name}
              onClick={() => onOpenSheet?.({
                type: 'file',
                id: file.name.toLowerCase().replace(/\./g, '-'),
                title: file.name,
                description: 'File details',
                children: <FileDetails file={file} />
              })}
              className="w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-3"
            >
              <file.icon className="h-5 w-5 text-gray-500" />
              <div className="flex-1 text-left">
                <div className="font-medium">{file.name}</div>
                <div className="text-sm text-gray-500">{file.size}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

interface FolderData {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
}

const FolderContent: React.FC<{ folder: FolderData, onOpenSheet?: (sheet: SheetData) => void }> = ({ folder, onOpenSheet }) => {
  const items = Array.from({ length: folder.count }, (_, i) => ({
    name: `${folder.name.slice(0, -1)} ${i + 1}`,
    type: folder.name === 'Photos' ? 'image' : folder.name === 'Videos' ? 'video' : 'file',
    size: `${(Math.random() * 10 + 1).toFixed(1)} MB`
  }));

  return (
    <div className="space-y-2">
      {items.slice(0, 10).map((item, index) => (
        <button
          key={index}
          onClick={() => onOpenSheet?.({
            type: 'file',
            id: `${folder.name.toLowerCase()}-${index}`,
            title: item.name,
            description: 'Item details',
            children: <FileDetails file={item} />
          })}
          className="w-full p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-3"
        >
          <File className="h-4 w-4 text-gray-500" />
          <div className="flex-1 text-left">
            <div className="font-medium">{item.name}</div>
            <div className="text-sm text-gray-500">{item.size}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </button>
      ))}
    </div>
  );
};

interface FileData {
  name: string;
  size: string;
  icon?: React.ComponentType<{ className?: string }>;
}

const FileDetails: React.FC<{ file: FileData }> = ({ file }) => (
  <div className="space-y-4">
    <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-lg flex items-center justify-center">
      <File className="h-16 w-16 text-gray-400" />
    </div>
    
    <div className="space-y-2">
      <div className="flex justify-between">
        <span className="text-sm text-gray-500">Size:</span>
        <span className="text-sm font-medium">{file.size}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-sm text-gray-500">Modified:</span>
        <span className="text-sm font-medium">2 hours ago</span>
      </div>
      <div className="flex justify-between">
        <span className="text-sm text-gray-500">Type:</span>
        <span className="text-sm font-medium">{file.name.split('.').pop()?.toUpperCase()}</span>
      </div>
    </div>
    
    <div className="grid grid-cols-2 gap-2 pt-4">
      <Button variant="outline" size="sm">
        <Download className="h-4 w-4 mr-2" />
        Download
      </Button>
      <Button variant="outline" size="sm">
        <Share2 className="h-4 w-4 mr-2" />
        Share
      </Button>
    </div>
  </div>
);

// Settings Navigation Example
const SettingsContent: React.FC<{ onOpenSheet?: (sheet: SheetData) => void }> = ({ onOpenSheet }) => {
  const settings = [
    { 
      icon: User, 
      label: 'Profile', 
      description: 'Manage your account',
      id: 'profile'
    },
    { 
      icon: Bell, 
      label: 'Notifications', 
      description: 'Control your alerts',
      id: 'notifications'
    },
    { 
      icon: Lock, 
      label: 'Privacy', 
      description: 'Manage privacy settings',
      id: 'privacy'
    },
    { 
      icon: CreditCard, 
      label: 'Billing', 
      description: 'Payment and subscription',
      id: 'billing'
    },
  ];

  return (
    <div className="space-y-2">
      {settings.map((setting) => (
        <button
          key={setting.id}
          onClick={() => onOpenSheet?.({
            type: 'setting',
            id: setting.id,
            title: setting.label,
            description: setting.description,
            children: <SettingDetails setting={setting} onOpenSheet={onOpenSheet} />
          })}
          className="w-full p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-3"
        >
          <setting.icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <div className="flex-1 text-left">
            <div className="font-medium">{setting.label}</div>
            <div className="text-sm text-gray-500">{setting.description}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </button>
      ))}
    </div>
  );
};

type SettingOption = 
  | { label: string; action: () => void; toggle?: never }
  | { label: string; toggle: boolean; action?: never };

interface SettingData {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SettingDetails: React.FC<{ setting: SettingData, onOpenSheet?: (sheet: SheetData) => void }> = ({ setting, onOpenSheet }) => {
  const getSettingOptions = (): SettingOption[] => {
    switch (setting.id) {
      case 'profile':
        return [
          { label: 'Edit Profile', action: () => onOpenSheet?.({
            type: 'form',
            id: 'edit-profile',
            title: 'Edit Profile',
            children: <EditProfileForm />
          })},
          { label: 'Change Password', action: () => {} },
          { label: 'Delete Account', action: () => {} },
        ];
      case 'notifications':
        return [
          { label: 'Push Notifications', toggle: true },
          { label: 'Email Notifications', toggle: true },
          { label: 'SMS Notifications', toggle: false },
        ];
      case 'privacy':
        return [
          { label: 'Data Collection', toggle: false },
          { label: 'Analytics', toggle: true },
          { label: 'Personalization', toggle: true },
        ];
      case 'billing':
        return [
          { label: 'Payment Methods', action: () => onOpenSheet?.({
            type: 'list',
            id: 'payment-methods',
            title: 'Payment Methods',
            children: <PaymentMethods />
          })},
          { label: 'Billing History', action: () => {} },
          { label: 'Subscription', action: () => {} },
        ];
      default:
        return [];
    }
  };

  return (
    <div className="space-y-4">
      {getSettingOptions().map((option, index) => (
        <div
          key={index}
          className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between"
        >
          <span className="font-medium">{option.label}</span>
          {'toggle' in option ? (
            <div className={`w-12 h-6 rounded-full ${option.toggle ? 'bg-blue-500' : 'bg-gray-300'} relative transition-colors`}>
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${option.toggle ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={option.action}>
              Open
            </Button>
          )}
        </div>
      ))}
    </div>
  );
};

const EditProfileForm: React.FC = () => (
  <form className="space-y-4">
    <div>
      <label className="block text-sm font-medium mb-2">Name</label>
      <input
        type="text"
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
        defaultValue="John Doe"
      />
    </div>
    <div>
      <label className="block text-sm font-medium mb-2">Email</label>
      <input
        type="email"
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
        defaultValue="john@example.com"
      />
    </div>
    <div>
      <label className="block text-sm font-medium mb-2">Bio</label>
      <textarea
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
        rows={3}
        defaultValue="Software developer passionate about creating great user experiences."
      />
    </div>
    <Button className="w-full">Save Changes</Button>
  </form>
);

const PaymentMethods: React.FC = () => (
  <div className="space-y-4">
    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-gray-500" />
          <div>
            <div className="font-medium">•••• •••• •••• 1234</div>
            <div className="text-sm text-gray-500">Expires 12/25</div>
          </div>
        </div>
        <Badge>Default</Badge>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm">
          <Edit className="h-4 w-4 mr-2" />
          Edit
        </Button>
        <Button variant="outline" size="sm">
          <Trash2 className="h-4 w-4 mr-2" />
          Remove
        </Button>
      </div>
    </div>
    
    <Button variant="outline" className="w-full">
      Add New Payment Method
    </Button>
  </div>
);

export const Default: Story = {
  args: {
    trigger: <Button>Open File Explorer</Button>,
    sheets: [
      {
        id: 'root',
        title: 'File Explorer',
        description: 'Browse your files and folders',
        level: 0,
        children: <FileExplorerContent />
      }
    ],
  },
};

export const SettingsNavigation: Story = {
  args: {
    trigger: <Button variant="outline">Open Settings</Button>,
    sheets: [
      {
        id: 'settings',
        title: 'Settings',
        description: 'Manage your preferences',
        level: 0,
        children: <SettingsContent />
      }
    ],
  },
};

export const ProductCatalog: Story = {
  args: {
    trigger: <Button variant="secondary">Browse Catalog</Button>,
    sheets: [
      {
        id: 'catalog',
        title: 'Product Catalog',
        description: 'Explore our products',
        level: 0,
        children: (
          <div className="space-y-4">
            {['Electronics', 'Clothing', 'Home & Garden', 'Sports'].map((category) => (
              <button
                key={category}
                className="w-full p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-between"
              >
                <div className="text-left">
                  <div className="font-medium">{category}</div>
                  <div className="text-sm text-gray-500">{Math.floor(Math.random() * 100) + 10} items</div>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </button>
            ))}
          </div>
        )
      }
    ],
  },
};

export const EventDetails: Story = {
  args: {
    trigger: <Button>View Event</Button>,
    sheets: [
      {
        id: 'event',
        title: 'Tech Conference 2024',
        description: 'Annual technology conference',
        level: 0,
        children: (
          <div className="space-y-6">
            <div className="aspect-video bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Calendar className="h-16 w-16 text-white/80" />
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-gray-500" />
                <div>
                  <div className="font-medium">March 15-17, 2024</div>
                  <div className="text-sm text-gray-500">3 days</div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-gray-500" />
                <div>
                  <div className="font-medium">San Francisco, CA</div>
                  <div className="text-sm text-gray-500">Moscone Center</div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-gray-500" />
                <div>
                  <div className="font-medium">9:00 AM - 6:00 PM</div>
                  <div className="text-sm text-gray-500">Daily schedule</div>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Button className="w-full">Register Now</Button>
              <Button variant="outline" className="w-full">
                <Star className="h-4 w-4 mr-2" />
                Add to Favorites
              </Button>
            </div>
          </div>
        )
      }
    ],
  },
};

export const LimitedStacks: Story = {
  args: {
    trigger: <Button variant="outline">Limited Stacks (2)</Button>,
    maxStacks: 2,
    sheets: [
      {
        id: 'limited',
        title: 'Stack Limit Demo',
        description: 'Maximum 2 sheets can be stacked',
        level: 0,
        children: <SettingsContent />
      }
    ],
  },
};