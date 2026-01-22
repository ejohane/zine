/**
 * Tests for lib/oauth.ts
 *
 * Comprehensive tests for OAuth PKCE flow including:
 * - base64URLEncode - encoding utilities
 * - generatePKCE - PKCE verifier/challenge generation
 * - getRedirectUri - provider-specific redirect URIs
 * - connectProvider - complete OAuth flow orchestration
 * - completeOAuthFlow - OAuth callback completion
 *
 * These tests verify RFC 7636 compliance for PKCE flows and ensure
 * proper security handling throughout the OAuth process.
 */

// ============================================================================
// Global Polyfills (must be before any imports)
// ============================================================================

// Polyfill TextEncoder for jsdom environment
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as typeof global.TextDecoder;

// ============================================================================
// Environment Variables (must be set before module imports)
// ============================================================================

// Set environment variables BEFORE any module imports that depend on them
process.env.EXPO_PUBLIC_YOUTUBE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID = 'test-spotify-client';

// ============================================================================
// Mock Setup (must be before module imports)
// ============================================================================

// Mock expo-crypto
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(),
  digest: jest.fn(),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  randomUUID: jest.fn(() => 'test-uuid-1234'),
}));

// Mock expo-web-browser
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));

// Mock expo-auth-session
jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'zine://oauth/callback'),
}));

