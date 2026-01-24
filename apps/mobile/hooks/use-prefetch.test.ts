/**
 * Tests for hooks/use-prefetch.ts
 */

import { renderHook, act } from '@testing-library/react-hooks';
import type { AppStateStatus } from 'react-native';

// ============================================================================
// Mocks
// ============================================================================

const mockPrefetchHome = jest.fn(() => Promise.resolve());
const mockPrefetchInbox = jest.fn(() => Promise.resolve());
const mockPrefetchLibrary = jest.fn(() => Promise.resolve());
const mockPrefetchSubscriptions = jest.fn(() => Promise.resolve());
const mockPrefetchConnections = jest.fn(() => Promise.resolve());
const mockPrefetchItem = jest.fn(() => Promise.resolve());

const mockUtils = {
  items: {
    home: { prefetch: mockPrefetchHome },
    inbox: { prefetch: mockPrefetchInbox },
    library: { prefetch: mockPrefetchLibrary },
    get: { prefetch: mockPrefetchItem },
  },
  subscriptions: {
    list: { prefetch: mockPrefetchSubscriptions },
    connections: {
      list: { prefetch: mockPrefetchConnections },
    },
  },
};

let appStateCallback: ((state: AppStateStatus) => void) | null = null;
const mockAddEventListener = jest.fn((event: string, callback: (state: AppStateStatus) => void) => {
  if (event === 'change') {
    appStateCallback = callback;
  }
  return { remove: jest.fn() };
});

let isRestoring = false;

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: mockAddEventListener,
  },
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => effect(),
}));

jest.mock('@tanstack/react-query', () => ({
  useIsRestoring: () => isRestoring,
}));

jest.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => mockUtils,
  },
}));

// ============================================================================
// Tests
// ============================================================================

import {
  getTabPrefetchTargets,
  useBaselinePrefetchOnFocus,
  usePrefetchItemDetail,
  useTabPrefetch,
} from './use-prefetch';

describe('prefetch strategy hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appStateCallback = null;
    isRestoring = false;
  });

  it('returns sibling targets for each tab', () => {
    expect(getTabPrefetchTargets('home')).toEqual(['inbox', 'library']);
    expect(getTabPrefetchTargets('inbox')).toEqual(['home', 'library']);
    expect(getTabPrefetchTargets('library')).toEqual(['home', 'inbox']);
  });

  it('prefetches baseline queries on mount when hydrated', () => {
    renderHook(() => useBaselinePrefetchOnFocus());

    expect(mockPrefetchHome).toHaveBeenCalledTimes(1);
    expect(mockPrefetchInbox).toHaveBeenCalledTimes(1);
    expect(mockPrefetchLibrary).toHaveBeenCalledTimes(1);
    expect(mockPrefetchSubscriptions).toHaveBeenCalledTimes(1);
    expect(mockPrefetchConnections).toHaveBeenCalledTimes(1);
  });

  it('skips baseline prefetch while restoring', () => {
    isRestoring = true;

    renderHook(() => useBaselinePrefetchOnFocus());

    expect(mockPrefetchHome).not.toHaveBeenCalled();
    expect(mockPrefetchSubscriptions).not.toHaveBeenCalled();
  });

  it('prefetches baseline queries on app focus', () => {
    renderHook(() => useBaselinePrefetchOnFocus());

    jest.clearAllMocks();

    act(() => {
      appStateCallback?.('active');
    });

    expect(mockPrefetchHome).toHaveBeenCalledTimes(1);
    expect(mockPrefetchInbox).toHaveBeenCalledTimes(1);
    expect(mockPrefetchLibrary).toHaveBeenCalledTimes(1);
    expect(mockPrefetchSubscriptions).toHaveBeenCalledTimes(1);
    expect(mockPrefetchConnections).toHaveBeenCalledTimes(1);
  });

  it('prefetches sibling tabs on focus', () => {
    renderHook(() => useTabPrefetch('home'));

    expect(mockPrefetchInbox).toHaveBeenCalledTimes(1);
    expect(mockPrefetchLibrary).toHaveBeenCalledTimes(1);
    expect(mockPrefetchHome).not.toHaveBeenCalled();
  });

  it('prefetches item detail on demand (e2e flow)', () => {
    const { result } = renderHook(() => usePrefetchItemDetail());

    act(() => {
      result.current('item-123');
    });

    expect(mockPrefetchItem).toHaveBeenCalledWith({ id: 'item-123' });
  });
});
