import type { Meta, StoryObj } from '@storybook/react-native';
import { Spacing } from '@/constants/theme';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import {
  EmptyState,
  ErrorState,
  InvalidParamState,
  LoadingState,
  NotFoundState,
} from './list-states';

const meta = {
  title: 'Feedback/ListStates',
  component: LoadingState,
  decorators: [createDarkCanvasDecorator({ height: 420, padding: Spacing.md })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof LoadingState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: () => <LoadingState message="Loading your latest content..." />,
};

export const Error: Story = {
  render: () => (
    <ErrorState
      title="Could not load items"
      message="The request timed out while loading your library."
      retryLabel="Retry"
      onRetry={() => {}}
    />
  ),
};

export const Empty: Story = {
  render: () => (
    <EmptyState
      title="No bookmarks yet"
      message="Save content from your inbox to build your library."
      actionLabel="Browse Inbox"
      onAction={() => {}}
    />
  ),
};

export const NotFound: Story = {
  render: () => (
    <NotFoundState
      title="Item not found"
      message="This item was removed or is no longer available."
      onBack={() => {}}
    />
  ),
};

export const InvalidParam: Story = {
  render: () => (
    <InvalidParamState
      title="Invalid item link"
      message="The item ID in this link is missing or malformed."
      onBack={() => {}}
    />
  ),
};
