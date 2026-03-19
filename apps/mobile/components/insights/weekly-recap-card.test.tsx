import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { WeeklyRecapCard } from './weekly-recap-card';

jest.mock('react-native', () => ({
  __esModule: true,
  Platform: {
    OS: 'ios',
    select: jest.fn((options: Record<string, unknown>) => options.ios ?? options.default),
  },
  Pressable: ({
    children,
  }: {
    children: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
  }) =>
    React.createElement(
      'div',
      null,
      typeof children === 'function' ? children({ pressed: false }) : children
    ),
  View: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

jest.mock('@/components/primitives', () => ({
  Surface: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('section', null, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('span', null, children),
}));

jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: {
      accent: '#fff',
    },
  }),
}));

const recap = {
  window: {
    timezone: 'America/Chicago',
    startAt: '2026-03-08T06:00:00.000Z',
    endAt: '2026-03-15T05:00:00.000Z',
    comparisonStartAt: '2026-03-01T06:00:00.000Z',
    comparisonEndAt: '2026-03-08T06:00:00.000Z',
    label: 'Mar 8 - Mar 14',
  },
  headline: 'You finished 4 things last week',
  supportingLine: '1h 20m reading, 35m watching',
  trendLabel: 'Up 42% vs last week',
  completedCount: 4,
  startedCount: 2,
  estimatedTotalMinutes: 115,
  estimatedMinutesByMode: {
    reading: 80,
    watching: 35,
    listening: 0,
  },
  dominantMode: 'READING' as const,
  completedDeltaPct: 100,
  estimatedMinutesDeltaPct: 42,
};

describe('WeeklyRecapCard', () => {
  it('renders recap teaser content for Home', () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    act(() => {
      renderer = TestRenderer.create(<WeeklyRecapCard recap={recap} />);
    });
    const output = renderer.root
      .findAll((node: any) => node.type === 'span')
      .flatMap((node: any) => node.children)
      .join(' ');

    expect(output).toContain('Weekly recap');
    expect(output).toContain('You finished 4 things last week');
    expect(output).toContain('1h 20m reading, 35m watching');
    expect(output).toContain('See full recap');
  });

  it('renders a loading state before data is available', () => {
    let renderer: ReturnType<typeof TestRenderer.create>;
    act(() => {
      renderer = TestRenderer.create(<WeeklyRecapCard isLoading />);
    });
    const output = renderer.root
      .findAll((node: any) => node.type === 'span')
      .flatMap((node: any) => node.children)
      .join(' ');

    expect(output).toContain('Loading your weekly recap');
    expect(output).toContain('Pulling together recent completions');
  });
});
