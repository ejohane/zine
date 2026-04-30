import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import SettingsScreen from '@/app/settings/index';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockStackScreen = jest.fn();

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
  Stack: {
    Screen: (props: Record<string, unknown>) => {
      mockStackScreen(props);
      return React.createElement('stack-screen', props);
    },
  },
  useNavigation: () => ({
    canGoBack: mockCanGoBack,
  }),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: jest.fn(),
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('ionicons', props),
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
  ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('div', props, children),
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
    mockCanGoBack.mockReturnValue(false);
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

  it('shows an alert dot on the subscriptions row when an integration needs attention', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsScreen />);
    });

    expect(() =>
      renderer!.root.findByProps({ testID: 'settings-subscriptions-alert-dot' })
    ).not.toThrow();
    consoleErrorSpy.mockRestore();
  });
});

describe('SettingsScreen header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(false);
  });

  it('adds a header back button when a parent navigator can go back', () => {
    mockCanGoBack.mockReturnValue(true);
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsScreen />);
    });

    expect(renderer!).toBeDefined();

    const stackScreenProps = mockStackScreen.mock.calls.at(-1)?.[0] as {
      options: {
        headerLeft?: (props: Record<string, unknown>) => React.ReactElement;
      };
    };

    expect(stackScreenProps.options.headerLeft).toBeDefined();

    const headerLeft = stackScreenProps.options.headerLeft!;
    const backButton = headerLeft({ tintColor: '#111111' }) as React.ReactElement<{
      onPress: () => void;
      accessibilityLabel?: string;
    }>;

    expect(backButton.props.accessibilityLabel).toBe('Go back');

    act(() => {
      backButton.props.onPress();
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
    consoleErrorSpy.mockRestore();
  });

  it('leaves the header left slot empty when there is no back target', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<SettingsScreen />);
    });

    expect(renderer!).toBeDefined();

    const stackScreenProps = mockStackScreen.mock.calls.at(-1)?.[0] as {
      options: {
        headerLeft?: unknown;
      };
    };

    expect(stackScreenProps.options.headerLeft).toBeUndefined();
    consoleErrorSpy.mockRestore();
  });
});
