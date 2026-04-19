import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { renderRoute } from './test/render-router';

vi.mock('./lib/oauth', () => ({
  connectProvider: vi.fn(),
}));
vi.mock('./lib/trpc', () => import('./test/mocks/trpc'));

import { connectProvider } from './lib/oauth';
import { WelcomePage } from './welcome-page';
import { hookSpies, mutationSpies, resetTrpcMocks, setSessionState } from './test/mocks/trpc';

async function openIntegration(
  user: ReturnType<typeof userEvent.setup>,
  name: 'YouTube' | 'Spotify' | 'Newsletters' | 'RSS'
) {
  await user.click(screen.getByRole('button', { name: `Open ${name} integration` }));
}

function mockConnected(providers: Partial<Record<'YOUTUBE' | 'SPOTIFY' | 'GMAIL', boolean>>) {
  hookSpies.connectionsListUseQuery.mockImplementation(() => ({
    data: {
      YOUTUBE: providers.YOUTUBE
        ? { provider: 'YOUTUBE', status: 'ACTIVE', connectedAt: Date.now() }
        : null,
      SPOTIFY: providers.SPOTIFY
        ? { provider: 'SPOTIFY', status: 'ACTIVE', connectedAt: Date.now() }
        : null,
      GMAIL: providers.GMAIL
        ? { provider: 'GMAIL', status: 'ACTIVE', connectedAt: Date.now() }
        : null,
    },
    isLoading: false,
    error: null,
  }));
}

function mockDiscoverItems(
  byProvider: Partial<Record<'SPOTIFY' | 'YOUTUBE', Array<{ id: string; name: string }>>>
) {
  hookSpies.discoverAvailableUseQuery.mockImplementation((input) => ({
    data: {
      items:
        (input.provider === 'SPOTIFY' && byProvider.SPOTIFY) ||
        (input.provider === 'YOUTUBE' && byProvider.YOUTUBE) ||
        [],
      connectionRequired: false,
    },
    isLoading: false,
    error: null,
  }));
}

