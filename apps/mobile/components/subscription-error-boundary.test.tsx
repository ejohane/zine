import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { SubscriptionErrorBoundary } from './subscription-error-boundary';

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
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

jest.mock('@/components/primitives', () => ({
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) =>
    React.createElement('button', { onClick: onPress, onPress }, label),
  Surface: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('span', null, children),
}));

jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: {
      textSecondary: '#fff',
      textPrimary: '#fff',
      textSubheader: '#aaa',
      statusError: '#f00',
      statusErrorSurface: '#111',
      borderDefault: '#222',
      borderSubtle: '#222',
      surfaceRaised: '#111',
      surfaceCanvas: '#000',
      surfaceSubtle: '#111',
      surfaceElevated: '#111',
      accent: '#fff',
      accentMuted: '#111',
      accentForeground: '#000',
      overlayForeground: '#fff',
      overlayForegroundMuted: '#aaa',
      overlayForegroundSubtle: '#888',
      overlaySoft: '#111',
      overlayStrong: '#111',
      overlayHeavy: '#111',
      overlayScrim: '#111',
      statusSuccess: '#0f0',
      statusWarning: '#ff0',
      statusWarningForeground: '#000',
      statusInfo: '#0ff',
      statusSuccessSurface: '#111',
      statusWarningSurface: '#111',
      statusInfoSurface: '#111',
      textInverse: '#000',
    },
  }),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

const Crash: React.FC = () => {
  throw new Error('401 Unauthorized: token expired');
};

describe('SubscriptionErrorBoundary reconnect routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['YOUTUBE', '/subscriptions/youtube'],
    ['SPOTIFY', '/subscriptions/spotify'],
    ['GMAIL', '/subscriptions/gmail'],
  ] as const)('routes %s reconnects through the source screen', (provider, expectedRoute) => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(
        <SubscriptionErrorBoundary provider={provider}>
          <Crash />
        </SubscriptionErrorBoundary>
      );
    });

    const reconnectButton = renderer!.root.find(
      (node: TestNode) =>
        node.type === 'button' && getTextContent(node).includes('Reconnect Integration')
    );

    act(() => {
      reconnectButton.props.onPress();
    });

    expect(mockPush).toHaveBeenCalledWith(expectedRoute);
    consoleErrorSpy.mockRestore();
  });
});
