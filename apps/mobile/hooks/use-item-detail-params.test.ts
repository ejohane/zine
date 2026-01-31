/**
 * Tests for app/item/detail/hooks/useItemDetailParams
 */

import { renderHook } from '@testing-library/react-hooks';

import { useItemDetailParams } from '@/app/item/detail/hooks/useItemDetailParams';

// ============================================================================
// Module-level Mocks
// ============================================================================

const mockUseLocalSearchParams = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

// ============================================================================
// Tests
// ============================================================================

describe('useItemDetailParams', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a valid id when params pass validation', () => {
    mockUseLocalSearchParams.mockReturnValue({ id: 'item-123' });

    const { result } = renderHook(() => useItemDetailParams());

    expect(result.current).toEqual({
      id: 'item-123',
      isValid: true,
    });
  });

  it('returns invalid state when id is missing', () => {
    mockUseLocalSearchParams.mockReturnValue({ id: '' });

    const { result } = renderHook(() => useItemDetailParams());

    expect(result.current.isValid).toBe(false);
    expect(result.current.id).toBe('');
    expect(result.current.message).toBe('Item ID is required');
  });
});
