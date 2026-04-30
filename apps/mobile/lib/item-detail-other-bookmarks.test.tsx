import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { UserItemState, ContentType, Provider } from '@zine/shared';

import { Colors } from '@/constants/theme';
import { ItemDetailContent } from '@/app/item/detail/components/ItemDetailContent';
import type { ItemDetailItem } from '@/app/item/detail/types';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  Stack: {
    Screen: () => null,
  },
}));

jest.mock('react-native', () => ({
  View: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('div', props, children),
  Text: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('span', props, children),
  ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('scroll-view', props, children),
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
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    flatten: (style: unknown) => style,
    absoluteFillObject: {},
  },
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('div', props, children),
}));

jest.mock('@/components/ParallaxScrollView', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('div', props, children),
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-image', () => ({
  Image: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('img', props, children),
}));

jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colorScheme: 'dark',
    colors: Colors.dark,
    motion: { duration: { normal: 0 } },
  }),
}));

jest.mock('@/lib/content-utils', () => ({
  getContentIcon: () => null,
  mapContentType: (contentType: string) => contentType,
  mapProvider: (provider: string) => provider,
}));

jest.mock('@/components/item-card', () => ({
  ItemCard: ({
    item,
    onPress,
  }: {
    item: { title: string; creator: string; duration?: number | null };
    onPress?: () => void;
  }) =>
    React.createElement(
      'button',
      {
        accessibilityLabel: `Open bookmark ${item.title}`,
        onPress,
      },
      React.createElement('span', null, item.title),
      React.createElement('span', null, item.creator),
      item.duration ? React.createElement('span', null, `${item.duration}`) : null
    ),
}));

function createItem(overrides: Partial<ItemDetailItem> = {}): ItemDetailItem {
  return {
    id: 'ui-current',
    itemId: 'item-current',
    title: 'Current bookmark',
    thumbnailUrl: null,
    canonicalUrl: 'https://example.com/current',
    contentType: ContentType.ARTICLE,
    provider: Provider.WEB,
    creator: 'Example Creator',
    creatorImageUrl: null,
    creatorId: 'creator-1',
    publisher: null,
    summary: 'Current bookmark summary',
    duration: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    wordCount: 1200,
    readingTimeMinutes: 6,
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2026-01-01T00:00:00.000Z',
    bookmarkedAt: '2026-01-01T00:00:00.000Z',
    lastOpenedAt: null,
    progress: null,
    isFinished: false,
    finishedAt: null,
    tags: [],
    ...overrides,
  };
}

function renderContent(props: Partial<React.ComponentProps<typeof ItemDetailContent>> = {}) {
  let renderer: ReturnType<typeof TestRenderer.create> | null = null;

  act(() => {
    renderer = TestRenderer.create(
      <ItemDetailContent
        item={createItem()}
        colors={Colors.dark}
        descriptionLabel="Description"
        bookmarkActionIcon="bookmark"
        bookmarkActionColor={Colors.dark.textPrimary}
        isBookmarkActionDisabled={false}
        secondaryActionIcon="checkmark-circle"
        secondaryActionColor={Colors.dark.textPrimary}
        isSecondaryActionDisabled={false}
        onBookmarkToggle={jest.fn()}
        onSecondaryAction={jest.fn()}
        onManageTags={jest.fn()}
        onShare={jest.fn()}
        onOpenLink={jest.fn()}
        useAnimatedDescription={false}
        useAnimatedActions={false}
        otherUnfinishedBookmarks={[]}
        onOtherBookmarkPress={(bookmarkId) => mockPush(`/item/${bookmarkId}`)}
        {...props}
      />
    );
  });

  return renderer!;
}

function textContent(node: { children: Array<string | { children: unknown[] }> }): string {
  return node.children
    .map((child) =>
      typeof child === 'string'
        ? child
        : textContent(child as { children: Array<string | { children: unknown[] }> })
    )
    .join('');
}

describe('ItemDetailContent other creator bookmarks', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('hides the other bookmarks card when there are no other unfinished bookmarks', () => {
    const renderer = renderContent();

    expect(() =>
      renderer.root.findByProps({ accessibilityLabel: 'Other bookmarks from creator' })
    ).toThrow();
  });

  it('shows a collapsed other bookmarks card below the description and expands to navigate to a bookmark', () => {
    const renderer = renderContent({
      otherUnfinishedBookmarks: [
        createItem({
          id: 'ui-next',
          itemId: 'item-next',
          title: 'Next bookmark',
          summary: 'Another thing to read',
        }),
      ],
    });

    const labels = renderer.root.findAllByType('span').map(textContent).join(' ');
    expect(labels.indexOf('Current bookmark summary')).toBeLessThan(
      labels.indexOf('Your Bookmarks')
    );
    expect(labels).not.toContain('1 item');
    expect(labels).not.toContain('Next bookmark');

    const toggleButton = renderer.root.findByProps({
      accessibilityLabel: 'Toggle other bookmarks from creator',
    });
    expect(toggleButton.props.accessibilityState).toEqual({ expanded: false });

    act(() => {
      toggleButton.props.onPress();
    });

    expect(toggleButton.props.accessibilityState).toEqual({ expanded: true });
    const expandedLabels = renderer.root.findAllByType('span').map(textContent).join(' ');
    expect(expandedLabels).toContain('Next bookmark');

    const bookmarkButton = renderer.root.findByProps({
      accessibilityLabel: 'Open bookmark Next bookmark',
    });

    act(() => {
      bookmarkButton.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/item/ui-next');
  });
});
