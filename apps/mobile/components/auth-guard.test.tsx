import React from 'react';
import { act, create } from 'react-test-renderer';

import { AuthGuard } from './auth-guard';
import { captureAuthDiagnostic } from '@/lib/auth-diagnostics';

const mockUseAuthAvailability = jest.fn(() => ({ isEnabled: true }));
const mockAuthLoggerWarn = jest.fn();

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
  }),
}));

jest.mock('expo-router', () => ({
  Redirect: (props: Record<string, unknown>) => React.createElement('redirect', props),
}));

jest.mock('react-native', () => ({
  View: ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('view', props, children),
  ActivityIndicator: (props: Record<string, unknown>) =>
    React.createElement('activity-indicator', props),
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
}));

jest.mock('@/hooks/use-app-theme', () => ({
  useAppTheme: () => ({
    colors: {
      accent: 'blue',
      surfaceCanvas: 'black',
    },
  }),
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuthAvailability: () => mockUseAuthAvailability(),
}));

jest.mock('@/lib/logger', () => ({
  authLogger: {
    warn: (...args: unknown[]) => mockAuthLoggerWarn(...args),
  },
}));

jest.mock('@/lib/auth-diagnostics', () => ({
  captureAuthDiagnostic: jest.fn(),
}));

describe('AuthGuard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-25T10:00:00.000Z'));
    jest.clearAllMocks();
    mockUseAuthAvailability.mockReturnValue({ isEnabled: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('redirects immediately when the app starts signed out', async () => {
    let renderer: ReturnType<typeof create> | null = null;

    await act(async () => {
      renderer = create(
        <AuthGuard authStateOverride={{ isLoaded: true, isSignedIn: false }}>
          <span>protected</span>
        </AuthGuard>
      );
    });

    if (!renderer) {
      throw new Error('Renderer was not created');
    }

    expect(renderer.root.findByType('redirect').props.href).toBe('/(auth)/sign-in');
  });

  it('holds a sudden signed-out state after observing a signed-in session', async () => {
    let renderer: ReturnType<typeof create> | null = null;

    await act(async () => {
      renderer = create(
        <AuthGuard authStateOverride={{ isLoaded: true, isSignedIn: true }}>
          <span>protected</span>
        </AuthGuard>
      );
    });

    if (!renderer) {
      throw new Error('Renderer was not created');
    }

    await act(async () => {
      renderer.update(
        <AuthGuard authStateOverride={{ isLoaded: true, isSignedIn: false }}>
          <span>protected</span>
        </AuthGuard>
      );
    });

    expect(renderer.root.findAllByType('redirect')).toHaveLength(0);
    expect(renderer.root.findByType('activity-indicator')).toBeTruthy();
    expect(captureAuthDiagnostic).toHaveBeenCalledWith('guard.signed_out_grace_started', {
      graceMs: 15000,
    });
  });

  it('redirects if signed-out state persists beyond the grace window', async () => {
    let renderer: ReturnType<typeof create> | null = null;

    await act(async () => {
      renderer = create(
        <AuthGuard authStateOverride={{ isLoaded: true, isSignedIn: true }}>
          <span>protected</span>
        </AuthGuard>
      );
    });

    if (!renderer) {
      throw new Error('Renderer was not created');
    }

    await act(async () => {
      renderer.update(
        <AuthGuard authStateOverride={{ isLoaded: true, isSignedIn: false }}>
          <span>protected</span>
        </AuthGuard>
      );
    });

    await act(async () => {
      jest.advanceTimersByTime(15001);
    });

    expect(renderer.root.findByType('redirect').props.href).toBe('/(auth)/sign-in');
    expect(captureAuthDiagnostic).toHaveBeenCalledWith(
      'guard.redirect_after_signed_out_grace',
      expect.objectContaining({
        signedOutDurationMs: expect.any(Number),
      })
    );
  });

  it('renders protected content again if Clerk recovers before the grace expires', async () => {
    let renderer: ReturnType<typeof create> | null = null;

    await act(async () => {
      renderer = create(
        <AuthGuard authStateOverride={{ isLoaded: true, isSignedIn: true }}>
          <span>protected</span>
        </AuthGuard>
      );
    });

    if (!renderer) {
      throw new Error('Renderer was not created');
    }

    await act(async () => {
      renderer.update(
        <AuthGuard authStateOverride={{ isLoaded: true, isSignedIn: false }}>
          <span>protected</span>
        </AuthGuard>
      );
    });

    await act(async () => {
      renderer.update(
        <AuthGuard authStateOverride={{ isLoaded: true, isSignedIn: true }}>
          <span>protected</span>
        </AuthGuard>
      );
    });

    expect(renderer.root.findByType('span').children).toEqual(['protected']);
    expect(renderer.root.findAllByType('redirect')).toHaveLength(0);
    expect(captureAuthDiagnostic).toHaveBeenCalledWith(
      'guard.signed_in_recovered',
      expect.objectContaining({
        graceUntil: expect.any(Number),
      }),
      'warning'
    );
  });
});
