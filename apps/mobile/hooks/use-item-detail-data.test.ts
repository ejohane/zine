/**
 * Tests for app/item/detail/hooks/useItemDetailData
 */

import { renderHook } from '@testing-library/react-hooks';

import { useItemDetailData } from '@/app/item/detail/hooks/useItemDetailData';

// ============================================================================
// Module-level Mocks
// ============================================================================

const mockUseItem = jest.fn();
const mockUseCreator = jest.fn();
const mockRefetch = jest.fn();

jest.mock('@/hooks/use-items-trpc', () => ({
  useItem: (id: string) => mockUseItem(id),
}));

jest.mock('@/hooks/use-creator', () => ({
  useCreator: (creatorId: string) => mockUseCreator(creatorId),
}));

// ============================================================================
// Tests
// ============================================================================

describe('useItemDetailData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseItem.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    mockUseCreator.mockReturnValue({
      creator: undefined,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('uses an empty id when params are invalid', () => {
    const { result } = renderHook(() => useItemDetailData({ id: 'bad-id', isValid: false }));

    expect(mockUseItem).toHaveBeenCalledWith('');
    expect(mockUseCreator).toHaveBeenCalledWith('');
    expect(result.current.item).toBeNull();
  });

  it('requests creator data for the item creator', () => {
    const item = { id: 'item-1', creatorId: 'creator-1' };
    const creator = { id: 'creator-1', name: 'Creator' };

    mockUseItem.mockReturnValue({
      data: item,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    mockUseCreator.mockReturnValue({
      creator,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });

    const { result } = renderHook(() => useItemDetailData({ id: 'item-1', isValid: true }));

    expect(mockUseItem).toHaveBeenCalledWith('item-1');
    expect(mockUseCreator).toHaveBeenCalledWith('creator-1');
    expect(result.current.creatorData).toBe(creator);
    expect(result.current.item).toBe(item);
  });
});
