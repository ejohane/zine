import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { SourceHero, SourceListRow } from './source-ui';

type Renderer = ReturnType<typeof TestRenderer.create>;

jest.mock('react-native', () => ({
  __esModule: true,
  Platform: {
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
  View: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('div', props, children),
  Image: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('img', null, children),
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: {
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    onPress?: () => void;
    accessibilityLabel?: string;
  }) =>
    React.createElement(
      'button',
      { onClick: onPress, onPress, accessibilityLabel },
      typeof children === 'function' ? children({ pressed: false }) : children
    ),
  TextInput: ({
    value,
    onChangeText,
  }: {
    value?: string;
    onChangeText?: (value: string) => void;
  }) =>
    React.createElement('input', {
      value,
      onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
    }),
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

jest.mock('@expo/vector-icons', () => {
  const Icon = (props: Record<string, unknown>) => React.createElement('svg', props);
  return { Ionicons: Icon, FontAwesome5: Icon };
});

jest.mock('lucide-react-native', () => {
  const Icon = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('svg', null, children);

  return {
    FileText: Icon,
    Headphones: Icon,
    Play: Icon,
    Rss: Icon,
  };
});

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'Light',
    Medium: 'Medium',
  },
  impactAsync: jest.fn(),
}));

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const Swipeable = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);

  return {
    __esModule: true,
    default: Swipeable,
  };
});

jest.mock('react-native-reanimated', () => {
  const AnimatedView = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);

  return {
    __esModule: true,
    default: {
      View: AnimatedView,
    },
    Extrapolation: {
      CLAMP: 'clamp',
    },
    interpolate: jest.fn(() => 0),
    runOnJS: (fn: () => void) => fn,
    useAnimatedReaction: jest.fn(),
    useAnimatedStyle: jest.fn(() => ({})),
    useSharedValue: (value: unknown) => ({ value }),
  };
});

jest.mock('@/components/primitives', () => ({
  Badge: ({ label }: { label: string }) => React.createElement('span', null, label),
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) =>
    React.createElement('button', { onClick: onPress, onPress }, label),
  Surface: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  Text: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('span', null, children),
}));

jest.mock('@/components/icons', () => ({
  ChevronRightIcon: () => React.createElement('svg'),
  SearchIcon: () => React.createElement('svg'),
}));

jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: {
      surfaceRaised: '#111111',
      textPrimary: '#ffffff',
      textTertiary: '#777777',
      statusInfo: '#33aaff',
      statusWarning: '#ffaa33',
    },
    motion: {
      opacity: {
        pressed: 0.8,
      },
    },
  }),
}));

describe('SourceHero', () => {
  it('renders without throwing for provider sources', () => {
    expect(() => {
      act(() => {
        TestRenderer.create(
          <SourceHero source="YOUTUBE" summary="Integration connected · 12 subscriptions" />
        );
      });
    }).not.toThrow();
  });
});

describe('SourceListRow', () => {
  it('marks provider rows that need attention', () => {
    let renderer: Renderer;
    act(() => {
      renderer = TestRenderer.create(
        <SourceListRow
          source="SPOTIFY"
          summary="Integration needs attention"
          needsAttention
          attentionTestID="spotify-attention-dot"
          onPress={() => {}}
        />
      );
    });

    expect(() => renderer!.root.findByProps({ testID: 'spotify-attention-dot' })).not.toThrow();
    expect(renderer!.root.findByType('button').props.accessibilityLabel).toContain(
      'needs attention'
    );
  });
});
