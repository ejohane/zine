import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { Provider } from '@zine/shared';
import superjson from 'superjson';

import type { AppRouter } from '@zine/worker/trpc/router';

import { API_URL, SPOTIFY_CLIENT_ID, YOUTUBE_CLIENT_ID } from './env';

export type OAuthProvider = 'YOUTUBE' | 'SPOTIFY' | 'GMAIL';

type TokenGetter = () => Promise<string | null>;

const OAUTH_CONFIG: Record<OAuthProvider, { clientId: string; authUrl: string; scopes: string[] }> =
  {
    YOUTUBE: {
      clientId: YOUTUBE_CLIENT_ID,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      scopes: [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
    },
    GMAIL: {
      clientId: YOUTUBE_CLIENT_ID,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
    },
    SPOTIFY: {
      clientId: SPOTIFY_CLIENT_ID,
      authUrl: 'https://accounts.spotify.com/authorize',
      scopes: ['user-library-read'],
    },
  };

function toProviderEnum(provider: OAuthProvider): Provider {
  switch (provider) {
    case 'YOUTUBE':
      return Provider.YOUTUBE;
    case 'GMAIL':
      return Provider.GMAIL;
    case 'SPOTIFY':
      return Provider.SPOTIFY;
  }
}

function getStorageKey(provider: OAuthProvider, suffix: string) {
  return `zine:web:${provider.toLowerCase()}:${suffix}`;
}

function createClient(getToken: TokenGetter) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        transformer: superjson,
        headers: async () => {
          const token = await getToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}

function base64URLEncode(buffer: Uint8Array): string {
  let binary = '';
  buffer.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generatePKCE() {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = base64URLEncode(randomBytes);
  const digestBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64URLEncode(new Uint8Array(digestBuffer));
  return { verifier, challenge };
}

function getRedirectUri() {
  return `${window.location.origin}/oauth/callback`;
}

function isGoogleProvider(provider: OAuthProvider) {
  return provider === 'YOUTUBE' || provider === 'GMAIL';
}

function parseProviderFromState(state: string | null): OAuthProvider | null {
  if (!state) return null;
  const provider = state.split(':')[0];
  return provider === 'YOUTUBE' || provider === 'SPOTIFY' || provider === 'GMAIL' ? provider : null;
}

async function clearOAuthState(provider: OAuthProvider) {
  sessionStorage.removeItem(getStorageKey(provider, 'verifier'));
  sessionStorage.removeItem(getStorageKey(provider, 'state'));
}

export async function connectProvider(provider: OAuthProvider, getToken: TokenGetter) {
  const config = OAUTH_CONFIG[provider];
  if (!config.clientId) {
    throw new Error(
      provider === 'SPOTIFY' ? 'Missing VITE_SPOTIFY_CLIENT_ID.' : 'Missing VITE_YOUTUBE_CLIENT_ID.'
    );
  }

  const client = createClient(getToken);
  const { verifier, challenge } = await generatePKCE();
  const state = `${provider}:${crypto.randomUUID()}`;

  sessionStorage.setItem(getStorageKey(provider, 'verifier'), verifier);
  sessionStorage.setItem(getStorageKey(provider, 'state'), state);

  await client.subscriptions.connections.registerState.mutate({
    provider: toProviderEnum(provider),
    state,
  });

  const authUrl = new URL(config.authUrl);
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', getRedirectUri());
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', config.scopes.join(' '));
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  if (isGoogleProvider(provider)) {
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
  }

  window.location.assign(authUrl.toString());
}

export async function completeOAuthFlow(
  searchParams: URLSearchParams,
  getToken: TokenGetter
): Promise<OAuthProvider> {
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');
  const provider = parseProviderFromState(state);

  if (!provider) {
    throw new Error('OAuth provider could not be determined from the callback.');
  }

  if (errorParam) {
    await clearOAuthState(provider);
    throw new Error(searchParams.get('error_description') || errorParam);
  }

  if (!code || !state) {
    await clearOAuthState(provider);
    throw new Error('OAuth callback did not include the expected authorization code.');
  }

  const storedState = sessionStorage.getItem(getStorageKey(provider, 'state'));
  const codeVerifier = sessionStorage.getItem(getStorageKey(provider, 'verifier'));

  if (!storedState || storedState !== state) {
    await clearOAuthState(provider);
    throw new Error('OAuth state mismatch. Please try connecting again.');
  }

  if (!codeVerifier) {
    await clearOAuthState(provider);
    throw new Error('PKCE verifier not found. Please try connecting again.');
  }

  const client = createClient(getToken);
  await client.subscriptions.connections.callback.mutate({
    provider: toProviderEnum(provider),
    code,
    state,
    codeVerifier,
    redirectUri: getRedirectUri(),
  });

  await clearOAuthState(provider);
  return provider;
}
