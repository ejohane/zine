import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import HomeScreen from '@/app/(tabs)/index';

const mockPush = jest.fn();
const mockAddListener = jest.fn();
const mockIsFocused = jest.fn();
const mockScrollTo = jest.fn();
const mockRemoveListener = jest.fn();
let mockConnections: Array<{ provider: string; status: string }> = [];
let mockSubscriptionsData: { items: Array<{ provider: string; status: string }> } = { items: [] };
type MockFeedItem = {
  id: string;
  title: string;
  creator: string;
  publisher?: string;
  creatorImageUrl: string | null;
  thumbnailUrl: string | null;
  contentType?: string;
  provider: string;
  duration: number | null;
  readingTimeMinutes: number | null;
};

type MockHomeCollection = {
  collectionId: string;
  title: string;
  layout: 'STACK_RAIL' | 'COVER_RAIL' | 'ROW_GRID' | 'COMPACT_LIST';
  position: number;
  count: number;
  items: MockFeedItem[];
};

type MockHomeData = {
  jumpBackIn: MockFeedItem[];
  recentBookmarks: MockFeedItem[];
  byContentType: {
    podcasts: MockFeedItem[];
    videos: MockFeedItem[];
    articles: MockFeedItem[];
  };
  customCollections: MockHomeCollection[];
};

const mockUseInfiniteInboxItems = jest.fn((_options?: unknown) => ({
  data: {
    pages: [{ items: [] as MockFeedItem[], nextCursor: null }],
  },
  isLoading: false,
}));
const mockUseHomeData = jest.fn((_options?: unknown) => ({
  data: {
    jumpBackIn: [],
    recentBookmarks: [],
    byContentType: {
      podcasts: [],
      videos: [],
      articles: [],
    },
    customCollections: [],
  } as MockHomeData,
  isLoading: false,
}));

const mockNavigation: {
  addListener: typeof mockAddListener;
  isFocused: typeof mockIsFocused;
  getParent: () => typeof mockTabNavigation | undefined;
} = {
  addListener: mockAddListener,
  isFocused: mockIsFocused,
  getParent: () => mockTabNavigation,
};

const mockTabNavigation = {
  addListener: mockAddListener,
};

let tabPressListener: (() => void) | undefined;

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

function findButtonByText(renderer: Renderer, text: string) {
  return renderer.root.find(
    (node: TestNode) => node.type === 'button' && getTextContent(node).includes(text)
  );
}

function findFilterChip(renderer: Renderer, label: string) {
  return renderer.root.find(
    (node: TestNode) =>
      node.type === 'button' && node.props.accessibilityLabel === `Filter ${label}`
  );
}

function findHomeList(renderer: Renderer) {
  return renderer.root.find(
    (node: TestNode) => node.type === 'flat-list' && node.props.horizontal !== true
  );
}

function renderListBoundary(boundary: React.ReactNode | (() => React.ReactNode) | undefined) {
  if (!boundary) {
    return null;
  }

  return typeof boundary === 'function' ? boundary() : boundary;
}

function pressHomeTab() {
  if (!tabPressListener) {
    throw new Error('Expected home tab press listener to be registered');
  }

  tabPressListener();
}

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useNavigation: () => mockNavigation,
  Stack: {
    Screen: ({
      options,
    }: {
      options?: {
        headerRight?: () => React.ReactNode;
      };
    }) => React.createElement(React.Fragment, null, options?.headerRight?.()),
  },
}));

