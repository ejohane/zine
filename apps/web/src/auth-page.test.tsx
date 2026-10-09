import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { renderRoute } from './test/render-router';

vi.mock('@clerk/clerk-react', () => import('./test/mocks/clerk'));
vi.mock('./lib/trpc', () => import('./test/mocks/trpc'));

import { storeIntent, intentPath } from './lib/publication-continuation';
import { AuthPage } from './auth-page';
import { resetTrpcMocks, setAuthAvailability } from './test/mocks/trpc';

describe('AuthPage', () => {
  beforeEach(() => {
    resetTrpcMocks();
    sessionStorage.clear();
  });

  test('shows configuration guidance when auth is unavailable', () => {
    setAuthAvailability({ isEnabled: false, mode: 'disabled' });

    renderRoute(<AuthPage mode="sign-in" />);

    expect(screen.getByText('Configuration required')).toBeInTheDocument();
    expect(
      screen.getByText('Set `VITE_CLERK_PUBLISHABLE_KEY` to use the web auth flow.')
    ).toBeVisible();
  });

  test('redirects development bypass users to welcome', async () => {
    setAuthAvailability({ isEnabled: true, mode: 'development-bypass' });

    renderRoute(<AuthPage mode="sign-in" />, {
      route: '/sign-in',
      path: '/sign-in',
      redirects: [{ path: '/welcome', element: <div>Welcome destination</div> }],
    });

    expect(await screen.findByText('Welcome destination')).toBeVisible();
  });

  test('renders the sign-in clerk widget with the expected routes', () => {
    setAuthAvailability({ isEnabled: true, mode: 'clerk' });

    renderRoute(<AuthPage mode="sign-in" />);

    expect(screen.getByTestId('clerk-sign-in')).toHaveTextContent(
      'SignIn /sign-in path /welcome /sign-up'
    );
  });

  test('renders the sign-up clerk widget with the expected routes', () => {
    setAuthAvailability({ isEnabled: true, mode: 'clerk' });

    renderRoute(<AuthPage mode="sign-up" />);

    expect(screen.getByTestId('clerk-sign-up')).toHaveTextContent(
      'SignUp /sign-up path /welcome /sign-in'
    );
  });
  test('retains explicit publication intent across sign-in and sign-up', () => {
    setAuthAvailability({ isEnabled: true, mode: 'clerk' });
    const intent = storeIntent({
      action: 'subscribe',
      publicationId: '01J00000000000000000000001',
    });
    renderRoute(<AuthPage mode="sign-in" />, {
      route: `/sign-in?continue=${intent.key}`,
      path: '/sign-in',
    });
    expect(screen.getByTestId('clerk-sign-in')).toHaveTextContent(intentPath(intent));
    expect(screen.getByTestId('clerk-sign-in')).toHaveTextContent(
      `/sign-up?continue=${intent.key}`
    );
  });
});
