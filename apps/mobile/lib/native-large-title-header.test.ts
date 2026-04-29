import { act, renderHook } from '@testing-library/react-hooks';

import {
  getCollapsedHeaderTitleThreshold,
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
});
