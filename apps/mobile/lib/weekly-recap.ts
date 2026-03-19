import type { RouterOutputs } from '@/lib/trpc-types';

export type WeeklyRecap = RouterOutputs['insights']['weeklyRecap'];
export type WeeklyRecapTeaser = RouterOutputs['insights']['weeklyRecapTeaser'];
export type WeeklyRecapMode = WeeklyRecap['headline']['dominantMode'];
export type WeeklyRecapCompletedItem = WeeklyRecap['completedItems'][number];
export type WeeklyRecapStartedItem = WeeklyRecap['startedItems'][number];

export type WeeklyRecapGroup<T extends { dayBucket: string; dayLabel: string }> = {
  dayBucket: string;
  dayLabel: string;
  items: T[];
};

type ModeSplitKey = keyof WeeklyRecap['totals']['estimatedMinutesByMode'];

const MODE_LABELS: Record<WeeklyRecapMode, string> = {
  READING: 'Reading-led week',
  WATCHING: 'Watching-led week',
  LISTENING: 'Listening-led week',
  MIXED: 'Mixed week',
  NONE: 'No dominant mode',
};

function formatLocalDateKey(date: Date): string {
  return [
    date.getFullYear().toString().padStart(4, '0'),
    (date.getMonth() + 1).toString().padStart(2, '0'),
    date.getDate().toString().padStart(2, '0'),
  ].join('-');
}

export function formatEstimatedMinutes(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return '0m';
  }

  const roundedMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }

  return `${minutes}m`;
}

export function shouldShowWeeklyRecapEntry(date = new Date()): boolean {
  const day = date.getDay();
  return day === 0 || day === 1;
}

export function getWeeklyRecapAnchorDate(date = new Date()): string {
  const anchor = new Date(date);
  anchor.setHours(0, 0, 0, 0);
  anchor.setDate(anchor.getDate() - anchor.getDay());
  return formatLocalDateKey(anchor);
}

export function getDelayUntilNextLocalMidnight(date = new Date()): number {
  const nextMidnight = new Date(date);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(1_000, nextMidnight.getTime() - date.getTime());
}

export function formatDeltaLabel(deltaPct: number | null | undefined): string | null {
  if (deltaPct === null || deltaPct === undefined) {
    return null;
  }

  if (deltaPct > 0) {
    return `Up ${deltaPct}% vs last week`;
  }
  if (deltaPct < 0) {
    return `Down ${Math.abs(deltaPct)}% vs last week`;
  }

  return 'No change vs last week';
}

export function getDominantModeLabel(mode: WeeklyRecapMode): string {
  return MODE_LABELS[mode];
}

export function buildModeSplit(recap: WeeklyRecap): Array<{
  key: ModeSplitKey;
  label: string;
  minutes: number;
  ratio: number;
}> {
  const totalMinutes = recap.headline.estimatedTotalMinutes;
  const rows: Array<{ key: ModeSplitKey; label: string }> = [
    { key: 'reading', label: 'Reading' },
    { key: 'watching', label: 'Watching' },
    { key: 'listening', label: 'Listening' },
  ];

  return rows.map((row) => {
    const minutes = recap.totals.estimatedMinutesByMode[row.key];
    return {
      ...row,
      minutes,
      ratio: totalMinutes > 0 ? minutes / totalMinutes : 0,
    };
  });
}

export function groupRecapItemsByDay<T extends { dayBucket: string; dayLabel: string }>(
  items: T[]
): WeeklyRecapGroup<T>[] {
  const groups = new Map<string, WeeklyRecapGroup<T>>();

  for (const item of items) {
    const existing = groups.get(item.dayBucket);
    if (existing) {
      existing.items.push(item);
      continue;
    }

    groups.set(item.dayBucket, {
      dayBucket: item.dayBucket,
      dayLabel: item.dayLabel,
      items: [item],
    });
  }

  return Array.from(groups.values()).sort((left, right) =>
    right.dayBucket.localeCompare(left.dayBucket)
  );
}

export function buildWeeklyRecapEmptyState(recap: WeeklyRecap): {
  title: string;
  message: string;
} {
  if (recap.totals.completedCount > 0) {
    return {
      title: 'You completed items last week',
      message: 'The recap below is based on estimated time from finished items.',
    };
  }

  if (recap.totals.startedCount > 0) {
    return {
      title: 'No completed items last week',
      message: `You still started ${recap.totals.startedCount} ${recap.totals.startedCount === 1 ? 'item' : 'items'}.`,
    };
  }

  return {
    title: 'No completed items last week',
    message: 'Open something from your library and this recap will start filling in.',
  };
}
