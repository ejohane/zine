import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { renderRoute } from './test/render-router';

vi.mock('./lib/trpc', () => import('./test/mocks/trpc'));

import { SettingsPage } from './settings-page';
import { resetTrpcMocks, setAuthAvailability, setSessionState } from './test/mocks/trpc';

describe('SettingsPage', () => {
  beforeEach(() => {
    resetTrpcMocks();
  });

  test('always links back to bookmarks', () => {
    renderRoute(<SettingsPage />);

    expect(screen.getByRole('link', { name: 'Back to bookmarks' })).toHaveAttribute(
      'href',
      '/bookmarks'
    );
  });

  test('shows sign out controls only for clerk mode', () => {
    setAuthAvailability({ mode: 'development-bypass', isEnabled: true });

    renderRoute(<SettingsPage />);

    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  test('signs out through the app session in clerk mode', async () => {
    const user = userEvent.setup();
    const signOut = vi.fn(async () => {});

    setAuthAvailability({ mode: 'clerk', isEnabled: true });
    setSessionState({ signOut });

    renderRoute(<SettingsPage />);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/sign-in' });
  });
});
