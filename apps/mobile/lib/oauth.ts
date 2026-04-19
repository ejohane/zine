import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { Provider, type OAuthProvider } from '@zine/shared/types';
import type { AppRouter } from '../../worker/src/trpc/router';
import { API_URL } from './trpc';
import { oauthLogger } from './logger';
import {
  buildMobileTelemetryHeaders,
  createMobileActionTraceContext,
  telemetryFetch,
} from './trpc-transport';

// Needed so expo-web-browser can resume completed auth sessions.
WebBrowser.maybeCompleteAuthSession();
type TokenGetter = () => Promise<string | null>;

let _getToken: TokenGetter | null = null;

export function setTokenGetter(getter: TokenGetter): void {
  _getToken = getter;
}

function createVanillaClient(seed?: { traceId?: string }) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        transformer: superjson,
        headers: async () => {
          if (_getToken) {
            const token = await _getToken();
            if (token) {
              return buildMobileTelemetryHeaders({ Authorization: `Bearer ${token}` }, seed);
            }
          }
          return buildMobileTelemetryHeaders({}, seed);
        },
        fetch: telemetryFetch,
      }),
    ],
  });
}

// Google flows share one client ID so iOS redirect schemes and token exchange stay aligned.
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_YOUTUBE_CLIENT_ID ?? '';

export const OAUTH_CONFIG = {
  YOUTUBE: {
    clientId: GOOGLE_CLIENT_ID,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  },
  GMAIL: {
    clientId: GOOGLE_CLIENT_ID,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  },
  SPOTIFY: {
    clientId: process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? '',
    authUrl: 'https://accounts.spotify.com/authorize',
    scopes: ['user-library-read'],
  },
} as const satisfies Record<
  OAuthProvider,
  {
    clientId: string;
    authUrl: string;
    scopes: readonly string[];
  }
>;

export type { OAuthProvider } from '@zine/shared/types';

function isGoogleProvider(
  provider: OAuthProvider
): provider is Extract<OAuthProvider, 'YOUTUBE' | 'GMAIL'> {
  return provider === 'YOUTUBE' || provider === 'GMAIL';
}

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

export const REDIRECT_URI = 'zine://oauth/callback';

// Google OAuth on iOS requires the reversed client ID scheme.
export function getRedirectUri(provider?: OAuthProvider): string {
  if (provider === 'YOUTUBE' || provider === 'GMAIL') {
    const clientId = OAUTH_CONFIG[provider].clientId;
    if (clientId) {
      const match = clientId.match(/^(.+)\.apps\.googleusercontent\.com$/);
      if (match) {
        const reversedClientId = `com.googleusercontent.apps.${match[1]}`;
        return `${reversedClientId}:/oauth2redirect`;
      }
    }
  }

  if (__DEV__) {
    const uri = AuthSession.makeRedirectUri({ scheme: 'zine', path: 'oauth/callback' });
    oauthLogger.debug('Using development redirect URI', { uri, provider });
    return uri;
  }
  return REDIRECT_URI;
}

export function base64URLEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const verifier = base64URLEncode(randomBytes);

  const verifierBytes = new TextEncoder().encode(verifier);
  const digestBuffer = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, verifierBytes);

  const challenge = base64URLEncode(new Uint8Array(digestBuffer));

  return { verifier, challenge };
}
function getVerifierKey(provider: OAuthProvider): string {
  return `${provider.toLowerCase()}_code_verifier`;
}

function getStateKey(provider: OAuthProvider): string {
  return `${provider.toLowerCase()}_oauth_state`;
}

function getTraceKey(provider: OAuthProvider): string {
  return `${provider.toLowerCase()}_oauth_trace_id`;
}

