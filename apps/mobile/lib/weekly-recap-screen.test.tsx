import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import WeeklyRecapScreen from '@/app/recap/weekly';

const mockUseWeeklyRecap = jest.fn();
const mockRefetch = jest.fn();

type Renderer = ReturnType<typeof TestRenderer.create>;
type TestNode = Renderer['root'];

function getTextContent(node: TestNode): string {
  return node.children
    .map((child: TestNode | string) => {
      if (typeof child === 'string') {
        return child;
      }
      return getTextContent(child);
    })
    .join(' ');
}

function createRecap(overrides?: Record<string, unknown>) {
  return {
    window: {
      timezone: 'America/Chicago',
      startAt: '2026-03-11T05:00:00.000Z',
      endAt: '2026-03-18T05:00:00.000Z',
      comparisonStartAt: '2026-03-04T06:00:00.000Z',
      comparisonEndAt: '2026-03-11T05:00:00.000Z',
      label: 'Last 7 days',
    },
    headline: {
      completedCount: 2,
      estimatedTotalMinutes: 90,
      dominantMode: 'WATCHING' as const,
      completedDeltaPct: 100,
      estimatedMinutesDeltaPct: 50,
    },
    totals: {
      completedCount: 2,
      startedCount: 1,
      estimatedMinutesByMode: {
        reading: 30,
        watching: 45,
        listening: 15,
      },
      contentTypeCounts: {
        article: 1,
        post: 0,
        video: 1,
        podcast: 0,
      },
    },
    trend: [{ date: '2026-03-16', label: 'Mon', completedCount: 1, estimatedMinutes: 45 }],
    highlights: {
      topCreators: [
        {
          creatorId: 'creator-1',
          creator: 'Video Creator',
          completedCount: 1,
          estimatedMinutes: 45,
        },
      ],
      topProviders: [
        {
          provider: 'YOUTUBE',
          completedCount: 1,
          estimatedMinutes: 45,
        },
      ],
      longestCompletedItem: {
        userItemId: 'ui-1',
        title: 'Deep Work Video',
        estimatedMinutes: 45,
      },
      medianBookmarkToFinishHours: 36,
    },
    completedItems: [
      {
        userItemId: 'ui-1',
        itemId: 'item-1',
        title: 'Deep Work Video',
        creator: 'Video Creator',
        provider: 'YOUTUBE',
        contentType: 'VIDEO',
        finishedAt: '2026-03-16T15:00:00.000Z',
        estimatedMinutes: 45,
        thumbnailUrl: null,
        dayBucket: '2026-03-16',
        dayLabel: 'Mon, Mar 16',
      },
    ],
    startedItems: [
      {
        userItemId: 'ui-2',
        itemId: 'item-2',
        title: 'Started Podcast',
        creator: 'Podcast Creator',
        provider: 'SPOTIFY',
        contentType: 'PODCAST',
        lastTouchedAt: '2026-03-17T12:00:00.000Z',
        progressPercent: 40,
        thumbnailUrl: null,
        dayBucket: '2026-03-17',
        dayLabel: 'Tue, Mar 17',
      },
    ],
    ...overrides,
  };
}

jest.mock('expo-router', () => ({
  Stack: {
    Screen: () => null,
  },
}));

jest.mock('react-native', () => ({
  __esModule: true,
  Platform: {
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
  ScrollView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
  View: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

jest.mock('@/components/list-states', () => ({
  EmptyState: ({ title, message }: { title: string; message: string }) =>
    React.createElement('div', null, `${title} ${message}`),
  ErrorState: ({
    title,
    message,
    onRetry,
  }: {
    title: string;
    message: string;
    onRetry: () => void;
  }) =>
    React.createElement('button', { onClick: onRetry, onPress: onRetry }, `${title} ${message}`),
  LoadingState: ({ message }: { message: string }) => React.createElement('div', null, message),
}));

jest.mock('@/components/insights/weekly-recap-chart', () => ({
  WeeklyRecapChart: () => React.createElement('div', null, 'Weekly recap chart'),
}));

jest.mock('@/components/insights/weekly-recap-list', () => ({
  WeeklyRecapList: ({ title }: { title: string }) => React.createElement('div', null, title),
}));

jest.mock('@/components/primitives', () => ({
  Surface: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('section', null, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('span', null, children),
}));

jest.mock('@/hooks/use-insights-trpc', () => ({
  useWeeklyRecap: (...args: unknown[]) => mockUseWeeklyRecap(...args),
}));

jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: {
      background: '#111111',
      surfaceRaised: '#222222',
    },
  }),
}));

describe('WeeklyRecapScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefetch.mockResolvedValue(undefined);
  });

  it('renders a loading state while the recap is being built', () => {
    mockUseWeeklyRecap.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockRefetch,
    });

    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<WeeklyRecapScreen />);
    });

    expect(getTextContent(renderer!.root)).toContain('Building your weekly recap...');
  });

  it('renders an error state and retries when loading fails', () => {
    mockUseWeeklyRecap.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('network down'),
      refetch: mockRefetch,
    });

    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<WeeklyRecapScreen />);
    });

    expect(getTextContent(renderer!.root)).toContain('Could not load recap');
    expect(getTextContent(renderer!.root)).toContain('network down');

    const retryButton = renderer!.root.find((node: TestNode) => node.type === 'button');
    act(() => {
      retryButton.props.onPress();
    });

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('renders the quiet-week empty state when there are no completed items', () => {
    mockUseWeeklyRecap.mockReturnValue({
      data: createRecap({
        headline: {
          completedCount: 0,
          estimatedTotalMinutes: 0,
          dominantMode: 'NONE',
          completedDeltaPct: 0,
          estimatedMinutesDeltaPct: 0,
        },
        totals: {
          completedCount: 0,
          startedCount: 2,
          estimatedMinutesByMode: {
            reading: 0,
            watching: 0,
            listening: 0,
          },
          contentTypeCounts: {
            article: 0,
            post: 0,
            video: 0,
            podcast: 0,
          },
        },
        completedItems: [],
      }),
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<WeeklyRecapScreen />);
    });

    expect(getTextContent(renderer!.root)).toContain('A quieter week');
    expect(getTextContent(renderer!.root)).toContain('No completed items in the last 7 days');
    expect(getTextContent(renderer!.root)).toContain('You still started 2 items.');
  });

  it('renders the populated recap view with chart and lists', () => {
    mockUseWeeklyRecap.mockReturnValue({
      data: createRecap(),
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<WeeklyRecapScreen />);
    });

    const output = getTextContent(renderer!.root);

    expect(output).toContain('Last 7 days');
    expect(output).toContain('2 completions');
    expect(output).toContain('1h 30m');
    expect(output).toContain('estimated time');
    expect(output).toContain('Estimated time split');
    expect(output).toContain('Weekly recap chart');
    expect(output).toContain('What you completed');
    expect(output).toContain('Started but not finished');
  });
});
