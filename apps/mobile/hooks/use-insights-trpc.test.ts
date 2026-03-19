import { renderHook } from '@testing-library/react-hooks';

const mockWeeklyRecapUseQuery = jest.fn();
const mockWeeklyRecapTeaserUseQuery = jest.fn();

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

import { getRecapTimezone, useWeeklyRecap, useWeeklyRecapTeaser } from './use-insights-trpc';

describe('use-insights-trpc', () => {
  const originalDateTimeFormat = Intl.DateTimeFormat;

  beforeEach(() => {
    jest.clearAllMocks();
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
  });

  it('reads the device timezone when available', () => {
    expect(getRecapTimezone()).toBe('America/Chicago');
  });

  it('passes the timezone to the weekly recap query', () => {
    renderHook(() => useWeeklyRecap());

    expect(mockWeeklyRecapUseQuery).toHaveBeenCalledWith(
      { timezone: 'America/Chicago' },
      expect.objectContaining({ placeholderData: expect.any(Function), staleTime: 60_000 })
    );
  });

  it('passes the timezone to the teaser query', () => {
    renderHook(() => useWeeklyRecapTeaser());

    expect(mockWeeklyRecapTeaserUseQuery).toHaveBeenCalledWith(
      { timezone: 'America/Chicago' },
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
      { timezone: 'America/Chicago' },
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
      undefined,
      expect.objectContaining({ placeholderData: expect.any(Function), staleTime: 60_000 })
    );
  });
});
