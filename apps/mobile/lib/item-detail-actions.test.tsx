import React from 'react';
import { act, create } from 'react-test-renderer';

import { Colors } from '@/constants/theme';
import { UserItemState } from '@/hooks/use-items-trpc';

import { ItemDetailActions } from '@/app/item/detail/components/ItemDetailActions';

jest.mock('react-native', () => ({
  View: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('View', props, children),
  Pressable: ({
    children,
    style,
    ...props
  }: {
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    style?: unknown;
  }) =>
    React.createElement(
      'Pressable',
      {
        ...props,
        style: typeof style === 'function' ? style({ pressed: false }) : style,
      },
      typeof children === 'function' ? children({ pressed: false }) : children
    ),
  StyleSheet: {
    create: (styles: unknown) => styles,
    flatten: (style: unknown) => style,
    absoluteFill: {},
  },
  Text: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('Text', props, children),
  Platform: {
    OS: 'ios',
    select: (values: Record<string, unknown>) => values.ios ?? values.default,
  },
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('AnimatedView', props, children),
  },
}));

jest.mock('@expo/vector-icons', () => {
  const Icon = ({ name }: { name: string }) => React.createElement('Icon', { name });

  return {
    Ionicons: Icon,
    FontAwesome5: Icon,
  };
});

jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colorScheme: 'dark',
    colors: {
      accent: '#0a84ff',
      borderDefault: '#333333',
      borderSubtle: '#222222',
      statusError: '#ff453a',
      statusErrorSurface: '#3a1010',
      surfaceRaised: '#1f1f1f',
    },
    fonts: {},
    motion: {},
  }),
}));

jest.mock('@/hooks/use-items-trpc', () => ({
  UserItemState: {
    BOOKMARKED: 'BOOKMARKED',
    INBOX: 'INBOX',
  },
}));

describe('ItemDetailActions', () => {
  it('wires the provider FAB to the open-link action', () => {
    const onOpenLink = jest.fn();
    let renderer: ReturnType<typeof create> | null = null;

    act(() => {
      renderer = create(
        <ItemDetailActions
          item={{ state: UserItemState.BOOKMARKED, provider: 'SPOTIFY' }}
          colors={Colors.dark}
          bookmarkActionIcon="bookmark-outline"
          bookmarkActionColor={Colors.dark.text}
          isBookmarkActionDisabled={false}
          secondaryActionIcon="checkmark-circle-outline"
          secondaryActionColor={Colors.dark.textSecondary}
          isSecondaryActionDisabled={false}
          onBookmarkToggle={jest.fn()}
          onSecondaryAction={jest.fn()}
          onManageTags={jest.fn()}
          onShare={jest.fn()}
          onOpenLink={onOpenLink}
          useAnimatedContainer={false}
        />
      );
    });

    const fab = renderer!.root.findByProps({ accessibilityLabel: 'Open source link' });

    act(() => {
      fab.props.onPress();
    });

    expect(onOpenLink).toHaveBeenCalledTimes(1);
  });
});