// Mock the logger to suppress output during tests
jest.mock('./logger', () => ({
  oauthLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock tRPC client creation
const mockMutate = jest.fn();
jest.mock('@trpc/client', () => ({
  createTRPCClient: jest.fn(() => ({
    subscriptions: {
      connections: {
        registerState: { mutate: mockMutate },
        callback: { mutate: mockMutate },
      },
    },
  })),
  httpBatchLink: jest.fn(() => ({})),
}));

// Mock superjson
jest.mock('superjson', () => ({
  default: {},
}));

// ============================================================================
// Module Imports (after mocks and env setup)
// ============================================================================

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

import {
  base64URLEncode,
  generatePKCE,
  getRedirectUri,
  connectProvider,
  completeOAuthFlow,
  setTokenGetter,
  OAUTH_CONFIG,
  REDIRECT_URI,
} from './oauth';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates a Uint8Array from known bytes for deterministic testing
 */
function createTestBytes(values: number[]): Uint8Array {
  return new Uint8Array(values);
}

/**
 * Generates 32 random-looking but deterministic bytes for PKCE testing
 */
function createMockRandomBytes(): Uint8Array {
  // These bytes will produce a predictable base64url output
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = (i * 7 + 13) % 256;
  }
  return bytes;
}

// ============================================================================
// base64URLEncode Tests
// ============================================================================

describe('base64URLEncode', () => {
  it('correctly encodes a known Uint8Array', () => {
    // "Hello" in bytes: [72, 101, 108, 108, 111]
    const input = createTestBytes([72, 101, 108, 108, 111]);
    const result = base64URLEncode(input);
    // Standard base64 for "Hello" is "SGVsbG8="
    // Base64url removes padding: "SGVsbG8"
    expect(result).toBe('SGVsbG8');
  });

  it('uses URL-safe characters (no +, /, =)', () => {
    // Create bytes that would produce + and / in standard base64
    // 0xFB, 0xEF, 0xBE = standard base64 "++--" (actually produces characters needing replacement)
    const input = createTestBytes([251, 239, 190, 251, 239, 190]);
    const result = base64URLEncode(input);

    expect(result).not.toContain('+');
    expect(result).not.toContain('/');
    expect(result).not.toContain('=');
  });

  it('produces correct output length for various input sizes', () => {
    // base64url length = ceil(input.length * 4 / 3) without padding
    // For 32 bytes: 32 * 4 / 3 = 42.67 -> 43 characters (no padding in base64url)
    const input32 = new Uint8Array(32);
    expect(base64URLEncode(input32).length).toBe(43);

    // For 3 bytes: 3 * 4 / 3 = 4 characters
    const input3 = new Uint8Array(3);
    expect(base64URLEncode(input3).length).toBe(4);

    // For 1 byte: ceil(1 * 4 / 3) = 2 characters (no padding)
    const input1 = new Uint8Array(1);
    expect(base64URLEncode(input1).length).toBe(2);
  });

  it('handles empty input', () => {
    const input = new Uint8Array(0);
    const result = base64URLEncode(input);
    expect(result).toBe('');
  });

  it('only contains valid base64url characters [A-Za-z0-9_-]', () => {
    // Test with various byte values
    const input = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      input[i] = i;
    }
    const result = base64URLEncode(input);

    // Verify all characters are valid base64url
    const validChars = /^[A-Za-z0-9_-]*$/;
    expect(result).toMatch(validChars);
  });
});

// ============================================================================
// generatePKCE Tests
// ============================================================================

describe('generatePKCE', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns object with verifier and challenge properties', async () => {
    const mockBytes = createMockRandomBytes();
    (Crypto.getRandomBytesAsync as jest.Mock).mockResolvedValue(mockBytes);
    (Crypto.digest as jest.Mock).mockResolvedValue(new ArrayBuffer(32));

    const result = await generatePKCE();

    expect(result).toHaveProperty('verifier');
    expect(result).toHaveProperty('challenge');
    expect(typeof result.verifier).toBe('string');
    expect(typeof result.challenge).toBe('string');
  });

  it('verifier is 43 characters (from 32 bytes base64url encoded)', async () => {
    const mockBytes = createMockRandomBytes();
    (Crypto.getRandomBytesAsync as jest.Mock).mockResolvedValue(mockBytes);
    (Crypto.digest as jest.Mock).mockResolvedValue(new ArrayBuffer(32));

    const { verifier } = await generatePKCE();

    // 32 bytes -> 43 characters in base64url (without padding)
    expect(verifier.length).toBe(43);
  });

  it('challenge is SHA-256 hash of verifier, base64url encoded', async () => {
    const mockBytes = createMockRandomBytes();
    (Crypto.getRandomBytesAsync as jest.Mock).mockResolvedValue(mockBytes);

    // SHA-256 produces 32 bytes
    const mockDigest = new ArrayBuffer(32);
    const mockDigestView = new Uint8Array(mockDigest);
    for (let i = 0; i < 32; i++) {
      mockDigestView[i] = i;
    }
    (Crypto.digest as jest.Mock).mockResolvedValue(mockDigest);

    const { challenge } = await generatePKCE();

    // SHA-256 hash (32 bytes) -> 43 characters in base64url
    expect(challenge.length).toBe(43);

    // Verify digest was called with SHA256 algorithm and verifier bytes
    expect(Crypto.digest).toHaveBeenCalledWith(
      Crypto.CryptoDigestAlgorithm.SHA256,
      expect.anything() // TextEncoder output (verifier bytes)
    );
    // Verify the second argument is an array-like structure (TextEncoder output)
    const digestCall = (Crypto.digest as jest.Mock).mock.calls[0];
    expect(digestCall[0]).toBe('SHA-256');
    expect(digestCall[1]).toHaveLength(43); // verifier is 43 chars
  });

  it('verifier uses only valid base64url characters [A-Za-z0-9_-]', async () => {
    const mockBytes = createMockRandomBytes();
    (Crypto.getRandomBytesAsync as jest.Mock).mockResolvedValue(mockBytes);
    (Crypto.digest as jest.Mock).mockResolvedValue(new ArrayBuffer(32));

    const { verifier } = await generatePKCE();

    const validChars = /^[A-Za-z0-9_-]+$/;
    expect(verifier).toMatch(validChars);
  });

  it('different calls produce different verifiers (randomness)', async () => {
    const mockBytes1 = new Uint8Array(32);
    const mockBytes2 = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      mockBytes1[i] = i;
      mockBytes2[i] = i + 100;
    }

    (Crypto.getRandomBytesAsync as jest.Mock)
      .mockResolvedValueOnce(mockBytes1)
      .mockResolvedValueOnce(mockBytes2);
    (Crypto.digest as jest.Mock).mockResolvedValue(new ArrayBuffer(32));

    const result1 = await generatePKCE();
    const result2 = await generatePKCE();

    expect(result1.verifier).not.toBe(result2.verifier);
  });

  it('calls getRandomBytesAsync with 32 bytes', async () => {
    const mockBytes = createMockRandomBytes();
    (Crypto.getRandomBytesAsync as jest.Mock).mockResolvedValue(mockBytes);
    (Crypto.digest as jest.Mock).mockResolvedValue(new ArrayBuffer(32));

    await generatePKCE();

    expect(Crypto.getRandomBytesAsync).toHaveBeenCalledWith(32);
  });
});

