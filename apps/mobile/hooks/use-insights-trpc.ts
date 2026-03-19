import { keepPreviousData } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { trpc } from '@/lib/trpc';
import {
  getDelayUntilNextLocalMidnight,
  getWeeklyRecapAnchorDate,
  shouldShowWeeklyRecapEntry,
  type WeeklyRecap,
  type WeeklyRecapTeaser,
} from '@/lib/weekly-recap';

export function getRecapTimezone(): string | undefined {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof resolved === 'string' && resolved.trim().length > 0 ? resolved : undefined;
  } catch {
    return undefined;
  }
}

function useWeeklyRecapClock(enabled = true) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let midnightTimer: ReturnType<typeof setTimeout> | null = null;

    const syncNow = () => {
      setNow(new Date());
    };

    const scheduleMidnightRefresh = () => {
      if (midnightTimer) {
        clearTimeout(midnightTimer);
      }

      midnightTimer = setTimeout(() => {
        syncNow();
        scheduleMidnightRefresh();
      }, getDelayUntilNextLocalMidnight());
    };

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        syncNow();
      }
    };

    scheduleMidnightRefresh();

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      if (midnightTimer) {
        clearTimeout(midnightTimer);
      }
      subscription.remove();
    };
  }, [enabled]);

  return now;
}

function useWeeklyRecapAnchorDate(weekAnchorDate?: string) {
  const now = useWeeklyRecapClock(!weekAnchorDate);
  return weekAnchorDate ?? getWeeklyRecapAnchorDate(now);
}

export function useWeeklyRecapEntryState() {
  const now = useWeeklyRecapClock();

  return {
    shouldShowEntry: shouldShowWeeklyRecapEntry(now),
    weekAnchorDate: getWeeklyRecapAnchorDate(now),
  };
}

export function useWeeklyRecap(options?: { enabled?: boolean; weekAnchorDate?: string }) {
  const timezone = getRecapTimezone();
  const weekAnchorDate = useWeeklyRecapAnchorDate(options?.weekAnchorDate);
  const isEnabled = options?.enabled ?? true;
  const input = timezone ? { timezone, weekAnchorDate } : { weekAnchorDate };

  return trpc.insights.weeklyRecap.useQuery(input, {
    enabled: isEnabled,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  }) as ReturnType<typeof trpc.insights.weeklyRecap.useQuery> & {
    data: WeeklyRecap | undefined;
  };
}

export function useWeeklyRecapTeaser(options?: { enabled?: boolean; weekAnchorDate?: string }) {
  const timezone = getRecapTimezone();
  const weekAnchorDate = useWeeklyRecapAnchorDate(options?.weekAnchorDate);
  const isEnabled = options?.enabled ?? true;
  const input = timezone ? { timezone, weekAnchorDate } : { weekAnchorDate };

  return trpc.insights.weeklyRecapTeaser.useQuery(input, {
    enabled: isEnabled,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  }) as ReturnType<typeof trpc.insights.weeklyRecapTeaser.useQuery> & {
    data: WeeklyRecapTeaser | undefined;
  };
}
