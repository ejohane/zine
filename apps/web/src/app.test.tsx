import type { PropsWithChildren } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('./auth-page', () => ({
  AuthPage: ({ mode }: { mode: 'sign-in' | 'sign-up' }) => <div>Auth page {mode}</div>,
}));

vi.mock('./bookmarks-page', () => ({
  BookmarksPage: () => <div>Bookmarks page</div>,
}));

vi.mock('./oauth-callback-page', () => ({
  OAuthCallbackPage: () => <div>OAuth callback page</div>,
}));

vi.mock('./settings-page', () => ({
  SettingsPage: () => <div>Settings page</div>,
}));

vi.mock('./protected-route', () => ({
  ProtectedRoute: ({ children }: PropsWithChildren) => <>{children}</>,
}));

import App from './app';

function renderAppAt(pathname: string) {
  window.history.pushState({}, '', pathname);
  return render(<App />);
}

describe('App routes', () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, '', '/');
  });

  test('renders sign-in and sign-up auth routes', () => {
    renderAppAt('/sign-in');
    expect(screen.getByText('Auth page sign-in')).toBeVisible();

    cleanup();

    renderAppAt('/sign-up');
    expect(screen.getByText('Auth page sign-up')).toBeVisible();
  });

  test('redirects root and unknown routes to bookmarks', async () => {
    renderAppAt('/');

    expect(await screen.findByText('Bookmarks page')).toBeVisible();
    await waitFor(() => {
      expect(window.location.pathname).toBe('/bookmarks');
    });

    cleanup();

    renderAppAt('/definitely-not-here');
    expect(await screen.findByText('Bookmarks page')).toBeVisible();
    await waitFor(() => {
      expect(window.location.pathname).toBe('/bookmarks');
    });
  });

  test('redirects legacy item URLs to bookmark detail routes', async () => {
    renderAppAt('/item/bookmark-123');

    expect(await screen.findByText('Bookmarks page')).toBeVisible();
    await waitFor(() => {
      expect(window.location.pathname).toBe('/bookmarks/bookmark-123');
    });
  });

  test('renders protected callback and settings routes', async () => {
    renderAppAt('/oauth/callback');
    expect(await screen.findByText('OAuth callback page')).toBeVisible();

    cleanup();

    renderAppAt('/settings');
    expect(await screen.findByText('Settings page')).toBeVisible();
  });
});