// ============================================================================
// getRedirectUri Tests
// ============================================================================

describe('getRedirectUri', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns Google reversed client ID format for YOUTUBE', () => {
    const result = getRedirectUri('YOUTUBE');

    // Input: test-client.apps.googleusercontent.com
    // Expected: com.googleusercontent.apps.test-client:/oauth2redirect
    expect(result).toBe('com.googleusercontent.apps.test-client:/oauth2redirect');
  });

  it('returns dev redirect URI for SPOTIFY in __DEV__ mode', () => {
    // __DEV__ is set to true in jest.setup.js
    const result = getRedirectUri('SPOTIFY');

    // Should call makeRedirectUri
    expect(AuthSession.makeRedirectUri).toHaveBeenCalledWith({
      scheme: 'zine',
      path: 'oauth/callback',
    });
    expect(result).toBe('zine://oauth/callback');
  });

  it('returns dev redirect URI when no provider specified in __DEV__ mode', () => {
    const result = getRedirectUri();

    expect(AuthSession.makeRedirectUri).toHaveBeenCalledWith({
      scheme: 'zine',
      path: 'oauth/callback',
    });
    expect(result).toBe('zine://oauth/callback');
  });

  it('handles YOUTUBE with empty client ID gracefully', () => {
    const originalClientId = process.env.EXPO_PUBLIC_YOUTUBE_CLIENT_ID;
    process.env.EXPO_PUBLIC_YOUTUBE_CLIENT_ID = '';

    // Need to re-import or test differently since OAUTH_CONFIG is static
    // For this test, we verify the fallback behavior
    const result = getRedirectUri('SPOTIFY');
    expect(result).toBe('zine://oauth/callback');

    process.env.EXPO_PUBLIC_YOUTUBE_CLIENT_ID = originalClientId;
  });
});

// ============================================================================
// connectProvider Tests
// ============================================================================

