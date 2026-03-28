import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockPush = jest.fn();
const mockAddListener = jest.fn();
const mockIsFocused = jest.fn();
const mockScrollToOffset = jest.fn();
const mockRemoveListener = jest.fn();

const mockNavigation = {
  addListener: mockAddListener,
  isFocused: mockIsFocused,
};

let tabPressListener: (() => void) | undefined;

type Renderer = ReturnType<typeof TestRenderer.create>;
type TestNode = Renderer['root'];

function findFilterChip(renderer: Renderer, label: string) {
  return renderer.root.find(
    (node: TestNode) =>
      node.type === 'button' && node.props.accessibilityLabel === `Filter ${label}`
  );
}

function findLibraryList(renderer: Renderer) {
  return renderer.root.find((node: TestNode) => node.type === 'flat-list');
}

function pressLibraryTab() {
  if (!tabPressListener) {
    throw new Error('Expected library tab press listener to be registered');
  }

  tabPressListener();
}

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'light',
  },
  impactAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useNavigation: () => mockNavigation,
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native', () => ({
  __esModule: true,
  Platform: {
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
  View: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('span', null, children),
  ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('scroll-view', props, children),
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
  Pressable: ({
    children,
    onPress,
  }: {
    children: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    onPress?: () => void;
  }) =>
    React.createElement(
      'button',
      { onClick: onPress, onPress },
      typeof children === 'function' ? children({ pressed: false }) : children
    ),
  TextInput: ({
    value,
    onChangeText,
    ...props
  }: {
    value?: string;
    onChangeText?: (text: string) => void;
  }) => React.createElement('input', { ...props, value, onChangeText }),
  FlatList: React.forwardRef(
    (
      {
        data,
        renderItem,
        ...props
      }: {
        data?: unknown[];
        renderItem?: (args: { item: unknown; index: number }) => React.ReactNode;
      },
      ref: React.ForwardedRef<{ scrollToOffset: typeof mockScrollToOffset }>
    ) => {
      React.useImperativeHandle(ref, () => ({
        scrollToOffset: mockScrollToOffset,
      }));

      return React.createElement(
        'flat-list',
        props,
        data?.map((item, index) =>
          React.createElement(React.Fragment, { key: index }, renderItem?.({ item, index }))
        )
      );
    }
  ),
  ActivityIndicator: () => React.createElement('span', null, 'loading'),
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
  CheckOutlineIcon: () => null,
  HeadphonesIcon: () => null,
  PostIcon: () => null,
  VideoIcon: () => null,
}));

jest.mock('@/components/item-card', () => ({
  ItemCard: () => React.createElement('div', null, 'item'),
}));

jest.mock('@/components/list-states', () => ({
  LoadingState: () => React.createElement('div', null, 'loading'),
  ErrorState: ({ message }: { message: string }) => React.createElement('div', null, message),
  EmptyState: ({ title }: { title: string }) => React.createElement('div', null, title),
}));

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => 'light',
}));

jest.mock('@/hooks/use-prefetch', () => ({
  useTabPrefetch: jest.fn(),
}));

jest.mock('@/hooks/use-items-trpc', () => ({
  useInfiniteLibraryItems: () => ({
    data: {
      pages: [
        {
          items: [
            {
              id: 'item-1',
              title: 'Example article',
              creator: 'Example creator',
              creatorImageUrl: null,
              thumbnailUrl: null,
              contentType: 'ARTICLE',
              provider: 'RSS',
              duration: null,
              readingTimeMinutes: 5,
              bookmarkedAt: null,
              publishedAt: null,
              isFinished: false,
            },
          ],
        },
      ],
    },
    isLoading: false,
    error: null,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
  mapContentType: (value: string) => value.toLowerCase(),
  mapProvider: (value: string) => value,
}));

const LibraryScreen = jest.requireActual('@/app/(tabs)/library').default;

describe('LibraryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tabPressListener = undefined;
    mockIsFocused.mockReturnValue(true);
    mockAddListener.mockImplementation((event: 'tabPress', listener: () => void) => {
      if (event === 'tabPress') {
        tabPressListener = listener;
      }

      return mockRemoveListener;
    });
  });

  it('clears the active filter when the library tab is reselected at the top', () => {
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<LibraryScreen />);
    });

    act(() => {
      findFilterChip(renderer!, 'Articles').props.onPress();
    });

    expect(findFilterChip(renderer!, 'Articles').props['data-selected']).toBe(true);

    act(() => {
      pressLibraryTab();
    });

    expect(findFilterChip(renderer!, 'Articles').props['data-selected']).toBe(false);
    expect(mockScrollToOffset).not.toHaveBeenCalled();
  });

  it('clears the completed filter when the library tab is reselected at the top', () => {
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<LibraryScreen />);
    });

    act(() => {
      findFilterChip(renderer!, 'Completed').props.onPress();
    });

    expect(findFilterChip(renderer!, 'Completed').props['data-selected']).toBe(true);

    act(() => {
      pressLibraryTab();
    });

    expect(findFilterChip(renderer!, 'Completed').props['data-selected']).toBe(false);
    expect(mockScrollToOffset).not.toHaveBeenCalled();
  });

  it('scrolls to the top without clearing the active filter when the library tab is reselected mid-scroll', () => {
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<LibraryScreen />);
    });

    act(() => {
      findFilterChip(renderer!, 'Articles').props.onPress();
    });

    act(() => {
      findLibraryList(renderer!).props.onScroll({
        nativeEvent: {
          contentOffset: {
            y: 240,
          },
        },
      });
    });

    act(() => {
      pressLibraryTab();
    });

    expect(mockScrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
    expect(findFilterChip(renderer!, 'Articles').props['data-selected']).toBe(true);
  });
});
