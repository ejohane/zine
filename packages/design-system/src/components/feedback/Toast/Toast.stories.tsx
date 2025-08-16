import type { Meta, StoryObj } from '@storybook/react';
import { Toast } from './Toast';
import { Stack } from '../../layout/Stack';
import { Button } from '../../ui/button';

const meta: Meta<typeof Toast> = {
  title: 'Feedback/Toast',
  component: Toast,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: { type: 'select' },
      options: ['default', 'success', 'error', 'warning', 'info'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Notification',
    description: 'This is a default toast message.',
  },
};

export const Success: Story = {
  args: {
    variant: 'success',
    title: 'Success!',
    description: 'Your changes have been saved successfully.',
  },
};

export const Error: Story = {
  args: {
    variant: 'error',
    title: 'Error',
    description: 'Something went wrong. Please try again.',
    onClose: () => console.log('Close clicked'),
  },
};

export const Warning: Story = {
  args: {
    variant: 'warning',
    title: 'Warning',
    description: 'Your session will expire in 5 minutes.',
  },
};

export const Info: Story = {
  args: {
    variant: 'info',
    title: 'Information',
    description: 'New features are available in your dashboard.',
  },
};

export const WithAction: Story = {
  args: {
    variant: 'info',
    title: 'New Update Available',
    description: 'Version 2.0 is now available with new features.',
    action: (
      <div className="flex gap-2">
        <Button size="sm" variant="outline">
          Later
        </Button>
        <Button size="sm">Update Now</Button>
      </div>
    ),
  },
};

export const AllVariants: Story = {
  render: () => (
    <Stack gap={4}>
      <Toast
        title="Default Toast"
        description="This is a default notification message."
        onClose={() => {}}
      />
      <Toast
        variant="success"
        title="Success!"
        description="Your bookmark has been saved."
        onClose={() => {}}
      />
      <Toast
        variant="error"
        title="Error"
        description="Failed to delete the item."
        onClose={() => {}}
      />
      <Toast
        variant="warning"
        title="Warning"
        description="You have unsaved changes."
        onClose={() => {}}
      />
      <Toast
        variant="info"
        title="Info"
        description="3 new bookmarks added to your collection."
        onClose={() => {}}
      />
    </Stack>
  ),
};

export const RealWorldExamples: Story = {
  render: () => (
    <Stack gap={4}>
      <Toast
        variant="success"
        title="Bookmark Added"
        description="The article has been saved to your reading list."
        action={
          <Button size="sm" variant="outline">
            View Bookmark
          </Button>
        }
        onClose={() => {}}
      />
      
      <Toast
        variant="error"
        title="Upload Failed"
        description="The file size exceeds the maximum limit of 10MB."
        action={
          <Button size="sm" variant="outline">
            Try Again
          </Button>
        }
        onClose={() => {}}
      />
      
      <Toast
        variant="info"
        title="Sync Complete"
        description="5 new episodes from your subscriptions are available."
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline">
              Dismiss
            </Button>
            <Button size="sm">View Episodes</Button>
          </div>
        }
        onClose={() => {}}
      />
    </Stack>
  ),
};