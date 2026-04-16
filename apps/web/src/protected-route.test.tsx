import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { renderRoute } from './test/render-router';

vi.mock('./lib/trpc', () => import('./test/mocks/trpc'));

import { ProtectedRoute } from './protected-route';
import { resetTrpcMocks, setAuthAvailability, setSessionState } from './test/mocks/trpc';

describe('ProtectedRoute', () => {
  beforeEach(() => {
    resetTrpcMocks();
  });

  test('shows configuration guidance when auth is disabled', () => {
    setAuthAvailability({ isEnabled: false, mode: 'disabled' });

    renderRoute(<ProtectedRoute>private</ProtectedRoute>);

    expect(screen.getByText('Configuration required')).toBeInTheDocument();
    expect(screen.getByText('Set `VITE_CLERK_PUBLISHABLE_KEY` to use the web app.')).toBeVisible();
  });

  test('shows a loading state while the session is resolving', () => {
    setAuthAvailability({ isEnabled: true, mode: 'clerk' });
    setSessionState({ isLoaded: false, isSignedIn: false });

    renderRoute(<ProtectedRoute>private</ProtectedRoute>);

    expect(screen.getByText('Authenticating')).toBeInTheDocument();
    expect(screen.getByText('Checking your session.')).toBeVisible();
  });

  test('redirects signed-out users to sign-in', async () => {
    setAuthAvailability({ isEnabled: true, mode: 'clerk' });
    setSessionState({ isLoaded: true, isSignedIn: false });

    renderRoute(<ProtectedRoute>private</ProtectedRoute>, {
      route: '/bookmarks',
      path: '/bookmarks',
      redirects: [{ path: '/sign-in', element: <div>Sign in destination</div> }],
    });

    expect(await screen.findByText('Sign in destination')).toBeVisible();
  });

  test('renders children for authenticated users', () => {
    setAuthAvailability({ isEnabled: true, mode: 'clerk' });
    setSessionState({ isLoaded: true, isSignedIn: true });

    renderRoute(<ProtectedRoute>private</ProtectedRoute>);

    expect(screen.getByText('private')).toBeVisible();
  });
});
