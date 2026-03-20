import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockBack = jest.fn();
const mockUsePreview = jest.fn();
const mockUseSaveBookmark = jest.fn();
const mockUseSafeAreaInsets = jest.fn();
const keyboardListeners = new Map<
  string,
  (event: { endCoordinates: { screenY: number; height: number }; duration?: number }) => void
>();

type Renderer = ReturnType<typeof TestRenderer.create>;

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (accumulator, value) => ({ ...accumulator, ...flattenStyle(value) }),
      {}
    );
  }

  return (style ?? {}) as Record<string, unknown>;
}

jest.mock('expo-router', () => ({
  Stack: {
    Screen: () => null,
  },
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    back: mockBack,
  }),
}));

jest.mock('heroui-native', () => ({
  useToast: () => ({
    toast: {},
  }),
}));

jest.mock('react-native', () => ({
  __esModule: true,
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
  Dimensions: {
    get: () => ({
      width: 393,
      height: 852,
      scale: 3,
      fontScale: 1,
    }),
  },
  View: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('view', props, children),
  Text: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('text', props, children),
  TextInput: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('input', props, children),
  Pressable: ({
    children,
    onPress,
    style,
    ...props
  }: {
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    onPress?: () => void;
    style?: unknown;
  }) =>
    React.createElement(
      'button',
      {
        ...props,
        onPress,
        style: typeof style === 'function' ? style({ pressed: false }) : style,
      },
      typeof children === 'function' ? children({ pressed: false }) : children
    ),
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
    hairlineWidth: 1,
  },
  ActivityIndicator: (props: Record<string, unknown>) =>
    React.createElement('activity-indicator', props),
  Keyboard: {
    dismiss: jest.fn(),
    addListener: jest.fn(
      (
        eventName: string,
        listener: (event: { endCoordinates: { screenY: number; height: number } }) => void
      ) => {
        keyboardListeners.set(eventName, listener);

        return {
          remove: () => keyboardListeners.delete(eventName),
        };
      }
    ),
    scheduleLayoutAnimation: jest.fn(),
  },
  ScrollView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('scroll-view', props, children),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('safe-area-view', props, children),
  useSafeAreaInsets: () => mockUseSafeAreaInsets(),
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('animated-view', props, children),
    Text: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement('animated-text', props, children),
  },
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('svg', props, children),
  Path: (props: Record<string, unknown>) => React.createElement('path', props),
}));

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => 'dark',
}));

jest.mock('@/hooks/use-bookmarks', () => ({
  usePreview: (...args: unknown[]) => mockUsePreview(...args),
  useSaveBookmark: () => mockUseSaveBookmark(),
  isValidUrl: (value: string) => value.startsWith('http://') || value.startsWith('https://'),
}));

jest.mock('@/components/link-preview-card', () => ({
  LinkPreviewCard: () => React.createElement('link-preview-card'),
}));

jest.mock('@/lib/toast-utils', () => ({
  showError: jest.fn(),
  showSuccess: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

import { Spacing } from '@/constants/theme';
import AddLinkScreen from '@/app/add-link';

describe('AddLinkScreen keyboard layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    keyboardListeners.clear();
    mockUseSafeAreaInsets.mockReturnValue({
      top: 0,
      right: 0,
      bottom: 34,
      left: 0,
    });
    mockUsePreview.mockReturnValue({
      data: null,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseSaveBookmark.mockReturnValue({
      saveFromPreviewAsync: jest.fn(),
      isPending: false,
      reset: jest.fn(),
    });
  });

  it('enables automatic keyboard insets on the scroll view for iOS', () => {
    let renderer: Renderer;

    act(() => {
      renderer = TestRenderer.create(<AddLinkScreen />);
    });

    const scrollView = renderer!.root.findByType('scroll-view');

    expect(scrollView.props.automaticallyAdjustKeyboardInsets).toBe(true);
  });

  it('keeps footer spacing aligned with the bottom safe area inset when input is not focused', () => {
    let renderer: Renderer;

    act(() => {
      renderer = TestRenderer.create(<AddLinkScreen />);
    });

    const footer = renderer!.root.findByProps({ testID: 'add-link-footer' });
    const style = flattenStyle(footer.props.style);

    expect(style.paddingTop).toBe(Spacing.lg);
    expect(style.bottom).toBe(0);
    expect(style.paddingBottom).toBe(Spacing.xl + 34);
  });

  it('snaps the footer to the top of the keyboard on iOS', () => {
    let renderer: Renderer;

    act(() => {
      renderer = TestRenderer.create(<AddLinkScreen />);
    });

    act(() => {
      keyboardListeners.get('keyboardWillChangeFrame')?.({
        endCoordinates: {
          screenY: 540,
          height: 312,
        },
      });
    });

    const footer = renderer!.root.findByProps({ testID: 'add-link-footer' });
    const style = flattenStyle(footer.props.style);

    expect(style.bottom).toBe(312);
    expect(style.paddingBottom).toBe(Spacing.xl);
  });

  it('moves the empty state up when the keyboard is visible on iOS', () => {
    let renderer: Renderer;

    act(() => {
      renderer = TestRenderer.create(<AddLinkScreen />);
    });

    act(() => {
      keyboardListeners.get('keyboardWillChangeFrame')?.({
        endCoordinates: {
          screenY: 540,
          height: 312,
        },
      });
    });

    const emptyState = renderer!.root.findByProps({ testID: 'add-link-empty-state' });
    const style = flattenStyle(emptyState.props.style);

    expect(style.flex).toBe(0);
    expect(style.justifyContent).toBe('flex-start');
    expect(style.paddingTop).toBe(Spacing.lg);
  });
});
