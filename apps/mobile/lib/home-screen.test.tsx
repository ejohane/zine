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
        props,
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
  getFeaturedGridItemWidth: () => 160,
  getVisibleFeaturedGridItems: (items: unknown[]) => items,
}));

jest.mock('@/hooks/use-items-trpc', () => ({
  useInboxItems: () => ({ data: { items: [] }, isLoading: false }),
  useInfiniteInboxItems: () => ({
    data: {
      pages: [{ items: [], nextCursor: null }],
    },
    isLoading: false,
  }),
  useHomeData: () => ({
    data: {
      jumpBackIn: [],
      recentBookmarks: [],
      byContentType: {
        podcasts: [],
        videos: [],
        articles: [],
      },
    },
    isLoading: false,
  }),
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
});
