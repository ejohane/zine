import type { Meta, StoryObj } from '@storybook/react';
import { Toast, ToastProvider, useToast } from './Toast';
import { Button } from '../../ui/button';
import { 
  Save, 
  Download, 
  Upload, 
  Trash2, 
  Copy, 
  Settings, 
  User, 
  Mail,
  Calendar,
  File,
  Image,
  Video,
  Music
} from 'lucide-react';

const meta: Meta<typeof Toast> = {
  title: 'Silk/Toast',
  component: Toast,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'A notification toast component with multiple variants and positions. Use the ToastProvider to manage multiple toasts.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ToastProvider>
        <div style={{ minHeight: '500px', padding: '2rem' }}>
          <Story />
        </div>
      </ToastProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const ToastDemo: React.FC<{ variant?: any, title?: string, description?: string, action?: any }> = ({ 
  variant = 'default', 
  title = 'Notification', 
  description = 'This is a toast notification', 
  action 
}) => {
  const { addToast } = useToast();

  const handleShowToast = () => {
    addToast({
      variant,
      title,
      description,
      action,
    });
  };

  return (
    <Button onClick={handleShowToast}>
      Show {variant} Toast
    </Button>
  );
};

export const Default: Story = {
  render: () => <ToastDemo />,
};

export const Success: Story = {
  render: () => (
    <ToastDemo
      variant="success"
      title="Success!"
      description="Your changes have been saved successfully."
    />
  ),
};

export const Error: Story = {
  render: () => (
    <ToastDemo
      variant="error"
      title="Error"
      description="Something went wrong. Please try again."
    />
  ),
};

export const Warning: Story = {
  render: () => (
    <ToastDemo
      variant="warning"
      title="Warning"
      description="This action cannot be undone."
    />
  ),
};

export const Info: Story = {
  render: () => (
    <ToastDemo
      variant="info"
      title="Information"
      description="Your account will be upgraded in 24 hours."
    />
  ),
};

export const WithAction: Story = {
  render: () => (
    <ToastDemo
      variant="success"
      title="File uploaded"
      description="Your file has been uploaded successfully."
      action={{
        label: "View file",
        onClick: () => alert("Viewing file...")
      }}
    />
  ),
};

export const AllVariants: Story = {
  render: () => {
    const { addToast } = useToast();

    const showAllToasts = () => {
      addToast({
        variant: 'success',
        title: 'Success!',
        description: 'Operation completed successfully.',
      });
      
      setTimeout(() => {
        addToast({
          variant: 'error',
          title: 'Error occurred',
          description: 'Something went wrong with your request.',
        });
      }, 500);
      
      setTimeout(() => {
        addToast({
          variant: 'warning',
          title: 'Warning',
          description: 'Please review your settings.',
        });
      }, 1000);
      
      setTimeout(() => {
        addToast({
          variant: 'info',
          title: 'New update available',
          description: 'Version 2.0 is now available for download.',
        });
      }, 1500);
    };

    return (
      <Button onClick={showAllToasts}>
        Show All Toast Types
      </Button>
    );
  },
};

export const FileOperations: Story = {
  render: () => {
    const { addToast } = useToast();

    const fileOperations = [
      {
        icon: Save,
        label: 'Save File',
        action: () => addToast({
          variant: 'success',
          title: 'File saved',
          description: 'document.pdf has been saved to your downloads.',
          action: {
            label: 'Open folder',
            onClick: () => alert('Opening downloads folder...')
          }
        })
      },
      {
        icon: Download,
        label: 'Download',
        action: () => addToast({
          variant: 'info',
          title: 'Download started',
          description: 'Your file will be ready in a few moments.',
        })
      },
      {
        icon: Upload,
        label: 'Upload',
        action: () => addToast({
          variant: 'success',
          title: 'Upload complete',
          description: '3 files uploaded successfully.',
        })
      },
      {
        icon: Copy,
        label: 'Copy Link',
        action: () => addToast({
          variant: 'default',
          title: 'Link copied',
          description: 'Share link has been copied to clipboard.',
        })
      },
      {
        icon: Trash2,
        label: 'Delete',
        action: () => addToast({
          variant: 'warning',
          title: 'File deleted',
          description: 'document.pdf has been moved to trash.',
          action: {
            label: 'Undo',
            onClick: () => alert('File restored!')
          }
        })
      },
    ];

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">File Operations</h3>
        <div className="grid grid-cols-2 gap-3">
          {fileOperations.map((operation) => (
            <Button
              key={operation.label}
              variant="outline"
              onClick={operation.action}
              className="flex items-center gap-2"
            >
              <operation.icon className="h-4 w-4" />
              {operation.label}
            </Button>
          ))}
        </div>
      </div>
    );
  },
};