describe('WelcomePage — integration launcher', () => {
  beforeEach(() => {
    resetTrpcMocks();
    sessionStorage.clear();
    vi.mocked(connectProvider).mockReset();
    setSessionState({ getToken: async () => 'token-123' });
  });

  test('opens as a compact intro modal with clickable integration items', () => {
    renderRoute(<WelcomePage />, { route: '/welcome', path: '/welcome' });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeVisible();
    expect(dialog).toHaveClass('onboarding-dialog__content--compact');
    expect(screen.queryByRole('list', { name: 'Onboarding steps' })).toBeNull();

    const integrations = screen.getByRole('list', { name: 'Available integrations' });
    expect(
      within(integrations).getByRole('button', { name: 'Open YouTube integration' })
    ).toBeVisible();
    expect(
      within(integrations).getByRole('button', { name: 'Open Spotify integration' })
    ).toBeVisible();
    expect(
      within(integrations).getByRole('button', { name: 'Open Newsletters integration' })
    ).toBeVisible();
    expect(
      within(integrations).getByRole('button', { name: 'Open RSS integration' })
    ).toBeVisible();
  });

  test('clicking Spotify opens the disconnected integration view and connect launches OAuth', async () => {
    const user = userEvent.setup();

    renderRoute(<WelcomePage />, { route: '/welcome', path: '/welcome' });

    await openIntegration(user, 'Spotify');

    expect(screen.getByRole('dialog')).toHaveClass('onboarding-dialog__content--compact');
    expect(screen.getByRole('heading', { name: 'Spotify', level: 2 })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Connect Spotify' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Connect Spotify' }));

    expect(connectProvider).toHaveBeenCalledWith('SPOTIFY', expect.any(Function));
    expect(JSON.parse(sessionStorage.getItem('zine:web:onboarding-oauth-context') ?? '{}')).toEqual(
      { origin: 'welcome', provider: 'SPOTIFY' }
    );
  });

  test('returning from Spotify OAuth opens the subscriptions list directly', () => {
    mockConnected({ SPOTIFY: true });
    mockDiscoverItems({
      SPOTIFY: [
        { id: 'show-1', name: 'Sharp Tech' },
        { id: 'show-2', name: 'Studio Notes' },
      ],
    });
    sessionStorage.setItem(
      'zine:web:onboarding-oauth-context',
      JSON.stringify({ origin: 'welcome', provider: 'SPOTIFY' })
    );

    renderRoute(<WelcomePage />, { route: '/welcome', path: '/welcome' });

    expect(screen.getByRole('heading', { name: 'Spotify', level: 2 })).toBeVisible();
    expect(screen.getByRole('searchbox', { name: /Search Spotify/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Connect Spotify' })).toBeNull();
  });

  test('connected Spotify starts on the subscriptions list and returns to integrations after import', async () => {
    const user = userEvent.setup();

    mockConnected({ SPOTIFY: true });
    mockDiscoverItems({
      SPOTIFY: [
        { id: 'show-1', name: 'Sharp Tech' },
        { id: 'show-2', name: 'Studio Notes' },
        { id: 'show-3', name: 'Signal Boost' },
      ],
    });

    renderRoute(<WelcomePage />, { route: '/welcome', path: '/welcome' });

    await openIntegration(user, 'Spotify');

    expect(screen.getByRole('checkbox', { name: 'Sharp Tech' })).not.toBeChecked();

    const search = screen.getByRole('searchbox', { name: /Search Spotify/i });
    await user.type(search, 'Signal');
    expect(screen.queryByRole('checkbox', { name: 'Sharp Tech' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Signal Boost' })).toBeVisible();
    await user.clear(search);

    await user.click(screen.getByRole('checkbox', { name: /Select all/i }));
    await user.click(screen.getByRole('checkbox', { name: 'Studio Notes' }));
    await user.click(screen.getByRole('button', { name: /Import 2 shows/i }));

    expect(mutationSpies.subscriptionAdd).toHaveBeenNthCalledWith(1, {
      provider: 'SPOTIFY',
      providerChannelId: 'show-1',
      name: 'Sharp Tech',
    });
    expect(mutationSpies.subscriptionAdd).toHaveBeenNthCalledWith(2, {
      provider: 'SPOTIFY',
      providerChannelId: 'show-3',
      name: 'Signal Boost',
    });

    expect(screen.getByRole('list', { name: 'Available integrations' })).toBeVisible();
  });

  test('YouTube opens on the subscription list immediately when already connected', async () => {
    const user = userEvent.setup();

    mockConnected({ YOUTUBE: true });
    mockDiscoverItems({
      YOUTUBE: [
        { id: 'channel-1', name: 'Wendover Productions' },
        { id: 'channel-2', name: 'Veritasium' },
      ],
    });

    renderRoute(<WelcomePage />, { route: '/welcome', path: '/welcome' });

    await openIntegration(user, 'YouTube');

    expect(screen.getByRole('heading', { name: 'YouTube', level: 2 })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Wendover Productions' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Connect YouTube' })).toBeNull();
  });

  test('Newsletters opens the disconnected connect state when Gmail is not connected', async () => {
    const user = userEvent.setup();

    renderRoute(<WelcomePage />, { route: '/welcome', path: '/welcome' });

    await openIntegration(user, 'Newsletters');

    expect(screen.getByRole('heading', { name: 'Newsletters', level: 2 })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Connect Newsletters' })).toBeVisible();
  });

  test('connected Newsletters starts on the sender list and updates statuses', async () => {
    const user = userEvent.setup();

    mockConnected({ GMAIL: true });
    hookSpies.newslettersListUseQuery.mockImplementation(() => ({
      data: {
        items: [
          {
            id: 'nl-1',
            displayName: 'Stratechery',
            fromAddress: 'ben@stratechery.com',
            status: 'ACTIVE',
          },
          {
            id: 'nl-2',
            displayName: 'Morning Brew',
            fromAddress: 'crew@morningbrew.com',
            status: 'ACTIVE',
          },
        ],
        nextCursor: null,
        hasMore: false,
      },
      isLoading: false,
      error: null,
    }));

    renderRoute(<WelcomePage />, { route: '/welcome', path: '/welcome' });

    await openIntegration(user, 'Newsletters');

    expect(screen.getByRole('checkbox', { name: 'Stratechery' })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Stratechery' }));
    await user.click(screen.getByRole('button', { name: /Import 1 newsletter/i }));

    expect(mutationSpies.newslettersUpdateStatus).toHaveBeenCalledWith({
      feedId: 'nl-1',
      status: 'ACTIVE',
    });
    expect(mutationSpies.newslettersUpdateStatus).toHaveBeenCalledWith({
      feedId: 'nl-2',
      status: 'HIDDEN',
    });

    expect(screen.getByRole('list', { name: 'Available integrations' })).toBeVisible();
  });

  test('RSS opens directly on feed discovery and imports selected feeds', async () => {
    const user = userEvent.setup();

    hookSpies.rssDiscoverUseQuery.mockImplementation((input) => ({
      data: {
        sourceUrl: input.url,
        sourceOrigin: 'https://feeds.example',
        checkedAt: '2026-04-17T00:00:00.000Z',
        cached: false,
        candidates: [
          {
            feedUrl: 'https://feeds.example/rss.xml',
            title: 'Feeds Weekly',
            description: 'A tidy feed.',
            subscription: null,
          },
        ],
      },
      isLoading: false,
      error: null,
    }));

    renderRoute(<WelcomePage />, { route: '/welcome', path: '/welcome' });

    await openIntegration(user, 'RSS');

    expect(screen.getByRole('heading', { name: 'RSS', level: 2 })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Connect/i })).toBeNull();

    await user.type(screen.getByLabelText(/Website or feed URL/i), 'https://feeds.example');
    await user.click(screen.getByRole('button', { name: /Discover feeds/i }));
    await user.click(screen.getByRole('checkbox', { name: 'Feeds Weekly' }));
    await user.click(screen.getByRole('button', { name: /Import 1 feed/i }));

    expect(mutationSpies.rssAdd).toHaveBeenCalledWith({
      feedUrl: 'https://feeds.example/rss.xml',
      seedMode: 'latest',
    });
    expect(screen.getByRole('list', { name: 'Available integrations' })).toBeVisible();
  });

  test('launched from settings closes back to /settings', async () => {
    const user = userEvent.setup();

    const { container } = renderRoute(<WelcomePage />, {
      route: '/welcome?origin=settings',
      path: '/welcome',
      redirects: [{ path: '/settings', element: <div>Settings destination</div> }],
    });

    await user.click(screen.getByRole('button', { name: /Close guided setup/i }));

    expect(await screen.findByText('Settings destination')).toBeVisible();
    expect(container).toBeDefined();
  });
});
