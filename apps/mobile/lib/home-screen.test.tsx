import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import HomeScreen from '@/app/(tabs)/index';

const mockPush = jest.fn();
const mockUseWeeklyRecapTeaser = jest.fn();
const mockUseWeeklyRecapEntryState = jest.fn();

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

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useNavigation: () => ({
    addListener: () => jest.fn(),
    isFocused: () => true,
  }),
  Stack: {
    Screen: () => null,
  },
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
  ScrollView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
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
  FlatList: ({
    data,
    renderItem,
  }: {
    data?: unknown[];
    renderItem?: (args: { item: unknown; index: number }) => React.ReactNode;
  }) =>
    React.createElement(
      'div',
      null,
      data?.map((item, index) => renderItem?.({ item, index }))
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
  FilterChip: ({ label }: { label: string }) => React.createElement('span', null, label),
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

jest.mock('@/lib/home-layout', () => ({
  getFeaturedGridItemWidth: () => 160,
  getVisibleFeaturedGridItems: (items: unknown[]) => items,
}));

jest.mock('@/hooks/use-items-trpc', () => ({
  useInboxItems: () => ({ data: { items: [] }, isLoading: false }),
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

jest.mock('@/hooks/use-insights-trpc', () => ({
  useWeeklyRecapTeaser: (...args: unknown[]) => mockUseWeeklyRecapTeaser(...args),
  useWeeklyRecapEntryState: () => mockUseWeeklyRecapEntryState(),
}));

describe('HomeScreen weekly recap behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWeeklyRecapTeaser.mockReturnValue({
      data: { headline: 'You finished 4 things last week' },
      isLoading: false,
    });
    mockUseWeeklyRecapEntryState.mockReturnValue({
      shouldShowEntry: true,
      weekAnchorDate: '2026-03-15',
    });
  });

  it('does not render a weekly recap card on Home and does not query teaser data', () => {
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<HomeScreen />);
    });

    expect(getTextContent(renderer!.root)).not.toContain('Weekly recap card');
    expect(mockUseWeeklyRecapEntryState).not.toHaveBeenCalled();
    expect(mockUseWeeklyRecapTeaser).not.toHaveBeenCalled();
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
});
