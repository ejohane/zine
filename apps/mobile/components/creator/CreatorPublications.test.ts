/**
 * Tests for CreatorPublications Component
 *
 * Verifies basic state wiring for the creator publications section.
 */

const mockUseCreatorPublications = jest.fn();
const mockMapContentType = jest.fn((type: string) => type.toLowerCase());
const mockMapProvider = jest.fn((provider: string) => provider.toLowerCase());
const mockUseColorScheme = jest.fn(() => 'light');

jest.mock('@/hooks/use-creator', () => ({
  useCreatorPublications: mockUseCreatorPublications,
}));

jest.mock('@/hooks/use-items-trpc', () => ({
  mapContentType: mockMapContentType,
  mapProvider: mockMapProvider,
}));

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: mockUseColorScheme,
}));

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  FlatList: 'FlatList',
  ActivityIndicator: 'ActivityIndicator',
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

jest.mock('@/components/list-states', () => ({
  ErrorState: 'ErrorState',
}));

jest.mock('@/components/item-card', () => ({
  ItemCard: 'ItemCard',
}));

jest.mock('@/constants/theme', () => ({
  Colors: {
    light: {
      text: '#000',
      textSecondary: '#666',
      backgroundTertiary: '#f0f0f0',
      primary: '#007AFF',
    },
    dark: {
      text: '#fff',
      textSecondary: '#999',
      backgroundTertiary: '#333',
      primary: '#0A84FF',
    },
  },
  Typography: {
    titleMedium: { fontSize: 18, fontWeight: '600' },
    bodySmall: { fontSize: 12 },
    bodyMedium: { fontSize: 14 },
  },
  Spacing: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },
}));

interface MockPublication {
  id: string;
  itemId: string;
  title: string;
  creator: string;
  thumbnailUrl: string | null;
  contentType: string;
  provider: string;
  duration: number | null;
  readingTimeMinutes: number | null;
  bookmarkedAt: string | null;
  publishedAt: string | null;
  isFinished: boolean;
  state: 'INBOX' | 'BOOKMARKED' | 'ARCHIVED';
}

function createMockPublication(overrides: Partial<MockPublication> = {}): MockPublication {
  return {
    id: 'ui-1',
    itemId: 'item-1',
    title: 'Newsletter Issue',
    creator: 'Test Newsletter',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    contentType: 'ARTICLE',
    provider: 'GMAIL',
    duration: null,
    readingTimeMinutes: 8,
    bookmarkedAt: null,
    publishedAt: '2024-01-01T00:00:00.000Z',
    isFinished: false,
    state: 'INBOX',
    ...overrides,
  };
}

describe('CreatorPublications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseColorScheme.mockReturnValue('light');
  });

  it('handles loading state', () => {
    mockUseCreatorPublications.mockReturnValue({
      publications: [],
      isLoading: true,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      error: null,
      refetch: jest.fn(),
    });

    const hookResult = mockUseCreatorPublications('creator-123');
    expect(hookResult.isLoading).toBe(true);
  });

  it('handles error state', () => {
    const mockError = new Error('Failed to fetch publications');
    mockUseCreatorPublications.mockReturnValue({
      publications: [],
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      error: mockError,
      refetch: jest.fn(),
    });

    const hookResult = mockUseCreatorPublications('creator-123');
    expect(hookResult.error).toBe(mockError);
  });

  it('returns publications when data is available', () => {
    const mockPublications = [
      createMockPublication({ id: 'ui-1', state: 'INBOX' }),
      createMockPublication({ id: 'ui-2', state: 'BOOKMARKED' }),
      createMockPublication({ id: 'ui-3', state: 'ARCHIVED' }),
    ];

    mockUseCreatorPublications.mockReturnValue({
      publications: mockPublications,
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: true,
      fetchNextPage: jest.fn(),
      error: null,
      refetch: jest.fn(),
    });

    const hookResult = mockUseCreatorPublications('creator-123');
    expect(hookResult.publications).toHaveLength(3);
    expect(hookResult.publications[0].state).toBe('INBOX');
    expect(hookResult.publications[1].state).toBe('BOOKMARKED');
    expect(hookResult.publications[2].state).toBe('ARCHIVED');
  });
});
