/**
 * Tests for hooks/use-items-trpc.ts
 *
 * Verifies list query hooks use placeholder data for cache-first UX.
 */

import { renderHook } from '@testing-library/react-hooks';
import { ContentType, Provider } from '@zine/shared';

// ============================================================================
// Module-level Mocks
// ============================================================================

const mockInboxUseQuery = jest.fn();
const mockLibraryUseQuery = jest.fn();
const mockHomeUseQuery = jest.fn();

jest.mock('../lib/trpc', () => ({
  trpc: {
    items: {
      inbox: {
        useQuery: mockInboxUseQuery,
      },
      library: {
        useQuery: mockLibraryUseQuery,
      },
      home: {
        useQuery: mockHomeUseQuery,
      },
    },
  },
}));

// ============================================================================
// Test Setup
// ============================================================================

import { useInboxItems, useLibraryItems, useHomeData } from './use-items-trpc';

beforeEach(() => {
  jest.clearAllMocks();

  mockInboxUseQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });
  mockLibraryUseQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });
  mockHomeUseQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });
});

// ============================================================================
// List Query Placeholder Data
// ============================================================================

describe('useItems list queries', () => {
  it('uses placeholderData for inbox items', () => {
    renderHook(() => useInboxItems({ filter: { provider: Provider.YOUTUBE } }));

    const callArgs = mockInboxUseQuery.mock.calls[0][1];
    expect(callArgs.placeholderData).toBeDefined();
    expect(typeof callArgs.placeholderData).toBe('function');
  });

  it('uses placeholderData for library items', () => {
    renderHook(() => useLibraryItems({ filter: { contentType: ContentType.ARTICLE } }));

    expect(mockLibraryUseQuery).toHaveBeenCalledWith(
      { filter: { contentType: ContentType.ARTICLE } },
      expect.objectContaining({ placeholderData: expect.any(Function) })
    );
  });

  it('trims library search query before requesting data', () => {
    renderHook(() =>
      useLibraryItems({
        search: '  all in  ',
      })
    );

    expect(mockLibraryUseQuery).toHaveBeenCalledWith(
      { search: 'all in' },
      expect.objectContaining({ placeholderData: expect.any(Function) })
    );
  });

  it('uses placeholderData for home data', () => {
    renderHook(() => useHomeData());

    expect(mockHomeUseQuery).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ placeholderData: expect.any(Function) })
    );
  });
});
