import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { renderRoute } from './test/render-router';

vi.mock('./lib/trpc', () => import('./test/mocks/trpc'));

import { SettingsPage } from './settings-page';
import { hookSpies, resetTrpcMocks, setAuthAvailability, setSessionState } from './test/mocks/trpc';

describe('SettingsPage', () => {
  beforeEach(() => {
    resetTrpcMocks();
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    hookSpies.connectionsListUseQuery.mockImplementation(() => ({
      data: {
        YOUTUBE: { provider: 'YOUTUBE', status: 'ACTIVE', connectedAt: Date.now() },
        SPOTIFY: null,
        GMAIL: { provider: 'GMAIL', status: 'ACTIVE', connectedAt: Date.now() },
      },
      isLoading: false,
      error: null,
    }));
    hookSpies.subscriptionsListUseQuery.mockImplementation(() => ({
      data: {
        items: [
          { id: 'yt-1', provider: 'YOUTUBE' },
          { id: 'sp-1', provider: 'SPOTIFY' },
        ],
        nextCursor: null,
        hasMore: false,
      },
      isLoading: false,
      error: null,
    }));
    hookSpies.newslettersStatsUseQuery.mockImplementation(() => ({
      data: {
        total: 8,
        active: 6,
        hidden: 1,
        unsubscribed: 1,
        lastSyncAt: Date.now(),
        lastSyncStatus: 'SUCCESS',
        lastSyncError: null,
      },
      isLoading: false,
      error: null,
    }));
    hookSpies.rssStatsUseQuery.mockImplementation(() => ({
      data: {
        total: 3,
        active: 2,
        paused: 1,
        unsubscribed: 0,
        error: 0,
        lastSuccessAt: Date.now(),
      },
      isLoading: false,
      error: null,
    }));
  });

  test('renders the app shell with a settings breadcrumb and a single card', () => {
    const { container } = renderRoute(<SettingsPage />, {
      route: '/settings',
      path: '/settings',
    });

    expect(screen.getByRole('link', { name: 'Library' })).toHaveAttribute(
      'href',
      '/library/bookmarks'
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveClass(
      'new-page-sidebar__rail-btn--active'
    );
    expect(screen.getByLabelText('Current page location')).toHaveTextContent('Library');
    expect(screen.getByLabelText('Current page location')).toHaveTextContent('Settings');
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(container.querySelectorAll('.new-page-column-card')).toHaveLength(1);
    expect(container.querySelector('.new-page-column-card--full')).not.toBeNull();
    expect(container.querySelector('.new-page-inset__content')).toBeNull();
  });

  describe('two-column layout', () => {
    test('has a settings nav on the left and a content area on the right', () => {
      const { container } = renderRoute(<SettingsPage />, {
        route: '/settings',
        path: '/settings',
      });

      const nav = screen.getByRole('navigation', { name: 'Settings sections' });
      expect(nav).toBeVisible();
      expect(container.querySelector('.settings-page__layout')).not.toBeNull();
      expect(container.querySelector('.settings-page__nav')).not.toBeNull();
      expect(container.querySelector('.settings-page__content')).not.toBeNull();
    });

    test('nav contains Subscriptions item that is active by default', () => {
      renderRoute(<SettingsPage />, {
        route: '/settings',
        path: '/settings',
      });

      const nav = screen.getByRole('navigation', { name: 'Settings sections' });
      const subscriptionsBtn = within(nav).getByRole('button', { name: 'Subscriptions' });
      expect(subscriptionsBtn).toBeVisible();
      expect(subscriptionsBtn).toHaveAttribute('aria-current', 'true');
    });

    test('shows subscriptions content by default', () => {
      renderRoute(<SettingsPage />, {
        route: '/settings',
        path: '/settings',
      });

      expect(screen.getByRole('heading', { name: 'Sources' })).toBeVisible();
      expect(screen.getByText(/launch the guided setup/i)).toBeVisible();
      expect(screen.getByRole('link', { name: /launch guided setup/i })).toHaveAttribute(
        'href',
        '/welcome?origin=settings'
      );
      expect(screen.getByText('YouTube')).toBeVisible();
      expect(screen.getByText('Spotify')).toBeVisible();
      expect(screen.getByText('Gmail')).toBeVisible();
      expect(screen.getByText('RSS')).toBeVisible();
    });

    test('nav contains a sign out button in clerk mode', () => {
      setAuthAvailability({ mode: 'clerk', isEnabled: true });

      renderRoute(<SettingsPage />, {
        route: '/settings',
        path: '/settings',
      });

      const nav = screen.getByRole('navigation', { name: 'Settings sections' });
      const signOutBtn = within(nav).getByRole('button', { name: 'Sign out' });
      expect(signOutBtn).toBeVisible();
    });

    test('hides sign out button in development-bypass mode', () => {
      setAuthAvailability({ mode: 'development-bypass', isEnabled: true });

      renderRoute(<SettingsPage />, {
        route: '/settings',
        path: '/settings',
      });

      const nav = screen.getByRole('navigation', { name: 'Settings sections' });
      expect(within(nav).queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    });

    test('sign out button triggers signOut in clerk mode', async () => {
      const user = userEvent.setup();
      const signOut = vi.fn(async () => {});

      setAuthAvailability({ mode: 'clerk', isEnabled: true });
      setSessionState({ signOut });

      renderRoute(<SettingsPage />, {
        route: '/settings',
        path: '/settings',
      });

      const nav = screen.getByRole('navigation', { name: 'Settings sections' });
      await user.click(within(nav).getByRole('button', { name: 'Sign out' }));

      expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/sign-in' });
    });
  });
});