async function clearOAuthSessionState(provider: OAuthProvider): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(getVerifierKey(provider)),
    SecureStore.deleteItemAsync(getStateKey(provider)),
    SecureStore.deleteItemAsync(getTraceKey(provider)),
  ]);
}
export async function connectProvider(provider: OAuthProvider): Promise<void> {
  oauthLogger.info('Starting connection flow', { provider });
  const config = OAUTH_CONFIG[provider];

  if (!config.clientId) {
    const error = isGoogleProvider(provider)
      ? 'Google client ID not configured. Set EXPO_PUBLIC_YOUTUBE_CLIENT_ID.'
      : `${provider} client ID not configured. Check EXPO_PUBLIC_${provider}_CLIENT_ID.`;
    oauthLogger.error('Client ID not configured', { provider });
    throw new Error(error);
  }

  const actionTrace = createMobileActionTraceContext();
  const client = createVanillaClient({ traceId: actionTrace.traceId });

  oauthLogger.debug('Generating PKCE challenge');
  const { verifier, challenge } = await generatePKCE();
  await SecureStore.setItemAsync(getVerifierKey(provider), verifier);

  // Encode the provider into state so cold-start callbacks can find the right keys.
  const state = `${provider}:${Crypto.randomUUID()}`;
  await SecureStore.setItemAsync(getTraceKey(provider), actionTrace.traceId);

  oauthLogger.debug('Registering state with server');
  try {
    await client.subscriptions.connections.registerState.mutate({
      provider: toProviderEnum(provider),
      state,
    });
    oauthLogger.debug('State registered successfully');
  } catch (error) {
    await clearOAuthSessionState(provider);
    oauthLogger.error('Failed to register state', { error });
    throw error;
  }

  await SecureStore.setItemAsync(getStateKey(provider), state);

  const redirectUri = getRedirectUri(provider);
  oauthLogger.debug('Using redirect URI', { redirectUri, provider });
  const authUrl = new URL(config.authUrl);
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', config.scopes.join(' '));
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  if (provider === 'YOUTUBE' || provider === 'GMAIL') {
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
  }

  oauthLogger.debug('Opening browser for authorization');
  const result = await WebBrowser.openAuthSessionAsync(authUrl.toString(), redirectUri);
  oauthLogger.debug('Browser result', { type: result.type });

  if (result.type !== 'success') {
    await clearOAuthSessionState(provider);
    throw new Error('OAuth flow cancelled or failed');
  }

  const redirectUrl = new URL(result.url);
  const code = redirectUrl.searchParams.get('code');
  const returnedState = redirectUrl.searchParams.get('state');

  const errorParam = redirectUrl.searchParams.get('error');
  if (errorParam) {
    const errorDescription = redirectUrl.searchParams.get('error_description');
    await clearOAuthSessionState(provider);
    throw new Error(`OAuth error: ${errorDescription || errorParam}`);
  }

  if (!returnedState) {
    await clearOAuthSessionState(provider);
    throw new Error('OAuth failed: No state returned');
  }

  const storedState = await SecureStore.getItemAsync(getStateKey(provider));
  if (returnedState !== storedState) {
    await clearOAuthSessionState(provider);
    throw new Error('OAuth state mismatch - possible CSRF attack');
  }

  if (!code) {
    await clearOAuthSessionState(provider);
    throw new Error('OAuth failed: No authorization code returned');
  }

  const storedVerifier = await SecureStore.getItemAsync(getVerifierKey(provider));
  if (!storedVerifier) {
    await clearOAuthSessionState(provider);
    throw new Error('PKCE verifier not found - OAuth flow corrupted');
  }

  oauthLogger.debug('Exchanging code for tokens');
  try {
    await client.subscriptions.connections.callback.mutate({
      provider: toProviderEnum(provider),
      code,
      state: returnedState,
      codeVerifier: storedVerifier,
      redirectUri,
    });
    oauthLogger.info('Token exchange successful', { provider });
  } catch (error) {
    await clearOAuthSessionState(provider);
    oauthLogger.error('Token exchange failed', { error });
    throw error;
  }

  await clearOAuthSessionState(provider);
}
export interface OAuthFlowResult {
  success: boolean;
  provider?: OAuthProvider;
  error?: string;
}

export async function completeOAuthFlow(
  code: string,
  state: string,
  provider: OAuthProvider
): Promise<OAuthFlowResult> {
  try {
    const storedState = await SecureStore.getItemAsync(getStateKey(provider));
    if (storedState !== state) {
      await clearOAuthSessionState(provider);
      return {
        success: false,
        error: 'State mismatch - possible CSRF attack',
      };
    }

    const verifier = await SecureStore.getItemAsync(getVerifierKey(provider));
    if (!verifier) {
      await clearOAuthSessionState(provider);
      return {
        success: false,
        error: 'PKCE verifier not found - OAuth session may have expired',
      };
    }

    const traceId = await SecureStore.getItemAsync(getTraceKey(provider));
    const client = createVanillaClient({ traceId: traceId ?? undefined });

    await client.subscriptions.connections.callback.mutate({
      provider: toProviderEnum(provider),
      code,
      state,
      codeVerifier: verifier,
    });

    await clearOAuthSessionState(provider);

    return {
      success: true,
      provider,
    };
  } catch (error) {
    try {
      await clearOAuthSessionState(provider);
    } catch (cleanupError) {
      oauthLogger.warn('Failed to clear OAuth session state after OAuth completion error', {
        provider,
        error: cleanupError,
      });
    }

    const message =
      error instanceof Error ? error.message : 'Unknown error during OAuth completion';
    return {
      success: false,
      error: message,
    };
  }
}
