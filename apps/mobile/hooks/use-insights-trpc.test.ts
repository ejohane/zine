import { act, renderHook } from '@testing-library/react-hooks';
import type { AppStateStatus } from 'react-native';

const mockWeeklyRecapUseQuery = jest.fn();
const mockWeeklyRecapTeaserUseQuery = jest.fn();
let appStateCallback: ((state: AppStateStatus) => void) | null = null;

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, callback: (state: AppStateStatus) => void) => {
      appStateCallback = callback;
      return {
        remove: () => {
          appStateCallback = null;
        },
      };
    },
  },
}));

jest.mock('@/lib/trpc', () => ({
  trpc: {
    insights: {
      weeklyRecap: {
        useQuery: (...args: unknown[]) => mockWeeklyRecapUseQuery(...args),
      },
      weeklyRecapTeaser: {
        useQuery: (...args: unknown[]) => mockWeeklyRecapTeaserUseQuery(...args),
      },
    },
  },
}));

import {
  getRecapTimezone,
  useWeeklyRecap,
  useWeeklyRecapEntryState,
  useWeeklyRecapTeaser,
} from './use-insights-trpc';

describe('use-insights-trpc', () => {
  const originalDateTimeFormat = Intl.DateTimeFormat;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 2, 16, 12, 0, 0));
    appStateCallback = null;
    mockWeeklyRecapUseQuery.mockReturnValue({ data: undefined, isLoading: false, error: null });
    mockWeeklyRecapTeaserUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });

    Intl.DateTimeFormat = jest.fn(() => ({
      resolvedOptions: () => ({ timeZone: 'America/Chicago' }),
    })) as unknown as typeof Intl.DateTimeFormat;
  });

  afterEach(() => {
    Intl.DateTimeFormat = originalDateTimeFormat;
    jest.useRealTimers();
  });

  it('reads the device timezone when available', () => {
    expect(getRecapTimezone()).toBe('America/Chicago');
  });

  it('passes the timezone to the weekly recap query', () => {
    renderHook(() => useWeeklyRecap());

    expect(mockWeeklyRecapUseQuery).toHaveBeenCalledWith(
      { timezone: 'America/Chicago', weekAnchorDate: '2026-03-15' },
      expect.objectContaining({
        enabled: true,
        placeholderData: expect.any(Function),
        staleTime: 60_000,
      })
    );
  });

  it('passes the timezone to the teaser query', () => {
    renderHook(() => useWeeklyRecapTeaser());

    expect(mockWeeklyRecapTeaserUseQuery).toHaveBeenCalledWith(
      { timezone: 'America/Chicago', weekAnchorDate: '2026-03-15' },
      expect.objectContaining({
        enabled: true,
        placeholderData: expect.any(Function),
        staleTime: 60_000,
      })
    );
  });

  it('can disable the teaser query outside the recap entry window', () => {
    renderHook(() => useWeeklyRecapTeaser({ enabled: false }));

    expect(mockWeeklyRecapTeaserUseQuery).toHaveBeenCalledWith(
      { timezone: 'America/Chicago', weekAnchorDate: '2026-03-15' },
      expect.objectContaining({
        enabled: false,
        placeholderData: expect.any(Function),
        staleTime: 60_000,
      })
    );
  });

  it('falls back to undefined input when timezone lookup fails', () => {
    Intl.DateTimeFormat = jest.fn(() => {
      throw new Error('timezone unavailable');
    }) as unknown as typeof Intl.DateTimeFormat;

    renderHook(() => useWeeklyRecap());

    expect(mockWeeklyRecapUseQuery).toHaveBeenCalledWith(
      { weekAnchorDate: '2026-03-15' },
      expect.objectContaining({
        enabled: true,
        placeholderData: expect.any(Function),
        staleTime: 60_000,
      })
    );
  });

  it('updates the entry visibility at local midnight without requiring a remount', () => {
    const { result } = renderHook(() => useWeeklyRecapEntryState());

    expect(result.current).toEqual({
      shouldShowEntry: true,
      weekAnchorDate: '2026-03-15',
    });

    act(() => {
      jest.setSystemTime(new Date(2026, 2, 17, 0, 1, 0));
      jest.advanceTimersByTime(12 * 60 * 60 * 1000 + 60 * 1000);
    });

    expect(result.current).toEqual({
      shouldShowEntry: false,
      weekAnchorDate: '2026-03-15',
    });
  });

  it('refreshes the entry state when the app returns to the foreground', () => {
    const { result } = renderHook(() => useWeeklyRecapEntryState());

    act(() => {
      jest.setSystemTime(new Date(2026, 2, 22, 9, 0, 0));
      appStateCallback?.('active');
    });

    expect(result.current).toEqual({
      shouldShowEntry: true,
      weekAnchorDate: '2026-03-22',
    });
  });
});
