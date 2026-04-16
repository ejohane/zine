import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { renderRoute } from './test/render-router';

vi.mock('./lib/oauth', () => ({
  completeOAuthFlow: vi.fn(),
}));
vi.mock('./lib/trpc', () => import('./test/mocks/trpc'));

import { OAuthCallbackPage } from './oauth-callback-page';
import { completeOAuthFlow } from './lib/oauth';
import { resetTrpcMocks, setAuthAvailability, setSessionState } from './test/mocks/trpc';

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    resetTrpcMocks();
    vi.mocked(completeOAuthFlow).mockReset();
  });

  test('shows a configuration error when clerk auth is unavailable', async () => {
    setAuthAvailability({ mode: 'development-bypass', isEnabled: true });

    renderRoute(<OAuthCallbackPage />, {
      route: '/oauth/callback?code=abc&state=YOUTUBE:1',
      path: '/oauth/callback',
    });

    expect(await screen.findByText('Connection failed')).toBeVisible();
    expect(
      screen.getByText('OAuth connections are only available when Clerk auth is configured.')
    ).toBeVisible();
  });

  test('navigates to settings once the oauth flow completes', async () => {
    setAuthAvailability({ mode: 'clerk', isEnabled: true });
    setSessionState({ getToken: async () => 'token-123' });
    vi.mocked(completeOAuthFlow).mockResolvedValue('YOUTUBE');

    renderRoute(<OAuthCallbackPage />, {
      route: '/oauth/callback?code=abc&state=YOUTUBE:1',
      path: '/oauth/callback',
      redirects: [{ path: '/settings', element: <div>Settings destination</div> }],
    });

    expect(await screen.findByText('Settings destination')).toBeVisible();
    expect(completeOAuthFlow).toHaveBeenCalled();
  });

  test('renders oauth callback failures inline', async () => {
    setAuthAvailability({ mode: 'clerk', isEnabled: true });
    vi.mocked(completeOAuthFlow).mockRejectedValue(new Error('OAuth handshake failed'));

    renderRoute(<OAuthCallbackPage />, {
      route: '/oauth/callback?code=abc&state=YOUTUBE:1',
      path: '/oauth/callback',
      redirects: [{ path: '/settings', element: <div>Settings destination</div> }],
    });

    expect(await screen.findByText('OAuth handshake failed')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to settings' })).toHaveAttribute(
      'href',
      '/settings'
    );
  });
});
