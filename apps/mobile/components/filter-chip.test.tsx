import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { FilterChip } from './filter-chip';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
}));

const { selectionAsync: mockSelectionAsync } = jest.requireMock('expo-haptics') as {
  selectionAsync: jest.Mock;
};

jest.mock('react-native', () => ({
  __esModule: true,
  Platform: {
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
  Pressable: ({
    children,
    onPress,
  }: {
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    onPress?: () => void;
  }) =>
    React.createElement(
      'button',
      { onClick: onPress, onPress },
      typeof children === 'function' ? children({ pressed: false }) : children
    ),
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
  View: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: {
      surfaceRaised: '#222222',
      surfaceSubtle: '#111111',
      borderDefault: '#666666',
      borderSubtle: '#444444',
      textPrimary: '#ffffff',
      textSubheader: '#bbbbbb',
    },
    motion: {
      opacity: {
        pressed: 0.8,
      },
    },
  }),
}));

jest.mock('@/components/primitives/text', () => ({
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('span', null, children),
}));

describe('FilterChip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectionAsync.mockResolvedValue(undefined);
  });

  it('triggers selection haptics and calls onPress', () => {
    const onPress = jest.fn();
    let renderer: ReturnType<typeof TestRenderer.create>;

    act(() => {
      renderer = TestRenderer.create(
        React.createElement(FilterChip, {
          label: 'Articles',
          isSelected: false,
          onPress,
        })
      );
    });

    act(() => {
      renderer.root.findByType('button').props.onPress();
    });

    expect(mockSelectionAsync).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
