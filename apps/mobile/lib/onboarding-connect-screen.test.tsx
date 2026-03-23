import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import OnboardingConnectScreen from '@/app/onboarding/connect';

const mockPush = jest.fn();
const mockReplace = jest.fn();

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
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
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
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
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
  Path: () => React.createElement('path'),
}));

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => 'light',
}));

jest.mock('@/hooks/use-connections', () => ({
  useConnections: () => ({
    data: [],
  }),
}));

describe('OnboardingConnectScreen source routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes provider connect actions through the subscriptions source screens', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<OnboardingConnectScreen />);
    });

    const buttons = renderer!.root.findAll(
      (node: TestNode) => node.type === 'button' && getTextContent(node).includes('Connect')
    );

    expect(buttons).toHaveLength(2);

    act(() => {
      buttons[0].props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/subscriptions/youtube');

    act(() => {
      buttons[1].props.onPress();
    });
    expect(mockPush).toHaveBeenCalledWith('/subscriptions/spotify');
    consoleErrorSpy.mockRestore();
  });
});
