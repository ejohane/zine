import { act, renderHook } from '@testing-library/react-hooks';

import {
  getCollapsedHeaderTitleThreshold,
  getStickyActionRowThreshold,
  useCollapsedHeaderTitle,
} from '@/lib/native-large-title-header';

describe('native-large-title-header', () => {
  it('uses the default collapsed title threshold', () => {
    const { result } = renderHook(() => useCollapsedHeaderTitle());

    act(() => {
      result.current.handleScroll({
        nativeEvent: {
          contentOffset: {
            y: 44,
          },
        },
      } as never);
    });

    expect(result.current.showCollapsedTitle).toBe(false);

    act(() => {
      result.current.handleScroll({
        nativeEvent: {
          contentOffset: {
            y: 45,
          },
        },
      } as never);
    });

    expect(result.current.showCollapsedTitle).toBe(true);
  });

  it('supports custom collapsed title thresholds', () => {
    const { result } = renderHook(() => useCollapsedHeaderTitle({ threshold: 160 }));

    act(() => {
      result.current.handleScroll({
        nativeEvent: {
          contentOffset: {
            y: 160,
          },
        },
      } as never);
    });

    expect(result.current.showCollapsedTitle).toBe(false);

    act(() => {
      result.current.handleScroll({
        nativeEvent: {
          contentOffset: {
            y: 161,
          },
        },
      } as never);
    });

    expect(result.current.showCollapsedTitle).toBe(true);
  });

  it('derives a bookmark collapse threshold from the title start position', () => {
    expect(getCollapsedHeaderTitleThreshold(180)).toBe(136);
    expect(getCollapsedHeaderTitleThreshold(32)).toBe(44);
  });

  it('derives a sticky action threshold from the row start position', () => {
    expect(getStickyActionRowThreshold(340, 120)).toBe(220);
    expect(getStickyActionRowThreshold(90, 120)).toBe(0);
    expect(getStickyActionRowThreshold(Number.NaN, 120)).toBe(Number.POSITIVE_INFINITY);
  });
});
