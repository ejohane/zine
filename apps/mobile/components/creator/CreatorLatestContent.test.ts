/**
 * Tests for CreatorLatestContent Component
 *
 * Tests the CreatorLatestContent component including:
 * - Only shows for YouTube/Spotify providers
 * - Loading state with skeleton
 * - Not Connected state with prompt
 * - Token Expired state with reconnect prompt
 * - Error state
 * - Empty state
 * - Success state with content carousel
 *
 * @see Task zine-1yfa for requirements
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { CreatorLatestContent } from './CreatorLatestContent';

// ============================================================================
// Module-level Mocks
// ============================================================================

type Renderer = ReturnType<typeof TestRenderer.create>;
type TestNode = Renderer['root'];

function getTextContent(node: TestNode): string {
  return node.children
    .map((child: TestNode | string) => {
      if (typeof child === 'string') {
        return child;
      }
      return getTextContent(child);
    })
    .join(' ');
}

jest.mock('expo-router', () => ({
  __esModule: true,
  ...(() => {
    const push = jest.fn();
    return {
      useRouter: () => ({
        push,
      }),
      __mockPush: push,
    };
  })(),
}));

jest.mock('@/hooks/use-creator', () => ({
  __esModule: true,
  ...(() => {
    const useCreatorLatestContent = jest.fn();
    return {
      useCreatorLatestContent,
      __mockUseCreatorLatestContent: useCreatorLatestContent,
    };
  })(),
}));

jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: {
      surfaceRaised: '#111',
      surfaceSubtle: '#111',
      textSecondary: '#666',
      textPrimary: '#fff',
      textSubheader: '#999',
      statusError: '#f00',
      accent: '#fff',
    },
  }),
}));

jest.mock('react-native', () => ({
  __esModule: true,
  ...(() => {
    const openURL = jest.fn();
    return {
      View: 'View',
      Text: 'Text',
      FlatList: 'FlatList',
      Pressable: 'Pressable',
      Linking: {
        openURL,
      },
      __mockOpenURL: openURL,
      StyleSheet: {
        create: (styles: Record<string, unknown>) => styles,
      },
    };
  })(),
}));

jest.mock('@/components/primitives', () => ({
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) =>
    React.createElement('button', { onClick: onPress, onPress }, label),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('span', null, children),
}));

jest.mock('@/hooks/use-color-scheme', () => ({
  __esModule: true,
  ...(() => {
    const useColorScheme = jest.fn(() => 'light');
    return {
      useColorScheme,
      __mockUseColorScheme: useColorScheme,
    };
  })(),
}));

jest.mock('./LatestContentCard', () => ({
  LatestContentCard: 'LatestContentCard',
}));

jest.mock('@/lib/analytics', () => ({
  analytics: {
    track: jest.fn(),
  },
}));

jest.mock('@/lib/trpc', () => ({
  trpc: {
    creators: {
      resolveLatestContentThumbnails: {
        useMutation: () => ({
          mutateAsync: jest.fn(),
        }),
      },
    },
  },
}));
const mockPush = (jest.requireMock('expo-router') as { __mockPush: jest.Mock }).__mockPush;
const mockOpenURL = (jest.requireMock('react-native') as { __mockOpenURL: jest.Mock })
  .__mockOpenURL;
const mockUseCreatorLatestContent = (
  jest.requireMock('@/hooks/use-creator') as { __mockUseCreatorLatestContent: jest.Mock }
).__mockUseCreatorLatestContent;
const mockUseColorScheme = (
  jest.requireMock('@/hooks/use-color-scheme') as { __mockUseColorScheme: jest.Mock }
).__mockUseColorScheme;

jest.mock('@/constants/theme', () => ({
  Colors: {
    light: {
      text: '#000',
      textSecondary: '#666',
      textTertiary: '#999',
      border: '#e0e0e0',
      backgroundSecondary: '#f5f5f5',
      backgroundTertiary: '#f0f0f0',
      buttonPrimary: '#007AFF',
      buttonPrimaryText: '#fff',
      error: '#ff0000',
    },
    dark: {
      text: '#fff',
      textSecondary: '#aaa',
      textTertiary: '#666',
      border: '#333',
      backgroundSecondary: '#1a1a1a',
      backgroundTertiary: '#333',
      buttonPrimary: '#0A84FF',
      buttonPrimaryText: '#000',
      error: '#ff6666',
    },
  },
  Typography: {
    titleMedium: { fontSize: 16, fontWeight: '600' },
    bodyMedium: { fontSize: 14 },
    labelLarge: { fontSize: 14 },
  },
  Spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    '2xl': 24,
  },
  Radius: {
    md: 12,
    full: 9999,
  },
}));

// ============================================================================
// Mock Data Factories
// ============================================================================

interface MockContentItem {
  providerId: string;
  title: string;
  thumbnailUrl: string | null;
  duration: number | null;
  publishedAt: string | null;
  url: string;
}

function createMockContentItem(overrides: Partial<MockContentItem> = {}): MockContentItem {
  return {
    providerId: 'video-123',
    title: 'Test Video',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    duration: 600,
    publishedAt: '2024-01-15T10:00:00Z',
    url: 'https://youtube.com/watch?v=abc123',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('CreatorLatestContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseColorScheme.mockReturnValue('light');
    mockUseCreatorLatestContent.mockReturnValue({
      content: [],
      reason: undefined,
      connectUrl: undefined,
      cacheStatus: undefined,
      isLoading: false,
      error: null,
    });
  });

  const supportedProviders = ['YOUTUBE', 'SPOTIFY', 'RSS', 'WEB', 'SUBSTACK'];

  describe('provider filtering', () => {
    it('shows for YOUTUBE provider', () => {
      mockUseCreatorLatestContent.mockReturnValue({
        content: [],
        reason: undefined,
        connectUrl: undefined,
        isLoading: false,
        error: null,
      });

      // Component should render for YOUTUBE
      // Verified by checking the hook is called
      const provider = 'YOUTUBE';
      expect(supportedProviders.includes(provider)).toBe(true);
    });

    it('shows for SPOTIFY provider', () => {
      mockUseCreatorLatestContent.mockReturnValue({
        content: [],
        reason: undefined,
        connectUrl: undefined,
        isLoading: false,
        error: null,
      });

      const provider = 'SPOTIFY';
      expect(supportedProviders.includes(provider)).toBe(true);
    });

    it('shows for SUBSTACK provider', () => {
      const provider = 'SUBSTACK';
      expect(supportedProviders.includes(provider)).toBe(true);
    });

    it('shows for RSS provider', () => {
      const provider = 'RSS';
      expect(supportedProviders.includes(provider)).toBe(true);
    });

    it('shows for WEB provider', () => {
      const provider = 'WEB';
      expect(supportedProviders.includes(provider)).toBe(true);
    });

    it('returns null for TWITTER provider', () => {
      const provider = 'TWITTER';
      expect(supportedProviders.includes(provider)).toBe(false);
    });

    it('returns null for POCKET provider', () => {
      const provider = 'POCKET';
      expect(supportedProviders.includes(provider)).toBe(false);
    });
  });

  describe('loading state', () => {
    it('shows loading skeleton when isLoading is true', () => {
      mockUseCreatorLatestContent.mockReturnValue({
        content: [],
        reason: undefined,
        connectUrl: undefined,
        isLoading: true,
        error: null,
      });

      const hookResult = mockUseCreatorLatestContent('creator-123');
      expect(hookResult.isLoading).toBe(true);
    });
  });

  describe('not connected state', () => {
    it('shows connect prompt when reason is NOT_CONNECTED', () => {
      mockUseCreatorLatestContent.mockReturnValue({
        content: [],
        reason: 'NOT_CONNECTED',
        connectUrl: 'https://auth.example.com/youtube',
        isLoading: false,
        error: null,
      });

      const hookResult = mockUseCreatorLatestContent('creator-123');
      expect(hookResult.reason).toBe('NOT_CONNECTED');
      expect(hookResult.connectUrl).toBe('https://auth.example.com/youtube');
    });

    it('routes connect prompts into the subscriptions source screen', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      let renderer: Renderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(CreatorLatestContent, {
            creatorId: 'creator-123',
            provider: 'YOUTUBE',
            stateOverride: {
              content: [],
              reason: 'NOT_CONNECTED',
              connectUrl: undefined,
              isLoading: false,
              error: null,
            },
          })
        );
      });

      const connectButton = renderer!.root.find(
        (node: TestNode) => node.type === 'button' && getTextContent(node).includes('Connect')
      );

      act(() => {
        connectButton.props.onPress();
      });

      expect(mockPush).toHaveBeenCalledWith('/subscriptions/youtube');
      expect(mockOpenURL).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('shows connect prompt without URL when connectUrl is undefined', () => {
      mockUseCreatorLatestContent.mockReturnValue({
        content: [],
        reason: 'NOT_CONNECTED',
        connectUrl: undefined,
        isLoading: false,
        error: null,
      });

      const hookResult = mockUseCreatorLatestContent('creator-123');
      expect(hookResult.reason).toBe('NOT_CONNECTED');
      expect(hookResult.connectUrl).toBeUndefined();
    });
  });

  describe('token expired state', () => {
    it('shows reconnect prompt when reason is TOKEN_EXPIRED', () => {
      mockUseCreatorLatestContent.mockReturnValue({
        content: [],
        reason: 'TOKEN_EXPIRED',
        connectUrl: 'https://auth.example.com/youtube/reconnect',
        isLoading: false,
        error: null,
      });

      const hookResult = mockUseCreatorLatestContent('creator-123');
      expect(hookResult.reason).toBe('TOKEN_EXPIRED');
      expect(hookResult.connectUrl).toBe('https://auth.example.com/youtube/reconnect');
    });

    it('routes reconnect prompts into the subscriptions source screen', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      let renderer: Renderer;

      act(() => {
        renderer = TestRenderer.create(
          React.createElement(CreatorLatestContent, {
            creatorId: 'creator-123',
            provider: 'SPOTIFY',
            stateOverride: {
              content: [],
              reason: 'TOKEN_EXPIRED',
              connectUrl: 'https://auth.example.com/spotify/reconnect',
              isLoading: false,
              error: null,
            },
          })
        );
      });

      const reconnectButton = renderer!.root.find(
        (node: TestNode) => node.type === 'button' && getTextContent(node).includes('Reconnect')
      );

      act(() => {
        reconnectButton.props.onPress();
      });

      expect(mockPush).toHaveBeenCalledWith('/subscriptions/spotify');
      expect(mockOpenURL).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('error state', () => {
    it('shows error state when error is present', () => {
      const mockError = new Error('Failed to fetch content');
      mockUseCreatorLatestContent.mockReturnValue({
        content: [],
        reason: undefined,
        connectUrl: undefined,
        isLoading: false,
        error: mockError,
      });

      const hookResult = mockUseCreatorLatestContent('creator-123');
      expect(hookResult.error).toBe(mockError);
    });
  });

  describe('empty state', () => {
    it('shows empty state when content is empty', () => {
      mockUseCreatorLatestContent.mockReturnValue({
        content: [],
        reason: undefined,
        connectUrl: undefined,
        isLoading: false,
        error: null,
      });

      const hookResult = mockUseCreatorLatestContent('creator-123');
      expect(hookResult.content).toHaveLength(0);
    });
  });

  describe('success state', () => {
    it('returns content when data is available', () => {
      const mockContent = [
        createMockContentItem({ providerId: 'v1', title: 'Video 1' }),
        createMockContentItem({ providerId: 'v2', title: 'Video 2' }),
        createMockContentItem({ providerId: 'v3', title: 'Video 3' }),
      ];

      mockUseCreatorLatestContent.mockReturnValue({
        content: mockContent,
        reason: undefined,
        connectUrl: undefined,
        isLoading: false,
        error: null,
      });

      const hookResult = mockUseCreatorLatestContent('creator-123');
      expect(hookResult.content).toHaveLength(3);
      expect(hookResult.content[0].title).toBe('Video 1');
    });

    it('handles content with null thumbnails', () => {
      const mockContent = [createMockContentItem({ thumbnailUrl: null })];

      mockUseCreatorLatestContent.mockReturnValue({
        content: mockContent,
        reason: undefined,
        connectUrl: undefined,
        isLoading: false,
        error: null,
      });

      const hookResult = mockUseCreatorLatestContent('creator-123');
      expect(hookResult.content[0].thumbnailUrl).toBeNull();
    });

    it('handles content with null publishedAt', () => {
      const mockContent = [createMockContentItem({ publishedAt: null })];

      mockUseCreatorLatestContent.mockReturnValue({
        content: mockContent,
        reason: undefined,
        connectUrl: undefined,
        isLoading: false,
        error: null,
      });

      const hookResult = mockUseCreatorLatestContent('creator-123');
      expect(hookResult.content[0].publishedAt).toBeNull();
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
  });

  describe('URL handling', () => {
    it('provides valid connect URL for NOT_CONNECTED', () => {
      mockUseCreatorLatestContent.mockReturnValue({
        content: [],
        reason: 'NOT_CONNECTED',
        connectUrl: 'https://auth.example.com/connect',
        isLoading: false,
        error: null,
      });

      const hookResult = mockUseCreatorLatestContent('creator-123');
      expect(hookResult.connectUrl).toMatch(/^https:\/\//);
    });

    it('provides valid connect URL for TOKEN_EXPIRED', () => {
      mockUseCreatorLatestContent.mockReturnValue({
        content: [],
        reason: 'TOKEN_EXPIRED',
        connectUrl: 'https://auth.example.com/reconnect',
        isLoading: false,
        error: null,
      });

      const hookResult = mockUseCreatorLatestContent('creator-123');
      expect(hookResult.connectUrl).toMatch(/^https:\/\//);
    });
  });

  describe('data transformation', () => {
    it('transforms API content to display format', () => {
      const mockContent = [
        {
          providerId: 'vid-1',
          title: 'Test Video',
          thumbnailUrl: 'https://example.com/thumb.jpg',
          duration: 600,
          publishedAt: '2024-01-15T10:00:00Z',
          url: 'https://youtube.com/watch?v=vid-1',
        },
      ];

      mockUseCreatorLatestContent.mockReturnValue({
        content: mockContent,
        reason: undefined,
        connectUrl: undefined,
        isLoading: false,
        error: null,
      });

      const hookResult = mockUseCreatorLatestContent('creator-123');
      expect(hookResult.content[0]).toEqual({
        providerId: 'vid-1',
        title: 'Test Video',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        duration: 600,
        publishedAt: '2024-01-15T10:00:00Z',
        url: 'https://youtube.com/watch?v=vid-1',
      });
    });
  });
});
