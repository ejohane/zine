import { renderHook } from '@testing-library/react-hooks';

const mockSearchUseQuery = jest.fn();

jest.mock('../lib/trpc', () => ({
  trpc: {
    search: {
      query: {
        useQuery: mockSearchUseQuery,
      },
    },
  },
}));

import { useSearchResults } from './use-search';

describe('useSearchResults', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchUseQuery.mockReturnValue({ data: undefined, isLoading: false, error: null });
  });

  it('trims the query before requesting unified search results', () => {
    renderHook(() => useSearchResults('  Joe Rogan  '));

    expect(mockSearchUseQuery).toHaveBeenCalledWith(
      {
        query: 'Joe Rogan',
        scope: 'library',
        creatorsLimit: 5,
        itemsLimit: 20,
      },
      expect.objectContaining({
        enabled: true,
      })
    );
  });

  it('disables the backend query when the search text is blank', () => {
    renderHook(() => useSearchResults('   '));

    expect(mockSearchUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: ' ',
      }),
      expect.objectContaining({
        enabled: false,
      })
    );
  });
});