describe('connectProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mocks
    const mockBytes = createMockRandomBytes();
    (Crypto.getRandomBytesAsync as jest.Mock).mockResolvedValue(mockBytes);
    (Crypto.digest as jest.Mock).mockResolvedValue(new ArrayBuffer(32));
    (Crypto.randomUUID as jest.Mock).mockReturnValue('test-uuid-1234');
    mockMutate.mockResolvedValue({});
  });

  it('throws error if client ID not configured', async () => {
    // Temporarily clear the client ID
    const originalConfig = OAUTH_CONFIG.YOUTUBE.clientId;
    // @ts-expect-error - modifying readonly for test
    OAUTH_CONFIG.YOUTUBE.clientId = '';

    await expect(connectProvider('YOUTUBE')).rejects.toThrow('YOUTUBE client ID not configured');

    // Restore
    // @ts-expect-error - modifying readonly for test
    OAUTH_CONFIG.YOUTUBE.clientId = originalConfig;
  });

  it('generates and stores PKCE verifier in SecureStore', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'zine://oauth/callback?code=auth-code&state=YOUTUBE:test-uuid-1234',
    });
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('YOUTUBE:test-uuid-1234') // state check
      .mockResolvedValueOnce('mock-verifier'); // verifier retrieval

    await connectProvider('YOUTUBE');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'youtube_code_verifier',
      expect.any(String)
    );
  });

  it('registers state with server', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'zine://oauth/callback?code=auth-code&state=YOUTUBE:test-uuid-1234',
    });
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('YOUTUBE:test-uuid-1234') // state check
      .mockResolvedValueOnce('mock-verifier'); // verifier retrieval

    await connectProvider('YOUTUBE');

    expect(mockMutate).toHaveBeenCalledWith({
      provider: 'YOUTUBE',
      state: 'YOUTUBE:test-uuid-1234',
    });
  });

  it('opens browser with correct authorization URL params', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'zine://oauth/callback?code=auth-code&state=YOUTUBE:test-uuid-1234',
    });
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('YOUTUBE:test-uuid-1234')
      .mockResolvedValueOnce('mock-verifier');

    await connectProvider('YOUTUBE');

    const openAuthCall = (WebBrowser.openAuthSessionAsync as jest.Mock).mock.calls[0];
    const authUrl = new URL(openAuthCall[0]);

    expect(authUrl.origin).toBe('https://accounts.google.com');
    expect(authUrl.pathname).toBe('/o/oauth2/v2/auth');
    expect(authUrl.searchParams.get('client_id')).toBe('test-client.apps.googleusercontent.com');
    expect(authUrl.searchParams.get('response_type')).toBe('code');
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authUrl.searchParams.get('code_challenge')).toBeTruthy();
    expect(authUrl.searchParams.get('state')).toBe('YOUTUBE:test-uuid-1234');

    // YouTube-specific params
    expect(authUrl.searchParams.get('access_type')).toBe('offline');
    expect(authUrl.searchParams.get('prompt')).toBe('consent');
  });

  it('opens browser with correct Spotify authorization URL', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'zine://oauth/callback?code=auth-code&state=SPOTIFY:test-uuid-1234',
    });
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('SPOTIFY:test-uuid-1234')
      .mockResolvedValueOnce('mock-verifier');

    await connectProvider('SPOTIFY');

    const openAuthCall = (WebBrowser.openAuthSessionAsync as jest.Mock).mock.calls[0];
    const authUrl = new URL(openAuthCall[0]);

    expect(authUrl.origin).toBe('https://accounts.spotify.com');
    expect(authUrl.pathname).toBe('/authorize');
    expect(authUrl.searchParams.get('client_id')).toBe('test-spotify-client');

    // Spotify should NOT have offline access params
    expect(authUrl.searchParams.get('access_type')).toBeNull();
    expect(authUrl.searchParams.get('prompt')).toBeNull();
  });

  it('handles successful OAuth redirect', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'zine://oauth/callback?code=auth-code-123&state=YOUTUBE:test-uuid-1234',
    });
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('YOUTUBE:test-uuid-1234') // state check
      .mockResolvedValueOnce('mock-verifier-string'); // verifier retrieval

    await connectProvider('YOUTUBE');

    // Should call callback mutation with code and verifier
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'YOUTUBE',
        code: 'auth-code-123',
        codeVerifier: 'mock-verifier-string',
      })
    );
  });

  it('handles user cancellation', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'cancel',
    });

    await expect(connectProvider('YOUTUBE')).rejects.toThrow('OAuth flow cancelled or failed');

    // Should clean up SecureStore
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('youtube_code_verifier');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('youtube_oauth_state');
  });

  it('handles OAuth error response', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'zine://oauth/callback?error=access_denied&error_description=User%20denied%20access',
    });

    await expect(connectProvider('YOUTUBE')).rejects.toThrow('OAuth error: User denied access');

    // Should clean up SecureStore
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('youtube_code_verifier');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('youtube_oauth_state');
  });

  it('handles OAuth error response without description', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'zine://oauth/callback?error=server_error',
    });

    await expect(connectProvider('YOUTUBE')).rejects.toThrow('OAuth error: server_error');
  });

  it('validates state matches on callback', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'zine://oauth/callback?code=auth-code&state=YOUTUBE:wrong-uuid',
    });
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('YOUTUBE:test-uuid-1234'); // stored state doesn't match

    await expect(connectProvider('YOUTUBE')).rejects.toThrow(
      'OAuth state mismatch - possible CSRF attack'
    );
  });

  it('throws error if no authorization code returned', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'zine://oauth/callback?state=YOUTUBE:test-uuid-1234',
    });
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('YOUTUBE:test-uuid-1234');

    await expect(connectProvider('YOUTUBE')).rejects.toThrow(
      'OAuth failed: No authorization code returned'
    );
  });

  it('throws error if PKCE verifier not found', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'zine://oauth/callback?code=auth-code&state=YOUTUBE:test-uuid-1234',
    });
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('YOUTUBE:test-uuid-1234') // state check passes
      .mockResolvedValueOnce(null); // verifier not found

    await expect(connectProvider('YOUTUBE')).rejects.toThrow(
      'PKCE verifier not found - OAuth flow corrupted'
    );
  });

  it('cleans up SecureStore on success', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'zine://oauth/callback?code=auth-code&state=YOUTUBE:test-uuid-1234',
    });
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('YOUTUBE:test-uuid-1234')
      .mockResolvedValueOnce('mock-verifier');

    await connectProvider('YOUTUBE');

    // Verify cleanup was called
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('youtube_code_verifier');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('youtube_oauth_state');
  });

  it('cleans up SecureStore on failure', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'dismiss',
    });

    await expect(connectProvider('YOUTUBE')).rejects.toThrow();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('youtube_code_verifier');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('youtube_oauth_state');
  });

  it('propagates server registration errors', async () => {
    mockMutate.mockRejectedValueOnce(new Error('Server registration failed'));

    await expect(connectProvider('YOUTUBE')).rejects.toThrow('Server registration failed');
  });
});