export const UserActions: Story = {
  render: () => {
    const { addToast } = useToast();

    const userActions = [
      {
        icon: User,
        label: 'Profile Updated',
        action: () => addToast({
          variant: 'success',
          title: 'Profile updated',
          description: 'Your profile information has been saved.',
        })
      },
      {
        icon: Mail,
        label: 'Email Sent',
        action: () => addToast({
          variant: 'success',
          title: 'Email sent',
          description: 'Your message has been delivered to 3 recipients.',
          action: {
            label: 'View sent',
            onClick: () => alert('Opening sent folder...')
          }
        })
      },
      {
        icon: Calendar,
        label: 'Event Created',
        action: () => addToast({
          variant: 'info',
          title: 'Event created',
          description: 'Team meeting scheduled for tomorrow at 2 PM.',
        })
      },
      {
        icon: Settings,
        label: 'Settings Error',
        action: () => addToast({
          variant: 'error',
          title: 'Failed to save settings',
          description: 'Please check your connection and try again.',
          action: {
            label: 'Retry',
            onClick: () => alert('Retrying...')
          }
        })
      },
    ];

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">User Actions</h3>
        <div className="grid grid-cols-2 gap-3">
          {userActions.map((action) => (
            <Button
              key={action.label}
              variant="outline"
              onClick={action.action}
              className="flex items-center gap-2"
            >
              <action.icon className="h-4 w-4" />
              {action.label}
            </Button>
          ))}
        </div>
      </div>
    );
  },
};

export const MediaUpload: Story = {
  render: () => {
    const { addToast } = useToast();

    const simulateUpload = (type: string, icon: any) => {
      // Start upload
      addToast({
        variant: 'info',
        title: `${type} upload started`,
        description: 'Processing your file...',
        persistent: true,
      });

      // Simulate progress
      setTimeout(() => {
        addToast({
          variant: 'success',
          title: `${type} uploaded`,
          description: `Your ${type.toLowerCase()} has been uploaded successfully.`,
          action: {
            label: 'View',
            onClick: () => alert(`Viewing ${type.toLowerCase()}...`)
          }
        });
      }, 2000);
    };

    const mediaTypes = [
      { type: 'Image', icon: Image },
      { type: 'Video', icon: Video },
      { type: 'Music', icon: Music },
      { type: 'Document', icon: File },
    ];

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Media Upload</h3>
        <div className="grid grid-cols-2 gap-3">
          {mediaTypes.map((media) => (
            <Button
              key={media.type}
              onClick={() => simulateUpload(media.type, media.icon)}
              className="flex items-center gap-2"
            >
              <media.icon className="h-4 w-4" />
              Upload {media.type}
            </Button>
          ))}
        </div>
      </div>
    );
  },
};

export const PersistentToast: Story = {
  render: () => (
    <ToastDemo
      variant="warning"
      title="Persistent notification"
      description="This toast will not auto-dismiss. Click the X to close."
    />
  ),
  args: {
    persistent: true,
  },
};

export const DifferentPositions: Story = {
  render: () => {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Toast Positions</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          This story demonstrates how to configure different toast positions using the ToastProvider.
          In a real application, you would wrap your app with ToastProvider and set the desired position.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            'top-left',
            'top-center', 
            'top-right',
            'bottom-left',
            'bottom-center',
            'bottom-right'
          ].map((position) => (
            <div key={position} className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">{position}</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                ToastProvider position="{position}"
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  },
};

export const MultipleToasts: Story = {
  render: () => {
    const { addToast, clearToasts } = useToast();

    const addMultipleToasts = () => {
      const messages = [
        { variant: 'success', title: 'Task 1 completed', description: 'Data sync finished.' },
        { variant: 'info', title: 'Task 2 in progress', description: 'Processing files...' },
        { variant: 'warning', title: 'Task 3 needs attention', description: 'Please review settings.' },
        { variant: 'error', title: 'Task 4 failed', description: 'Connection timeout.' },
        { variant: 'success', title: 'Task 5 completed', description: 'All done!' },
      ];

      messages.forEach((message, index) => {
        setTimeout(() => {
          addToast(message as any);
        }, index * 300);
      });
    };

    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <Button onClick={addMultipleToasts}>
            Add Multiple Toasts
          </Button>
          <Button variant="outline" onClick={clearToasts}>
            Clear All
          </Button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Click "Add Multiple Toasts" to see how multiple notifications are handled.
          The maximum number of toasts is configurable in ToastProvider.
        </p>
      </div>
    );
  },
};