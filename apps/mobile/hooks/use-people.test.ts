import { renderHook } from '@testing-library/react-hooks';

const mockPeopleListUseInfiniteQuery = jest.fn();
const mockPeopleGetUseQuery = jest.fn();
const mockPeopleListItemsUseInfiniteQuery = jest.fn();

jest.mock('../lib/trpc', () => ({
  trpc: {
    people: {
      list: {
        useInfiniteQuery: mockPeopleListUseInfiniteQuery,
      },
      get: {
        useQuery: mockPeopleGetUseQuery,
      },
      listItems: {
        useInfiniteQuery: mockPeopleListItemsUseInfiniteQuery,
      },
    },
  },
}));

import { usePeople, usePerson, usePersonItems } from './use-people';

describe('people hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPeopleListUseInfiniteQuery.mockReturnValue({ data: undefined });
    mockPeopleGetUseQuery.mockReturnValue({ data: undefined });
    mockPeopleListItemsUseInfiniteQuery.mockReturnValue({ data: undefined });
  });

  it('requests people with default count sorting', () => {
    renderHook(() => usePeople({ query: 'Joe', limit: 10 }));

    expect(mockPeopleListUseInfiniteQuery).toHaveBeenCalledWith(
      {
        query: 'Joe',
        limit: 10,
        sort: 'count',
      },
      expect.objectContaining({
        placeholderData: expect.any(Function),
      })
    );
  });

  it('disables person profile queries until an id is available', () => {
    renderHook(() => usePerson(''));

    expect(mockPeopleGetUseQuery).toHaveBeenCalledWith(
      { personId: '' },
      expect.objectContaining({ enabled: false })
    );
  });

  it('requests person items with pagination enabled for valid ids', () => {
    renderHook(() => usePersonItems('person-1', { limit: 5 }));

    expect(mockPeopleListItemsUseInfiniteQuery).toHaveBeenCalledWith(
      { personId: 'person-1', limit: 5 },
      expect.objectContaining({ enabled: true })
    );
  });
});
