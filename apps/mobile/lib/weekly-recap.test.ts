import {
  buildModeSplit,
  buildWeeklyRecapEmptyState,
  formatDeltaLabel,
  formatEstimatedMinutes,
  getDominantModeLabel,
  groupRecapItemsByDay,
  shouldShowWeeklyRecapEntry,
} from './weekly-recap';

const recapFixture = {
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
  trend: [],
  highlights: {
    topCreators: [],
    topProviders: [],
    longestCompletedItem: null,
    medianBookmarkToFinishHours: null,
  },
  completedItems: [
    {
      userItemId: 'ui-2',
      itemId: 'item-2',
      title: 'Second',
      creator: 'Creator',
      provider: 'RSS',
      contentType: 'ARTICLE',
      finishedAt: '2026-03-16T12:00:00.000Z',
      estimatedMinutes: 30,
      thumbnailUrl: null,
      dayBucket: '2026-03-16',
      dayLabel: 'Mon, Mar 16',
    },
    {
      userItemId: 'ui-1',
      itemId: 'item-1',
      title: 'First',
      creator: 'Creator',
      provider: 'YOUTUBE',
      contentType: 'VIDEO',
      finishedAt: '2026-03-15T12:00:00.000Z',
      estimatedMinutes: 60,
      thumbnailUrl: null,
      dayBucket: '2026-03-15',
      dayLabel: 'Sun, Mar 15',
    },
  ],
  startedItems: [
    {
      userItemId: 'ui-started',
      itemId: 'item-started',
      title: 'Started',
      creator: 'Creator',
      provider: 'SPOTIFY',
      contentType: 'PODCAST',
      lastTouchedAt: '2026-03-17T12:00:00.000Z',
      progressPercent: 40,
      thumbnailUrl: null,
      dayBucket: '2026-03-17',
      dayLabel: 'Tue, Mar 17',
    },
  ],
};

describe('weekly recap mobile helpers', () => {
  it('formats estimated minutes for compact UI display', () => {
    expect(formatEstimatedMinutes(0)).toBe('0m');
    expect(formatEstimatedMinutes(45)).toBe('45m');
    expect(formatEstimatedMinutes(60)).toBe('1h');
    expect(formatEstimatedMinutes(75)).toBe('1h 15m');
  });

  it('shows the recap entry only on Sunday and Monday', () => {
    expect(shouldShowWeeklyRecapEntry(new Date(2026, 2, 15, 12, 0, 0))).toBe(true);
    expect(shouldShowWeeklyRecapEntry(new Date(2026, 2, 16, 12, 0, 0))).toBe(true);
    expect(shouldShowWeeklyRecapEntry(new Date(2026, 2, 17, 12, 0, 0))).toBe(false);
  });

  it('formats delta labels for recap comparisons', () => {
    expect(formatDeltaLabel(25)).toBe('Up 25% vs last week');
    expect(formatDeltaLabel(-10)).toBe('Down 10% vs last week');
    expect(formatDeltaLabel(0)).toBe('No change vs last week');
    expect(formatDeltaLabel(null)).toBeNull();
  });

  it('returns human-readable dominant mode labels', () => {
    expect(getDominantModeLabel('WATCHING')).toBe('Watching-led week');
    expect(getDominantModeLabel('NONE')).toBe('No dominant mode');
  });

  it('builds ratio-aware mode split rows', () => {
    expect(buildModeSplit(recapFixture)).toEqual([
      { key: 'reading', label: 'Reading', minutes: 30, ratio: 30 / 90 },
      { key: 'watching', label: 'Watching', minutes: 45, ratio: 45 / 90 },
      { key: 'listening', label: 'Listening', minutes: 15, ratio: 15 / 90 },
    ]);
  });

  it('groups recap items by day in descending order', () => {
    expect(groupRecapItemsByDay(recapFixture.completedItems)).toEqual([
      {
        dayBucket: '2026-03-16',
        dayLabel: 'Mon, Mar 16',
        items: [recapFixture.completedItems[0]],
      },
      {
        dayBucket: '2026-03-15',
        dayLabel: 'Sun, Mar 15',
        items: [recapFixture.completedItems[1]],
      },
    ]);
  });

  it('builds useful empty state copy for quiet weeks', () => {
    expect(
      buildWeeklyRecapEmptyState({
        ...recapFixture,
        totals: {
          ...recapFixture.totals,
          completedCount: 0,
          startedCount: 2,
        },
      })
    ).toEqual({
      title: 'No completed items in the last 7 days',
      message: 'You still started 2 items.',
    });
  });
});
