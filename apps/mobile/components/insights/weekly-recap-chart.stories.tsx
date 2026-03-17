import type { Meta, StoryObj } from '@storybook/react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Spacing } from '@/constants/theme';
import { WeeklyRecapChart } from './weekly-recap-chart';

const meta = {
  title: 'Insights/WeeklyRecapChart',
  component: WeeklyRecapChart,
  decorators: [createDarkCanvasDecorator({ padding: Spacing.md })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof WeeklyRecapChart>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ActiveWeek: Story = {
  args: {
    trend: [
      {
        date: '2026-03-11',
        label: 'Wed',
        completedCount: 1,
        estimatedMinutes: 22,
        readingMinutes: 22,
        watchingMinutes: 0,
        listeningMinutes: 0,
      },
      {
        date: '2026-03-12',
        label: 'Thu',
        completedCount: 2,
        estimatedMinutes: 64,
        readingMinutes: 14,
        watchingMinutes: 50,
        listeningMinutes: 0,
      },
      {
        date: '2026-03-13',
        label: 'Fri',
        completedCount: 0,
        estimatedMinutes: 0,
        readingMinutes: 0,
        watchingMinutes: 0,
        listeningMinutes: 0,
      },
      {
        date: '2026-03-14',
        label: 'Sat',
        completedCount: 1,
        estimatedMinutes: 38,
        readingMinutes: 0,
        watchingMinutes: 0,
        listeningMinutes: 38,
      },
      {
        date: '2026-03-15',
        label: 'Sun',
        completedCount: 3,
        estimatedMinutes: 90,
        readingMinutes: 45,
        watchingMinutes: 25,
        listeningMinutes: 20,
      },
      {
        date: '2026-03-16',
        label: 'Mon',
        completedCount: 2,
        estimatedMinutes: 48,
        readingMinutes: 18,
        watchingMinutes: 30,
        listeningMinutes: 0,
      },
      {
        date: '2026-03-17',
        label: 'Tue',
        completedCount: 1,
        estimatedMinutes: 30,
        readingMinutes: 0,
        watchingMinutes: 30,
        listeningMinutes: 0,
      },
    ],
  },
};

export const EmptyWeek: Story = {
  args: {
    trend: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-03-${String(index + 11).padStart(2, '0')}`,
      label: ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'][index] ?? 'Day',
      completedCount: 0,
      estimatedMinutes: 0,
      readingMinutes: 0,
      watchingMinutes: 0,
      listeningMinutes: 0,
    })),
  },
};
