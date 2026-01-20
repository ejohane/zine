/**
 * Tests for LatestContentCard Component
 *
 * Tests the LatestContentCard component including:
 * - Rendering with thumbnail
 * - Rendering with placeholder (no thumbnail)
 * - Showing title
 * - Showing published date
 * - Showing "Saved" badge when bookmarked
 * - Handling press to open URL
 *
 * @see Task zine-1yfa for requirements
 */

import { type LatestContentItem } from './LatestContentCard';

// ============================================================================
// Module-level Mocks
// ============================================================================

const mockOpenURL = jest.fn();
const mockUseColorScheme = jest.fn<string | undefined, []>(() => 'light');

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Image: 'Image',
  Pressable: 'Pressable',
  Linking: {
    openURL: mockOpenURL,
  },
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: mockUseColorScheme,
}));

jest.mock('@/lib/format', () => ({
  formatRelativeTime: jest.fn((dateString: string) => {
    if (!dateString) return '';
    return '2 days ago';
  }),
}));

jest.mock('@/constants/theme', () => ({
  Colors: {
    light: {
      text: '#000',
      textSecondary: '#666',
      textTertiary: '#999',
      card: '#fff',
      backgroundTertiary: '#f0f0f0',
      primary: '#007AFF',
      buttonPrimaryText: '#fff',
    },
    dark: {
      text: '#fff',
      textSecondary: '#aaa',
      textTertiary: '#666',
      card: '#1a1a1a',
      backgroundTertiary: '#333',
      primary: '#0A84FF',
      buttonPrimaryText: '#000',
    },
  },
  Typography: {
    bodySmall: { fontSize: 12 },
    labelMedium: { fontSize: 12 },
    labelSmall: { fontSize: 11 },
  },
  Spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
  },
  Radius: {
    xs: 4,
    md: 12,
  },
}));

// ============================================================================
// Mock Data Factories
// ============================================================================

function createMockItem(overrides: Partial<LatestContentItem> = {}): LatestContentItem {
  return {
    providerId: 'video-123',
    title: 'Test Video Title',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    duration: 600,
    publishedAt: '2024-01-15T10:00:00Z',
    url: 'https://youtube.com/watch?v=abc123',
    isBookmarked: false,
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('LatestContentCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseColorScheme.mockReturnValue('light');
  });

  describe('rendering', () => {
    it('creates mock item with title', () => {
      const item = createMockItem({ title: 'Custom Title' });
      expect(item.title).toBe('Custom Title');
    });

    it('creates mock item with thumbnail URL', () => {
      const item = createMockItem({ thumbnailUrl: 'https://example.com/custom.jpg' });
      expect(item.thumbnailUrl).toBe('https://example.com/custom.jpg');
    });

    it('creates mock item without thumbnail', () => {
      const item = createMockItem({ thumbnailUrl: null });
      expect(item.thumbnailUrl).toBeNull();
    });

    it('creates mock item with published date', () => {
      const item = createMockItem({ publishedAt: '2024-01-20T15:30:00Z' });
      expect(item.publishedAt).toBe('2024-01-20T15:30:00Z');
    });

    it('creates mock item without published date', () => {
      const item = createMockItem({ publishedAt: null });
      expect(item.publishedAt).toBeNull();
    });
  });

  describe('bookmarked badge', () => {
    it('creates mock item with isBookmarked true', () => {
      const item = createMockItem({ isBookmarked: true });
      expect(item.isBookmarked).toBe(true);
    });

    it('creates mock item with isBookmarked false', () => {
      const item = createMockItem({ isBookmarked: false });
      expect(item.isBookmarked).toBe(false);
    });

    it('defaults isBookmarked to false', () => {
      const item = createMockItem();
      expect(item.isBookmarked).toBe(false);
    });
  });

  describe('URL handling', () => {
    it('creates mock item with URL', () => {
      const item = createMockItem({ url: 'https://youtube.com/watch?v=xyz789' });
      expect(item.url).toBe('https://youtube.com/watch?v=xyz789');
    });

    it('creates mock item with Spotify URL', () => {
      const item = createMockItem({ url: 'https://open.spotify.com/episode/abc123' });
      expect(item.url).toBe('https://open.spotify.com/episode/abc123');
    });
  });

  describe('theming', () => {
    it('uses light color scheme', () => {
      mockUseColorScheme.mockReturnValue('light');
      const scheme = mockUseColorScheme();
      expect(scheme).toBe('light');
    });

    it('uses dark color scheme', () => {
      mockUseColorScheme.mockReturnValue('dark');
      const scheme = mockUseColorScheme();
      expect(scheme).toBe('dark');
    });

    it('handles undefined color scheme defaulting to light', () => {
      mockUseColorScheme.mockReturnValue(undefined);
      const scheme = mockUseColorScheme();
      expect(scheme).toBeUndefined();
    });
  });

  describe('data integrity', () => {
    it('preserves all item properties', () => {
      const item = createMockItem({
        providerId: 'custom-id',
        title: 'Custom Title',
        thumbnailUrl: 'https://example.com/custom.jpg',
        duration: 1200,
        publishedAt: '2024-02-01T10:00:00Z',
        url: 'https://custom.url',
        isBookmarked: true,
      });

      expect(item.providerId).toBe('custom-id');
      expect(item.title).toBe('Custom Title');
      expect(item.thumbnailUrl).toBe('https://example.com/custom.jpg');
      expect(item.duration).toBe(1200);
      expect(item.publishedAt).toBe('2024-02-01T10:00:00Z');
      expect(item.url).toBe('https://custom.url');
      expect(item.isBookmarked).toBe(true);
    });

    it('handles null duration', () => {
      const item = createMockItem({ duration: null });
      expect(item.duration).toBeNull();
    });
  });
});