jest.mock('react-native', () => ({
  __esModule: true,
  Platform: {
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
  View: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('div', props, children),
  Text: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('span', props, children),
  ScrollView: React.forwardRef(
    (
      { children, ...props }: { children?: React.ReactNode; horizontal?: boolean },
      ref: React.ForwardedRef<{ scrollTo: typeof mockScrollTo }>
    ) => {
      React.useImperativeHandle(ref, () => ({
        scrollTo: mockScrollTo,
      }));

      return React.createElement('scroll-view', props, children);
    }
  ),
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
  Pressable: ({
    children,
    onPress,
    ...props
  }: {
    children: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    onPress?: () => void;
  }) =>
    React.createElement(
      'button',
      { onClick: onPress, onPress, ...props },
      typeof children === 'function' ? children({ pressed: false }) : children
    ),
  FlatList: React.forwardRef(
    (
      {
        data,
        renderItem,
        ListHeaderComponent,
        ListFooterComponent,
        ListEmptyComponent,
        ...props
      }: {
        data?: unknown[];
        renderItem?: (args: { item: unknown; index: number }) => React.ReactNode;
        ListHeaderComponent?: React.ReactNode | (() => React.ReactNode);
        ListFooterComponent?: React.ReactNode | (() => React.ReactNode);
        ListEmptyComponent?: React.ReactNode | (() => React.ReactNode);
        horizontal?: boolean;
      },
      ref: React.ForwardedRef<{
        scrollToOffset: (args: { offset: number; animated: boolean }) => void;
      }>
    ) => {
      React.useImperativeHandle(ref, () => ({
        scrollToOffset: mockScrollTo,
      }));

      const renderedItems =
        data && data.length > 0
          ? data.map((item, index) => renderItem?.({ item, index }))
          : renderListBoundary(ListEmptyComponent);

      return React.createElement(
        'flat-list',
        { data, renderItem, ...props },
        renderListBoundary(ListHeaderComponent),
        renderedItems,
        renderListBoundary(ListFooterComponent)
      );
    }
  ),
  ActivityIndicator: () => React.createElement('span', null, 'loading'),
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', null, children),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('svg', null, children),
  Path: () => null,
}));

jest.mock('heroui-native', () => ({
  Surface: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('section', null, children),
}));

jest.mock('@/components/filter-chip', () => ({
  FilterChip: ({
    label,
    isSelected,
    onPress,
  }: {
    label: string;
    isSelected: boolean;
    onPress: () => void;
  }) =>
    React.createElement(
      'button',
      {
        onPress,
        accessibilityLabel: `Filter ${label}`,
        'data-selected': isSelected,
      },
      label
    ),
}));

jest.mock('@/components/icons', () => ({
  ArticleIcon: () => null,
  HeadphonesIcon: () => null,
  PostIcon: () => null,
  SettingsIcon: () => React.createElement('span', null, 'Settings icon'),
  VideoIcon: () => null,
}));

jest.mock('@/components/insights/weekly-recap-card', () => ({
  WeeklyRecapCard: () => React.createElement('button', null, 'Weekly recap card'),
}));

jest.mock('@/components/item-card', () => ({
  ItemCard: () => React.createElement('div', null, 'item'),
}));

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => 'dark',
}));

jest.mock('@/hooks/use-prefetch', () => ({
  useTabPrefetch: jest.fn(),
}));

jest.mock('@/hooks/use-connections', () => ({
  useConnections: () => ({ data: mockConnections }),
}));

jest.mock('@/hooks/use-subscriptions-query', () => ({
  useSubscriptions: () => ({ data: mockSubscriptionsData }),
}));

jest.mock('@/lib/home-layout', () => ({
  ...jest.requireActual('@/lib/home-layout'),
  getFeaturedGridItemWidth: () => 160,
}));

