import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import SubscriptionsScreen from '@/app/subscriptions/index';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn();
const mockStackScreen = jest.fn();
let consoleErrorSpy: jest.SpyInstance;

type Renderer = ReturnType<typeof TestRenderer.create>;

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
  }),
}));

jest.mock('@react-navigation/elements', () => ({
  HeaderBackButton: (props: Record<string, unknown>) =>
    React.createElement('header-back-button', props),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => React.createElement('ionicons', props),
}));

jest.mock('react-native', () => ({
  __esModule: true,
  Platform: {
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
  View: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  ScrollView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

jest.mock('@/components/list-states', () => ({
  LoadingState: () => React.createElement('div', null, 'Loading'),
}));

jest.mock('@/components/primitives', () => ({
  IconButton: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
  }) => React.createElement('button', { onClick: onPress, onPress, accessibilityLabel }, children),
  Surface: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('span', null, children),
}));

jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: {
      backgroundSecondary: '#222222',
      text: '#ffffff',
    },
  }),
}));

jest.mock('@/components/subscriptions', () => ({
  SourceListRow: ({
    source,
    summary,
    onPress,
  }: {
    source: string;
    summary: string;
    onPress: () => void;
  }) => React.createElement('button', { onClick: onPress, onPress }, `${source}:${summary}`),
}));

jest.mock('@/hooks/use-connections', () => ({
  useConnections: () => ({
    data: [
      { provider: 'YOUTUBE', status: 'ACTIVE' },
      { provider: 'SPOTIFY', status: 'ACTIVE' },
      { provider: 'GMAIL', status: 'ACTIVE' },
    ],
    isLoading: false,
  }),
}));

jest.mock('@/hooks/use-subscriptions', () => ({
  useSubscriptions: () => ({
    subscriptions: [{ provider: 'YOUTUBE' }, { provider: 'SPOTIFY' }, { provider: 'SPOTIFY' }],
    isLoading: false,
  }),
}));

jest.mock('@/lib/trpc', () => ({
  trpc: {
    subscriptions: {
      newsletters: {
        stats: {
          useQuery: () => ({
            data: { active: 4 },
            isLoading: false,
          }),
        },
      },
      rss: {
        stats: {
          useQuery: () => ({
            data: { active: 2 },
            isLoading: false,
          }),
        },
      },
    },
  },
}));

describe('SubscriptionsScreen header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('adds a header back button when a parent navigator can go back', () => {
    mockCanGoBack.mockReturnValue(true);

    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<SubscriptionsScreen />);
    });

    expect(renderer).toBeDefined();

    const stackScreenProps = mockStackScreen.mock.calls.at(-1)?.[0] as {
      options: {
        headerLeft?: (props: Record<string, unknown>) => React.ReactElement;
      };
    };

    expect(stackScreenProps.options.headerLeft).toBeDefined();

    const headerLeft = stackScreenProps.options.headerLeft!;
    const backButtonWrapper = headerLeft({ tintColor: '#111111' }) as React.ReactElement<{
      children: React.ReactElement<{
        onPress: () => void;
        accessibilityLabel?: string;
      }>;
    }>;
    const backButton = backButtonWrapper.props.children;

    expect(backButton.props.accessibilityLabel).toBe('Go back');

    act(() => {
      backButton.props.onPress();
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('leaves the header left slot empty when there is no back target', () => {
    mockCanGoBack.mockReturnValue(false);

    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(<SubscriptionsScreen />);
    });

    expect(renderer).toBeDefined();

    const stackScreenProps = mockStackScreen.mock.calls.at(-1)?.[0] as {
      options: {
        headerLeft?: unknown;
      };
    };

    expect(stackScreenProps.options.headerLeft).toBeUndefined();
  });
});
