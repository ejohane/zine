import type { Meta, StoryObj } from '@storybook/react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Spacing } from '@/constants/theme';
import { WeeklyRecapList } from './weekly-recap-list';

const meta = {
  title: 'Insights/WeeklyRecapList',
  component: WeeklyRecapList,
  decorators: [createDarkCanvasDecorator({ height: 720, padding: Spacing.md })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof WeeklyRecapList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Completed: Story = {
  args: {
    title: 'What you completed',
    variant: 'completed',
    items: [
      {
        userItemId: 'ui-video',
        itemId: 'item-video',
        title: 'Deep Work Interview',
        creator: 'Video Creator',
        provider: 'YOUTUBE',
        contentType: 'VIDEO',
        finishedAt: '2026-03-16T15:00:00.000Z',
        estimatedMinutes: 42,
        thumbnailUrl: 'https://example.com/video.jpg',
        dayBucket: '2026-03-16',
        dayLabel: 'Mon, Mar 16',
      },
      {
        userItemId: 'ui-article',
        itemId: 'item-article',
        title: 'The Week in Writing',
        creator: 'Essayist',
        provider: 'WEB',
        contentType: 'ARTICLE',
        finishedAt: '2026-03-16T12:00:00.000Z',
        estimatedMinutes: 11,
        thumbnailUrl: null,
        dayBucket: '2026-03-16',
        dayLabel: 'Mon, Mar 16',
      },
      {
        userItemId: 'ui-podcast',
        itemId: 'item-podcast',
        title: 'Thinking in Systems',
        creator: 'Podcast Host',
        provider: 'SPOTIFY',
        contentType: 'PODCAST',
        finishedAt: '2026-03-15T18:00:00.000Z',
        estimatedMinutes: 58,
        thumbnailUrl: null,
        dayBucket: '2026-03-15',
        dayLabel: 'Sun, Mar 15',
      },
    ],
  },
};

export const Started: Story = {
  args: {
    title: 'Started but not finished',
    variant: 'started',
    items: [
      {
        userItemId: 'ui-started-video',
        itemId: 'item-started-video',
        title: 'Open Tabs That Matter',
        creator: 'Video Creator',
        provider: 'YOUTUBE',
        contentType: 'VIDEO',
        lastTouchedAt: '2026-03-17T02:30:00.000Z',
        progressPercent: 54,
        thumbnailUrl: 'https://example.com/started-video.jpg',
        dayBucket: '2026-03-17',
        dayLabel: 'Tue, Mar 17',
      },
      {
        userItemId: 'ui-started-article',
        itemId: 'item-started-article',
        title: 'Notes on Reading Better',
        creator: 'Writer',
        provider: 'RSS',
        contentType: 'ARTICLE',
        lastTouchedAt: '2026-03-16T08:00:00.000Z',
        progressPercent: null,
        thumbnailUrl: null,
        dayBucket: '2026-03-16',
        dayLabel: 'Mon, Mar 16',
      },
    ],
  },
};
