import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { Provider, type OAuthProvider } from '@zine/shared/types';
import superjson from 'superjson';

import type { AppRouter } from '@zine/worker/trpc/router';

import { API_URL, SPOTIFY_CLIENT_ID, YOUTUBE_CLIENT_ID } from './env';

export type { OAuthProvider } from '@zine/shared/types';

type TokenGetter = () => Promise<string | null>;
type RedirectHandler = (url: string) => void;

const SHA256_INITIAL_HASH = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const OAUTH_CONFIG = {
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
} as const satisfies Record<
  OAuthProvider,
  {
    clientId: string;
    authUrl: string;
    scopes: readonly string[];
  }
>;

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

function getCryptoApi() {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Web Crypto random values are unavailable in this browser.');
  }

  return globalThis.crypto;
}

function getRandomBytes(length: number) {
  const bytes = new Uint8Array(length);
  getCryptoApi().getRandomValues(bytes);
  return bytes;
}

function rightRotate(value: number, shift: number) {
  return (value >>> shift) | (value << (32 - shift));
}

function sha256Fallback(input: Uint8Array) {
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;

  const bitLength = input.length * 8;
  const paddedView = new DataView(padded.buffer);
  paddedView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  paddedView.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const hash = new Uint32Array(SHA256_INITIAL_HASH);
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      schedule[i] = paddedView.getUint32(offset + i * 4, false);
    }

    for (let i = 16; i < 64; i += 1) {
      const s0 =
        rightRotate(schedule[i - 15]!, 7) ^
        rightRotate(schedule[i - 15]!, 18) ^
        (schedule[i - 15]! >>> 3);
      const s1 =
        rightRotate(schedule[i - 2]!, 17) ^
        rightRotate(schedule[i - 2]!, 19) ^
        (schedule[i - 2]! >>> 10);
      schedule[i] = (schedule[i - 16]! + s0 + schedule[i - 7]! + s1) >>> 0;
    }

    let a = hash[0]!;
    let b = hash[1]!;
    let c = hash[2]!;
    let d = hash[3]!;
    let e = hash[4]!;
    let f = hash[5]!;
    let g = hash[6]!;
    let h = hash[7]!;

    for (let i = 0; i < 64; i += 1) {
      const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sigma1 + choose + SHA256_K[i]! + schedule[i]!) >>> 0;
      const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sigma0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0]! + a) >>> 0;
    hash[1] = (hash[1]! + b) >>> 0;
    hash[2] = (hash[2]! + c) >>> 0;
    hash[3] = (hash[3]! + d) >>> 0;
    hash[4] = (hash[4]! + e) >>> 0;
    hash[5] = (hash[5]! + f) >>> 0;
    hash[6] = (hash[6]! + g) >>> 0;
    hash[7] = (hash[7]! + h) >>> 0;
  }

  const output = new Uint8Array(32);
  const outputView = new DataView(output.buffer);

  for (let i = 0; i < hash.length; i += 1) {
    outputView.setUint32(i * 4, hash[i]!, false);
  }

  return output;
}

async function sha256(input: Uint8Array) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const subtleInput = new ArrayBuffer(input.byteLength);
    new Uint8Array(subtleInput).set(input);
    const digestBuffer = await subtle.digest('SHA-256', subtleInput);
    return new Uint8Array(digestBuffer);
  }

  return sha256Fallback(input);
}

function createStateId() {
  const cryptoApi = getCryptoApi();
  if (typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  const bytes = getRandomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function generatePKCE() {
  const randomBytes = getRandomBytes(32);
  const verifier = base64URLEncode(randomBytes);
  const challenge = base64URLEncode(await sha256(new TextEncoder().encode(verifier)));
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

export async function connectProvider(
  provider: OAuthProvider,
  getToken: TokenGetter,
  redirect: RedirectHandler = (url) => window.location.assign(url)
) {
  const config = OAUTH_CONFIG[provider];
  if (!config.clientId) {
    throw new Error(
      provider === 'SPOTIFY' ? 'Missing VITE_SPOTIFY_CLIENT_ID.' : 'Missing VITE_YOUTUBE_CLIENT_ID.'
    );
  }

  const client = createClient(getToken);
  const { verifier, challenge } = await generatePKCE();
  const state = `${provider}:${createStateId()}`;

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

  redirect(authUrl.toString());
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
