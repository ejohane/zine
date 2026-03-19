import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import SettingsScreen from '@/app/settings/index';

const mockPush = jest.fn();

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
    replace: jest.fn(),
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
    hairlineWidth: 1,
  },
  Linking: {
    openURL: jest.fn(),
  },
  Share: {
    share: jest.fn(),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

jest.mock('@clerk/clerk-expo', () => ({
  useClerk: () => ({
    signOut: jest.fn(),
  }),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.0.0',
      ios: {
        buildNumber: '1',
      },
    },
  },
}));

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => 'light',
}));

jest.mock('@/hooks/use-connections', () => ({
  useConnections: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-subscriptions-query', () => ({
  useSubscriptions: () => ({ data: { items: [{ id: 'sub-1' }, { id: 'sub-2' }] } }),
}));

jest.mock('@/lib/diagnostics', () => ({
  buildMobileDiagnosticBundle: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  settingsLogger: {
    error: jest.fn(),
  },
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuthAvailability: () => ({ isEnabled: false }),
}));

describe('SettingsScreen weekly recap entry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a permanent weekly recap row in settings', () => {
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsScreen />);
    });

    expect(getTextContent(renderer!.root)).toContain('INSIGHTS');
    expect(getTextContent(renderer!.root)).toContain('Weekly Recap');
    expect(getTextContent(renderer!.root)).toContain(
      'Review your reading, watching, and listening anytime'
    );
  });

  it('opens the detailed weekly recap screen from settings', () => {
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsScreen />);
    });

    act(() => {
      findButtonByText(renderer!, 'Weekly Recap').props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/recap/weekly');
  });
});