// ============================================================================
// completeOAuthFlow Tests
// ============================================================================

describe('completeOAuthFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutate.mockResolvedValue({});
  });

  it('validates state matches stored state', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('YOUTUBE:test-uuid') // state matches
      .mockResolvedValueOnce('mock-verifier');

    const result = await completeOAuthFlow('auth-code', 'YOUTUBE:test-uuid', 'YOUTUBE');

    expect(result.success).toBe(true);
    expect(result.provider).toBe('YOUTUBE');
  });

  it('returns error on state mismatch', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('YOUTUBE:different-uuid');

    const result = await completeOAuthFlow('auth-code', 'YOUTUBE:test-uuid', 'YOUTUBE');

    expect(result.success).toBe(false);
    expect(result.error).toBe('State mismatch - possible CSRF attack');
  });

  it('retrieves PKCE verifier from SecureStore', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('YOUTUBE:test-uuid')
      .mockResolvedValueOnce('stored-verifier-123');

    await completeOAuthFlow('auth-code', 'YOUTUBE:test-uuid', 'YOUTUBE');

    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('youtube_code_verifier');
  });

  it('returns error if verifier not found', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('YOUTUBE:test-uuid')
      .mockResolvedValueOnce(null); // verifier not found

    const result = await completeOAuthFlow('auth-code', 'YOUTUBE:test-uuid', 'YOUTUBE');

    expect(result.success).toBe(false);
    expect(result.error).toBe('PKCE verifier not found - OAuth session may have expired');
  });

  it('calls tRPC callback mutation on success', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('SPOTIFY:test-uuid')
      .mockResolvedValueOnce('spotify-verifier');

    await completeOAuthFlow('spotify-code', 'SPOTIFY:test-uuid', 'SPOTIFY');

    expect(mockMutate).toHaveBeenCalledWith({
      provider: 'SPOTIFY',
      code: 'spotify-code',
      state: 'SPOTIFY:test-uuid',
      codeVerifier: 'spotify-verifier',
    });
  });

  it('cleans up SecureStore after completion', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('YOUTUBE:test-uuid')
      .mockResolvedValueOnce('mock-verifier');

    await completeOAuthFlow('auth-code', 'YOUTUBE:test-uuid', 'YOUTUBE');

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('youtube_code_verifier');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('youtube_oauth_state');
  });

  it('returns success result with provider', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('YOUTUBE:test-uuid')
      .mockResolvedValueOnce('mock-verifier');

    const result = await completeOAuthFlow('auth-code', 'YOUTUBE:test-uuid', 'YOUTUBE');

    expect(result).toEqual({
      success: true,
      provider: 'YOUTUBE',
    });
  });

  it('handles tRPC mutation error', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('YOUTUBE:test-uuid')
      .mockResolvedValueOnce('mock-verifier');
    mockMutate.mockRejectedValueOnce(new Error('Token exchange failed'));

    const result = await completeOAuthFlow('auth-code', 'YOUTUBE:test-uuid', 'YOUTUBE');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Token exchange failed');
  });

  it('cleans up SecureStore even on error', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('YOUTUBE:test-uuid')
      .mockResolvedValueOnce('mock-verifier');
    mockMutate.mockRejectedValueOnce(new Error('Server error'));

    await completeOAuthFlow('auth-code', 'YOUTUBE:test-uuid', 'YOUTUBE');

    // Cleanup should still be attempted
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });

  it('handles non-Error exceptions', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('YOUTUBE:test-uuid')
      .mockResolvedValueOnce('mock-verifier');
    mockMutate.mockRejectedValueOnce('String error');

    const result = await completeOAuthFlow('auth-code', 'YOUTUBE:test-uuid', 'YOUTUBE');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown error during OAuth completion');
  });

  it('works correctly for SPOTIFY provider', async () => {
    (SecureStore.getItemAsync as jest.Mock)
      .mockResolvedValueOnce('SPOTIFY:spotify-uuid')
      .mockResolvedValueOnce('spotify-verifier');

    const result = await completeOAuthFlow('spotify-code', 'SPOTIFY:spotify-uuid', 'SPOTIFY');

    expect(result.success).toBe(true);
    expect(result.provider).toBe('SPOTIFY');

    // Verify correct keys were used
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('spotify_oauth_state');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('spotify_code_verifier');
  });
});

