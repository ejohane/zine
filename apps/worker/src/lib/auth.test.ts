/**
 * Tests for authentication helpers
 *
 * Tests Clerk JWT verification and OAuth token exchange functionality including:
 * - JWT token verification with JWKS
 * - JWKS caching behavior
 * - OAuth code exchange for YouTube and Spotify
 * - Provider user info fetching
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as jose from 'jose';
import {
  verifyClerkToken,
  clearJWKSCache,
  exchangeCodeForTokens,
  getProviderUserInfo,
  type ClerkJWTPayload,
} from './auth';
import type { Bindings } from '../types';
import { Provider } from '@zine/shared';

// ============================================================================
// Mocks
// ============================================================================

// Mock jose module
vi.mock('jose', async () => {
  const actual = await vi.importActual<typeof jose>('jose');
  return {
    ...actual,
    createRemoteJWKSet: vi.fn(() => vi.fn()),
    jwtVerify: vi.fn(),
  };
});

// Mock fetch for OAuth endpoints
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ============================================================================
// Test Constants
// ============================================================================

const MOCK_JWKS_URL = 'https://clerk.example.com/.well-known/jwks.json';
const MOCK_TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';

const mockEnv: Bindings = {
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  SPOTIFY_CLIENT_ID: 'spotify-client-id',
  SPOTIFY_CLIENT_SECRET: 'spotify-secret',
  OAUTH_REDIRECT_URI: 'zine://oauth/callback',
} as Bindings;

// ============================================================================
// verifyClerkToken Tests
// ============================================================================

describe('verifyClerkToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearJWKSCache();
  });

  it('returns MISSING_TOKEN error when token is undefined', async () => {
    const result = await verifyClerkToken(undefined, MOCK_JWKS_URL);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('MISSING_TOKEN');
      expect(result.error).toBe('No authentication token provided');
    }
  });

  it('returns MISSING_TOKEN error when token is empty string', async () => {
    const result = await verifyClerkToken('', MOCK_JWKS_URL);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('MISSING_TOKEN');
      expect(result.error).toBe('No authentication token provided');
    }
  });

  it('verifies valid token and returns userId', async () => {
    const mockPayload: ClerkJWTPayload = {
      sub: 'user_123',
      azp: 'test-app',
      sid: 'sess_abc',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    (jose.jwtVerify as Mock).mockResolvedValueOnce({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256' },
    });

    const result = await verifyClerkToken(MOCK_TOKEN, MOCK_JWKS_URL);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.userId).toBe('user_123');
      expect(result.payload).toEqual(mockPayload);
    }
    expect(jose.jwtVerify).toHaveBeenCalledWith(MOCK_TOKEN, expect.any(Function), {
      clockTolerance: 5,
    });
  });

  it('returns EXPIRED_TOKEN for expired JWT', async () => {
    const expiredError = new jose.errors.JWTExpired('Token has expired', { sub: 'user_123' });
    (jose.jwtVerify as Mock).mockRejectedValueOnce(expiredError);

    const result = await verifyClerkToken(MOCK_TOKEN, MOCK_JWKS_URL);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('EXPIRED_TOKEN');
      expect(result.error).toBe('Token has expired');
    }
  });

  it('returns JWKS_ERROR when no matching key', async () => {
    (jose.jwtVerify as Mock).mockRejectedValueOnce(
      new jose.errors.JWKSNoMatchingKey('No matching key found')
    );

    const result = await verifyClerkToken(MOCK_TOKEN, MOCK_JWKS_URL);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('JWKS_ERROR');
      expect(result.error).toBe('No matching key found in JWKS');
    }
  });

  it('returns INVALID_TOKEN for malformed token', async () => {
    (jose.jwtVerify as Mock).mockRejectedValueOnce(new Error('Invalid compact JWS'));

    const result = await verifyClerkToken('not-a-valid-jwt', MOCK_JWKS_URL);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_TOKEN');
      expect(result.error).toBe('Invalid compact JWS');
    }
  });

  it('returns INVALID_TOKEN when sub claim missing', async () => {
    const mockPayloadWithoutSub = {
      azp: 'test-app',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    (jose.jwtVerify as Mock).mockResolvedValueOnce({
      payload: mockPayloadWithoutSub,
      protectedHeader: { alg: 'RS256' },
    });

    const result = await verifyClerkToken(MOCK_TOKEN, MOCK_JWKS_URL);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('INVALID_TOKEN');
      expect(result.error).toBe('Token missing subject claim');
    }
  });

  it('uses cached JWKS on subsequent calls', async () => {
    const mockPayload: ClerkJWTPayload = {
      sub: 'user_123',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    (jose.jwtVerify as Mock).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256' },
    });

    // First call
    await verifyClerkToken(MOCK_TOKEN, MOCK_JWKS_URL);
    // Second call
    await verifyClerkToken(MOCK_TOKEN, MOCK_JWKS_URL);

    // createRemoteJWKSet should only be called once
    expect(jose.createRemoteJWKSet).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// clearJWKSCache Tests
// ============================================================================

describe('clearJWKSCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearJWKSCache();
  });

  it('clears the JWKS cache', async () => {
    const mockPayload: ClerkJWTPayload = {
      sub: 'user_123',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    (jose.jwtVerify as Mock).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256' },
    });

    // First call creates cache
    await verifyClerkToken(MOCK_TOKEN, MOCK_JWKS_URL);

    // Clear the cache
    clearJWKSCache();

    // Second call should create new JWKS
    await verifyClerkToken(MOCK_TOKEN, MOCK_JWKS_URL);

    // Should have been called twice - once before clear, once after
    expect(jose.createRemoteJWKSet).toHaveBeenCalledTimes(2);
  });

  it('next verification fetches fresh JWKS', async () => {
    const mockPayload: ClerkJWTPayload = {
      sub: 'user_456',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    (jose.jwtVerify as Mock).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: 'RS256' },
    });

    // Initial call creates JWKS
    await verifyClerkToken(MOCK_TOKEN, MOCK_JWKS_URL);
    const initialCallCount = (jose.createRemoteJWKSet as Mock).mock.calls.length;

    // Clear cache
    clearJWKSCache();

    // Next call should create a fresh JWKS
    await verifyClerkToken(MOCK_TOKEN, MOCK_JWKS_URL);

    // Should have been called one more time after clear
    expect(jose.createRemoteJWKSet).toHaveBeenCalledTimes(initialCallCount + 1);
    expect(jose.createRemoteJWKSet).toHaveBeenLastCalledWith(new URL(MOCK_JWKS_URL));
  });
});

// ============================================================================
// exchangeCodeForTokens Tests
// ============================================================================

describe('exchangeCodeForTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('builds correct request for YOUTUBE provider', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'ya29.access_token',
          refresh_token: 'refresh_token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
    });

    await exchangeCodeForTokens(Provider.YOUTUBE, 'auth_code', 'code_verifier_123', mockEnv);

    expect(mockFetch).toHaveBeenCalledWith('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: expect.any(URLSearchParams),
    });

    const callArgs = mockFetch.mock.calls[0];
    const body = callArgs[1].body as URLSearchParams;
    expect(body.get('client_id')).toBe('google-client-id');
    expect(body.get('client_secret')).toBe('google-secret');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth_code');
    expect(body.get('redirect_uri')).toBe('zine://oauth/callback');
  });

  it('builds correct request for SPOTIFY provider', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'spotify_access_token',
          refresh_token: 'spotify_refresh_token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
    });

    await exchangeCodeForTokens(Provider.SPOTIFY, 'spotify_code', 'verifier_456', mockEnv);

    expect(mockFetch).toHaveBeenCalledWith('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: expect.any(URLSearchParams),
    });

    const callArgs = mockFetch.mock.calls[0];
    const body = callArgs[1].body as URLSearchParams;
    expect(body.get('client_id')).toBe('spotify-client-id');
    expect(body.get('client_secret')).toBe('spotify-secret');
  });

  it('includes code_verifier in request body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'access_token',
          refresh_token: 'refresh_token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
    });

    await exchangeCodeForTokens(Provider.YOUTUBE, 'code', 'my_code_verifier', mockEnv);

    const callArgs = mockFetch.mock.calls[0];
    const body = callArgs[1].body as URLSearchParams;
    expect(body.get('code_verifier')).toBe('my_code_verifier');
  });

  it('includes client_secret when available', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'access_token',
          refresh_token: 'refresh_token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
    });

    await exchangeCodeForTokens(Provider.YOUTUBE, 'code', 'verifier', mockEnv);

    const callArgs = mockFetch.mock.calls[0];
    const body = callArgs[1].body as URLSearchParams;
    expect(body.get('client_secret')).toBe('google-secret');
  });

  it('handles successful token response', async () => {
    const tokenResponse = {
      access_token: 'new_access_token',
      refresh_token: 'new_refresh_token',
      expires_in: 7200,
      token_type: 'Bearer',
      scope: 'read write',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(tokenResponse),
    });

    const result = await exchangeCodeForTokens(Provider.YOUTUBE, 'code', 'verifier', mockEnv);

    expect(result.access_token).toBe('new_access_token');
    expect(result.refresh_token).toBe('new_refresh_token');
    expect(result.expires_in).toBe(7200);
    expect(result.token_type).toBe('Bearer');
    expect(result.scope).toBe('read write');
  });

  it('throws on HTTP error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () =>
        Promise.resolve(
          JSON.stringify({ error: 'invalid_grant', error_description: 'Code expired' })
        ),
    });

    await expect(
      exchangeCodeForTokens(Provider.YOUTUBE, 'expired_code', 'verifier', mockEnv)
    ).rejects.toThrow('Token exchange failed: Code expired');
  });

  it('throws when no access_token in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token_type: 'Bearer' }),
    });

    await expect(
      exchangeCodeForTokens(Provider.YOUTUBE, 'code', 'verifier', mockEnv)
    ).rejects.toThrow('No access token in response');
  });

  it('uses placeholder refresh_token when not provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'access_only_token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
    });

    const result = await exchangeCodeForTokens(Provider.SPOTIFY, 'code', 'verifier', mockEnv);

    // Should use access_token as placeholder for refresh_token
    expect(result.refresh_token).toBe('access_only_token');
  });

  it('uses override redirect URI when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'access_token',
          refresh_token: 'refresh_token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
    });

    await exchangeCodeForTokens(
      Provider.YOUTUBE,
      'code',
      'verifier',
      mockEnv,
      'https://custom.redirect/callback'
    );

    const callArgs = mockFetch.mock.calls[0];
    const body = callArgs[1].body as URLSearchParams;
    expect(body.get('redirect_uri')).toBe('https://custom.redirect/callback');
  });

  it('throws when client_id is not configured', async () => {
    const envWithoutClientId = {
      ...mockEnv,
      GOOGLE_CLIENT_ID: undefined,
    } as unknown as Bindings;

    await expect(
      exchangeCodeForTokens(Provider.YOUTUBE, 'code', 'verifier', envWithoutClientId)
    ).rejects.toThrow('YOUTUBE OAuth credentials not configured');
  });
});

// ============================================================================
// getProviderUserInfo Tests
// ============================================================================

describe('getProviderUserInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it('fetches and returns YOUTUBE user info correctly mapped', async () => {
    const googleUserInfo = {
      id: 'google_user_123',
      email: 'user@gmail.com',
      name: 'John Doe',
      picture: 'https://lh3.googleusercontent.com/photo.jpg',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(googleUserInfo),
    });

    const result = await getProviderUserInfo(Provider.YOUTUBE, 'ya29.access_token');

    expect(mockFetch).toHaveBeenCalledWith('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: 'Bearer ya29.access_token',
      },
    });

    expect(result.id).toBe('google_user_123');
    expect(result.email).toBe('user@gmail.com');
    expect(result.name).toBe('John Doe');
  });

  it('fetches and returns SPOTIFY user info correctly mapped', async () => {
    const spotifyUserInfo = {
      id: 'spotify_user_456',
      email: 'user@spotify.com',
      display_name: 'Jane Smith',
      images: [{ url: 'https://i.scdn.co/image/photo.jpg' }],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(spotifyUserInfo),
    });

    const result = await getProviderUserInfo(Provider.SPOTIFY, 'spotify_access_token');

    expect(mockFetch).toHaveBeenCalledWith('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: 'Bearer spotify_access_token',
      },
    });

    expect(result.id).toBe('spotify_user_456');
    expect(result.email).toBe('user@spotify.com');
    // Spotify uses display_name instead of name
    expect(result.name).toBe('Jane Smith');
  });

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve('Unauthorized'),
    });

    await expect(getProviderUserInfo(Provider.YOUTUBE, 'invalid_token')).rejects.toThrow(
      'Failed to get user info: Unauthorized'
    );
  });

  it('sends correct Authorization header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'user_id',
          email: 'test@example.com',
        }),
    });

    await getProviderUserInfo(Provider.YOUTUBE, 'my_bearer_token');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer my_bearer_token',
        },
      })
    );
  });

  it('handles missing optional fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 'minimal_user',
        }),
    });

    const result = await getProviderUserInfo(Provider.YOUTUBE, 'token');

    expect(result.id).toBe('minimal_user');
    expect(result.email).toBeUndefined();
    expect(result.name).toBeUndefined();
  });
});
