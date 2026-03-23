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
  useConnections: () => ({
    data: [
      { provider: 'YOUTUBE', status: 'ACTIVE', providerUserId: 'yt-user' },
      { provider: 'SPOTIFY', status: 'EXPIRED', providerUserId: 'sp-user' },
      { provider: 'GMAIL', status: 'ACTIVE', providerUserId: 'mail-user' },
    ],
  }),
}));

jest.mock('@/hooks/use-subscriptions-query', () => ({
  useSubscriptions: () => ({
    data: { items: [{ id: 'sub-1' }, { id: 'sub-2' }, { id: 'sub-3' }] },
  }),
}));

jest.mock('@/lib/trpc', () => ({
  trpc: {
    subscriptions: {
      newsletters: {
        stats: {
          useQuery: () => ({ data: { active: 4 } }),
        },
      },
      rss: {
        stats: {
          useQuery: () => ({ data: { active: 2 } }),
        },
      },
    },
  },
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

describe('SettingsScreen subscriptions entrypoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('surfaces a single subscriptions entrypoint instead of provider-specific connection rows', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsScreen />);
    });

    const rootText = getTextContent(renderer!.root);

    expect(rootText).toContain('Subscriptions');
    expect(rootText).toContain(
      '9 active subscriptions · 2 integrations connected · 1 integration needs attention'
    );
    expect(rootText).not.toContain('Connected Accounts');
    expect(rootText).not.toContain('YouTube');
    expect(rootText).not.toContain('Spotify');
    expect(rootText).not.toContain('Gmail');
    consoleErrorSpy.mockRestore();
  });

  it('opens subscriptions from settings using the consolidated entrypoint', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsScreen />);
    });

    const subscriptionsButton = renderer!.root.find(
      (node: TestNode) => node.type === 'button' && getTextContent(node).includes('Subscriptions')
    );

    act(() => {
      subscriptionsButton.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith('/subscriptions');
    consoleErrorSpy.mockRestore();
  });
});