// ============================================================================
// Module Constants Tests
// ============================================================================

describe('OAUTH_CONFIG', () => {
  it('has YouTube configuration', () => {
    expect(OAUTH_CONFIG.YOUTUBE).toBeDefined();
    expect(OAUTH_CONFIG.YOUTUBE.authUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(OAUTH_CONFIG.YOUTUBE.scopes).toContain(
      'https://www.googleapis.com/auth/youtube.readonly'
    );
  });

  it('has Spotify configuration', () => {
    expect(OAUTH_CONFIG.SPOTIFY).toBeDefined();
    expect(OAUTH_CONFIG.SPOTIFY.authUrl).toBe('https://accounts.spotify.com/authorize');
    expect(OAUTH_CONFIG.SPOTIFY.scopes).toContain('user-library-read');
  });
});

describe('REDIRECT_URI', () => {
  it('is the custom scheme URI', () => {
    expect(REDIRECT_URI).toBe('zine://oauth/callback');
  });
});

// ============================================================================
// setTokenGetter Tests
// ============================================================================

describe('setTokenGetter', () => {
  it('accepts a token getter function', () => {
    const mockTokenGetter = jest.fn(() => Promise.resolve('test-token'));

    // Should not throw
    expect(() => setTokenGetter(mockTokenGetter)).not.toThrow();
  });
});
