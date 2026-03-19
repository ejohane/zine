import type { Meta, StoryObj } from '@storybook/react-native';

import { createDarkCanvasDecorator } from '@/components/storybook/decorators';
import { Spacing } from '@/constants/theme';
import { WeeklyRecapCard } from './weekly-recap-card';

const teaserFixture = {
  window: {
    timezone: 'America/Chicago',
    startAt: '2026-03-08T06:00:00.000Z',
    endAt: '2026-03-15T05:00:00.000Z',
    comparisonStartAt: '2026-03-01T06:00:00.000Z',
    comparisonEndAt: '2026-03-08T06:00:00.000Z',
    label: 'Mar 8 - Mar 14',
  },
  headline: 'You finished 14 things last week',
  supportingLine: '3h 20m reading, 1h 10m watching, 42m listening',
  trendLabel: 'Up 18% vs last week',
  completedCount: 14,
  startedCount: 5,
  estimatedTotalMinutes: 312,
  estimatedMinutesByMode: {
    reading: 200,
    watching: 70,
    listening: 42,
  },
  dominantMode: 'READING' as const,
  completedDeltaPct: 18,
  estimatedMinutesDeltaPct: 18,
};

const meta = {
  title: 'Insights/WeeklyRecapCard',
  component: WeeklyRecapCard,
  decorators: [createDarkCanvasDecorator({ padding: Spacing.md })],
  parameters: {
    backgrounds: {
      default: 'dark',
    },
  },
} satisfies Meta<typeof WeeklyRecapCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    recap: teaserFixture,
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};
