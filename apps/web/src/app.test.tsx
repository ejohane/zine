import type { PropsWithChildren } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('./auth-page', () => ({
  AuthPage: ({ mode }: { mode: 'sign-in' | 'sign-up' }) => <div>Auth page {mode}</div>,
}));

vi.mock('./bookmarks-page', () => ({
  BookmarksPage: () => <div>Bookmarks page</div>,
}));
vi.mock('./mobile-parity-pages', () => ({
  HomePage: () => <div>Home page</div>,
  InboxPage: () => <div>Inbox page</div>,
  SearchPage: () => <div>Search page</div>,
  LibraryPage: ({ object }: { object: string }) => <div>Library {object} page</div>,
}));

vi.mock('./oauth-callback-page', () => ({
  OAuthCallbackPage: () => <div>OAuth callback page</div>,
}));

vi.mock('./settings-page', () => ({
  SettingsPage: () => <div>Settings page</div>,
}));
vi.mock('./welcome-page', () => ({
  WelcomePage: () => <div>Welcome page</div>,
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

  test('redirects root and unknown routes to home', async () => {
    renderAppAt('/');

    expect(await screen.findByText('Home page')).toBeVisible();
    await waitFor(() => {
      expect(window.location.pathname).toBe('/home');
    });

    cleanup();

    renderAppAt('/definitely-not-here');
    expect(await screen.findByText('Home page')).toBeVisible();
    await waitFor(() => {
      expect(window.location.pathname).toBe('/home');
    });
  });

  test('redirects legacy bookmark URLs to canonical library and item routes', async () => {
    renderAppAt('/bookmarks?contentType=video');

    expect(await screen.findByText('Bookmarks page')).toBeVisible();
    await waitFor(() => {
      expect(window.location.pathname).toBe('/library/bookmarks');
      expect(window.location.search).toBe('?contentType=video');
    });

    cleanup();

    renderAppAt('/bookmarks/bookmark-123');

    expect(await screen.findByText('Bookmarks page')).toBeVisible();
    await waitFor(() => {
      expect(window.location.pathname).toBe('/item/bookmark-123');
    });
  });

  test('renders protected app routes', async () => {
    renderAppAt('/home');
    expect(await screen.findByText('Home page')).toBeVisible();

    cleanup();

    renderAppAt('/inbox');
    expect(await screen.findByText('Inbox page')).toBeVisible();

    cleanup();

    renderAppAt('/search');
    expect(await screen.findByText('Search page')).toBeVisible();

    cleanup();

    renderAppAt('/library/people');
    expect(await screen.findByText('Library people page')).toBeVisible();

    cleanup();

    renderAppAt('/oauth/callback');
    expect(await screen.findByText('OAuth callback page')).toBeVisible();

    cleanup();

    renderAppAt('/settings');
    expect(await screen.findByText('Settings page')).toBeVisible();

    cleanup();

    renderAppAt('/welcome');
    expect(await screen.findByText('Welcome page')).toBeVisible();
  });
});
