import { keepPreviousData } from '@tanstack/react-query';

import { trpc } from '@/lib/trpc';
import type { WeeklyRecap, WeeklyRecapTeaser } from '@/lib/weekly-recap';

export function getRecapTimezone(): string | undefined {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof resolved === 'string' && resolved.trim().length > 0 ? resolved : undefined;
  } catch {
    return undefined;
  }
}

export function useWeeklyRecap() {
  const timezone = getRecapTimezone();

  return trpc.insights.weeklyRecap.useQuery(timezone ? { timezone } : undefined, {
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  }) as ReturnType<typeof trpc.insights.weeklyRecap.useQuery> & {
    data: WeeklyRecap | undefined;
  };
}

export function useWeeklyRecapTeaser() {
  const timezone = getRecapTimezone();

  return trpc.insights.weeklyRecapTeaser.useQuery(timezone ? { timezone } : undefined, {
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  }) as ReturnType<typeof trpc.insights.weeklyRecapTeaser.useQuery> & {
    data: WeeklyRecapTeaser | undefined;
  };
}