jest.mock('@/hooks/use-items-trpc', () => ({
  useInboxItems: () => ({ data: { items: [] }, isLoading: false }),
  useInfiniteInboxItems: (options?: unknown) => mockUseInfiniteInboxItems(options),
  useHomeData: (options?: unknown) => mockUseHomeData(options),
  useLibraryItems: () => ({ data: { items: [] } }),
  mapContentType: (value: string) => value.toLowerCase(),
  mapProvider: (value: string) => value,
}));

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tabPressListener = undefined;
    mockConnections = [];
    mockSubscriptionsData = { items: [] };
    mockIsFocused.mockReturnValue(true);
    mockUseInfiniteInboxItems.mockClear();
    mockUseHomeData.mockClear();
    mockAddListener.mockImplementation((event: 'tabPress', listener: () => void) => {
      if (event === 'tabPress') {
        tabPressListener = listener;
      }

      return mockRemoveListener;
    });
  });

  it('does not render a weekly recap card on Home', () => {
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    expect(getTextContent(renderer!.root)).not.toContain('Weekly recap card');
  });

  it('keeps settings navigation on the Home screen', () => {
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    act(() => {
      findButtonByText(renderer!, 'Settings icon').props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('keeps the home settings button background transparent without custom press feedback', () => {
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    const settingsButton = renderer!.root.findByProps({ accessibilityLabel: 'Open settings' });

    expect(settingsButton.props.style).toEqual(
      expect.objectContaining({ backgroundColor: 'transparent' })
    );
  });

  it('shows an alert dot on the settings button when an integration is disconnected', () => {
    mockSubscriptionsData = {
      items: [{ provider: 'YOUTUBE', status: 'DISCONNECTED' }],
    };

    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    expect(() => renderer!.root.findByProps({ testID: 'home-settings-alert-dot' })).not.toThrow();
  });

  it('clears the active filter when the home tab is reselected at the top', () => {
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    act(() => {
      findFilterChip(renderer!, 'Articles').props.onPress();
    });

    expect(findFilterChip(renderer!, 'Articles').props['data-selected']).toBe(true);

    act(() => {
      pressHomeTab();
    });

    expect(findFilterChip(renderer!, 'Articles').props['data-selected']).toBe(false);
    expect(mockScrollTo).not.toHaveBeenCalled();
  });

  it('scrolls to the top without clearing the active filter when the home tab is reselected mid-scroll', () => {
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    act(() => {
      findFilterChip(renderer!, 'Articles').props.onPress();
    });

    act(() => {
      findHomeList(renderer!).props.onScroll({
        nativeEvent: {
          contentOffset: {
            y: 240,
          },
        },
      });
    });

    act(() => {
      pressHomeTab();
    });

    expect(mockScrollTo).toHaveBeenCalledWith({ offset: 0, animated: true });
    expect(findFilterChip(renderer!, 'Articles').props['data-selected']).toBe(true);
  });

  it('handles home tab reselection when the screen navigation emits tabPress directly', () => {
    mockNavigation.getParent = () => undefined;

    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    act(() => {
      findFilterChip(renderer!, 'Articles').props.onPress();
    });

    act(() => {
      pressHomeTab();
    });

    expect(findFilterChip(renderer!, 'Articles').props['data-selected']).toBe(false);
    expect(mockScrollTo).not.toHaveBeenCalled();
  });

  it('requests filtered home and inbox data after selecting a content type', () => {
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    act(() => {
      findFilterChip(renderer!, 'Articles').props.onPress();
    });

    expect(mockUseHomeData).toHaveBeenLastCalledWith({
      filter: { contentType: 'ARTICLE' },
    });
    expect(mockUseInfiniteInboxItems).toHaveBeenLastCalledWith({
      filter: { contentType: 'ARTICLE' },
      limit: 20,
    });
  });

  it('renders configured custom collection sections on Home', () => {
    mockUseHomeData.mockReturnValue({
      data: {
        jumpBackIn: [],
        recentBookmarks: [],
        byContentType: {
          podcasts: [],
          videos: [],
          articles: [],
        },
        customCollections: [
          {
            collectionId: 'collection-1',
            title: 'Weekend queue',
            layout: 'COMPACT_LIST',
            position: 1,
            count: 6,
            items: Array.from({ length: 6 }, (_, index) => ({
              id: `collection-item-${index + 1}`,
              title: 'Collection item',
              creator: 'Creator',
              publisher: 'Publisher',
              creatorImageUrl: null,
              thumbnailUrl: null,
              contentType: 'ARTICLE',
              provider: 'RSS',
              duration: null,
              readingTimeMinutes: null,
            })),
          },
        ],
      },
      isLoading: false,
    });

    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    const sections = findHomeList(renderer!).props.data as Array<{
      key: string;
      type: string;
      title: string;
      items: unknown[];
    }>;

    expect(sections).toEqual([
      expect.objectContaining({
        key: 'collection-collection-1',
        type: 'custom-compact-list',
        title: 'Weekend queue',
        items: expect.arrayContaining([expect.objectContaining({ id: 'collection-item-1' })]),
      }),
    ]);
    expect(sections[0].items).toHaveLength(4);

    act(() => {
      findButtonByText(renderer!, 'Weekend queue').props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/collection/[id]',
      params: { id: 'collection-1' },
    });
  });

  it('restores the home section visual caps without changing the expanded fetch size', () => {
    mockUseHomeData.mockReturnValue({
      data: {
        jumpBackIn: Array.from({ length: 8 }, (_, index) => ({
          id: `jump-${index + 1}`,
          title: `Jump ${index + 1}`,
          creator: 'Creator',
          publisher: 'Publisher',
          creatorImageUrl: null,
          thumbnailUrl: null,
          contentType: 'ARTICLE',
          provider: 'RSS',
          duration: null,
          readingTimeMinutes: null,
        })),
        recentBookmarks: Array.from({ length: 8 }, (_, index) => ({
          id: `bookmark-${index + 1}`,
          title: `Bookmark ${index + 1}`,
          creator: 'Creator',
          publisher: 'Publisher',
          creatorImageUrl: null,
          thumbnailUrl: null,
          contentType: 'ARTICLE',
          provider: 'RSS',
          duration: null,
          readingTimeMinutes: null,
        })),
        byContentType: {
          podcasts: Array.from({ length: 6 }, (_, index) => ({
            id: `podcast-${index + 1}`,
            title: `Podcast ${index + 1}`,
            creator: 'Creator',
            publisher: 'Publisher',
            creatorImageUrl: null,
            thumbnailUrl: null,
            provider: 'SPOTIFY',
            duration: null,
            readingTimeMinutes: null,
          })),
          videos: [],
          articles: [],
        },
        customCollections: [],
      },
      isLoading: false,
    });
    mockUseInfiniteInboxItems.mockReturnValue({
      data: {
        pages: [
          {
            items: Array.from({ length: 8 }, (_, index) => ({
              id: `inbox-${index + 1}`,
              title: `Inbox ${index + 1}`,
              creator: 'Creator',
              creatorImageUrl: null,
              thumbnailUrl: null,
              contentType: 'ARTICLE',
              provider: 'RSS',
              duration: null,
              readingTimeMinutes: null,
            })),
            nextCursor: null,
          },
        ],
      },
      isLoading: false,
    });

    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    const sections = findHomeList(renderer!).props.data as Array<{
      key: string;
      items: unknown[];
    }>;

    expect(sections.find((section) => section.key === 'jump-back-in')?.items).toHaveLength(6);
    expect(sections.find((section) => section.key === 'recently-bookmarked')?.items).toHaveLength(
      6
    );
    expect(sections.find((section) => section.key === 'inbox')?.items).toHaveLength(4);
    expect(sections.find((section) => section.key === 'podcasts')?.items).toHaveLength(5);
  });
});
