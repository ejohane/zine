import { Provider } from '@zine/shared';
import type { httpBatchLink } from '@trpc/client';
import { beforeEach, describe, expect, test, vi } from 'vitest';

type HttpBatchLinkOptions = Parameters<typeof httpBatchLink>[0];

const createTRPCClientMock = vi.fn();
const httpBatchLinkMock = vi.fn((options: HttpBatchLinkOptions) => options);
const registerStateMutate = vi.fn<(input: { provider: Provider; state: string }) => Promise<void>>(
  async () => undefined
);
const callbackMutate = vi.fn<
  (input: {
    provider: Provider;
    code: string;
    state: string;
    codeVerifier: string;
    redirectUri: string;
  }) => Promise<void>
>(async () => undefined);

async function loadOAuthModule(envOverrides: Partial<Record<string, string>> = {}) {
  vi.resetModules();

  createTRPCClientMock.mockReset();
  createTRPCClientMock.mockReturnValue({
    subscriptions: {
      connections: {
        registerState: { mutate: registerStateMutate },
        callback: { mutate: callbackMutate },
      },
    },
  });

  httpBatchLinkMock.mockClear();
  registerStateMutate.mockReset();
  registerStateMutate.mockResolvedValue(undefined);
  callbackMutate.mockReset();
  callbackMutate.mockResolvedValue(undefined);

  vi.doMock('@trpc/client', () => ({
    createTRPCClient: createTRPCClientMock,
    httpBatchLink: httpBatchLinkMock,
  }));

  vi.doMock('./env', () => ({
    API_URL: 'http://localhost:8787',
    SPOTIFY_CLIENT_ID: 'spotify-client',
    X_CLIENT_ID: 'x-client',
    YOUTUBE_CLIENT_ID: 'google-client',
    ...envOverrides,
  }));

  return import('./oauth');
}

describe('oauth helpers', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('connectProvider rejects when the provider client id is missing', async () => {
    const { connectProvider } = await loadOAuthModule({ SPOTIFY_CLIENT_ID: '' });

    await expect(connectProvider('SPOTIFY', async () => null)).rejects.toThrow(
      'Missing VITE_SPOTIFY_CLIENT_ID.'
    );
  });

  test('connectProvider registers state and redirects to the provider auth screen', async () => {
    const { connectProvider } = await loadOAuthModule();
    const redirectMock = vi.fn();

    await connectProvider('YOUTUBE', async () => 'token-123', redirectMock);

    expect(registerStateMutate).toHaveBeenCalledTimes(1);
    const [registration] = registerStateMutate.mock.calls[0]!;
    expect(registration.provider).toBe(Provider.YOUTUBE);
    expect(registration.state).toMatch(/^YOUTUBE:/);
    expect(sessionStorage.getItem('zine:web:youtube:state')).toBe(registration.state);
    expect(sessionStorage.getItem('zine:web:youtube:verifier')).toBeTruthy();

    const redirectUrl = new URL(redirectMock.mock.calls[0][0] as string);
    expect(redirectUrl.origin + redirectUrl.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth'
    );
    expect(redirectUrl.searchParams.get('client_id')).toBe('google-client');
    expect(redirectUrl.searchParams.get('redirect_uri')).toBe(
      `${window.location.origin}/oauth/callback`
    );
    expect(redirectUrl.searchParams.get('response_type')).toBe('code');
    expect(redirectUrl.searchParams.get('state')).toBe(registration.state);
    expect(redirectUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(redirectUrl.searchParams.get('access_type')).toBe('offline');
    expect(redirectUrl.searchParams.get('prompt')).toBe('consent');
  });

  test('completeOAuthFlow exchanges the callback code and clears stored oauth state', async () => {
    const { completeOAuthFlow } = await loadOAuthModule();
    const state = 'SPOTIFY:callback-state';

    sessionStorage.setItem('zine:web:spotify:state', state);
    sessionStorage.setItem('zine:web:spotify:verifier', 'verifier-123');

    await expect(
      completeOAuthFlow(new URLSearchParams({ code: 'code-123', state }), async () => 'token-123')
    ).resolves.toBe('SPOTIFY');

    expect(callbackMutate).toHaveBeenCalledWith({
      provider: Provider.SPOTIFY,
      code: 'code-123',
      state,
      codeVerifier: 'verifier-123',
      redirectUri: `${window.location.origin}/oauth/callback`,
    });
    expect(sessionStorage.getItem('zine:web:spotify:state')).toBeNull();
    expect(sessionStorage.getItem('zine:web:spotify:verifier')).toBeNull();
  });

  test('completeOAuthFlow rejects state mismatches and clears stale session storage', async () => {
    const { completeOAuthFlow } = await loadOAuthModule();

    sessionStorage.setItem('zine:web:spotify:state', 'SPOTIFY:different-state');
    sessionStorage.setItem('zine:web:spotify:verifier', 'verifier-123');

    await expect(
      completeOAuthFlow(
        new URLSearchParams({ code: 'code-123', state: 'SPOTIFY:callback-state' }),
        async () => null
      )
    ).rejects.toThrow('OAuth state mismatch. Please try connecting again.');

    expect(sessionStorage.getItem('zine:web:spotify:state')).toBeNull();
    expect(sessionStorage.getItem('zine:web:spotify:verifier')).toBeNull();
  });
});
