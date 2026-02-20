/**
 * Regression tests for onboarding select-channels navigation behavior.
 *
 * Ensures invalid provider redirects happen from an effect (not during render),
 * preventing React's "Cannot update a component while rendering..." warning.
 */

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import SelectChannelsScreen from '@/app/onboarding/select-channels';

const mockUseLocalSearchParams = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
  useRouter: () => ({
    replace: mockReplace,
  }),
  Stack: {
    Screen: () => null,
  },
}));

jest.mock('heroui-native', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children ?? null,
}));

jest.mock('@/hooks/use-subscriptions', () => ({
  useSubscriptions: () => ({
    subscribe: jest.fn(),
  }),
}));

const mockDiscoverAvailableUseQuery = jest.fn();

jest.mock('@/lib/trpc', () => ({
  trpc: {
    subscriptions: {
      discover: {
        available: {
          useQuery: (...args: unknown[]) => mockDiscoverAvailableUseQuery(...args),
        },
      },
    },
  },
}));

jest.mock('@/components/subscriptions', () => ({
  ChannelSelectionList: () => null,
  ChannelSelectionActionBar: () => null,
}));

describe('SelectChannelsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDiscoverAvailableUseQuery.mockReturnValue({
      data: { items: [] },
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('redirects invalid provider without render-time navigation warning', () => {
    mockUseLocalSearchParams.mockReturnValue({ provider: 'invalid-provider' });

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    act(() => {
      TestRenderer.create(React.createElement(SelectChannelsScreen));
    });

    expect(mockReplace).toHaveBeenCalledWith('/onboarding/connect');

    const renderWarnings = consoleErrorSpy.mock.calls.filter(([firstArg]) => {
      return (
        typeof firstArg === 'string' &&
        firstArg.includes('Cannot update a component') &&
        firstArg.includes('while rendering a different component')
      );
    });

    expect(renderWarnings).toHaveLength(0);
    consoleErrorSpy.mockRestore();
  });
});
