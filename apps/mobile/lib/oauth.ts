/**
 * OAuth configuration and PKCE utilities for mobile OAuth flows.
 *
 * This module provides:
 * - OAuth configuration constants for YouTube and Spotify
 * - PKCE (Proof Key for Code Exchange) generation utilities
 * - Redirect URI helpers for dev/prod environments
 *
 * Security requirements:
 * - Verifier MUST be 43-128 characters (we generate 43 from 32 random bytes)
 * - Challenge is SHA-256 hash of verifier, base64url encoded
 * - Uses expo-crypto for cryptographically secure random bytes
 */

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../../worker/src/trpc/router';
import { API_URL } from './trpc';

// CRITICAL: Call at module level to handle auth session completion
// This is required for expo-web-browser to properly complete the OAuth flow
WebBrowser.maybeCompleteAuthSession();

// ============================================================================
// Vanilla tRPC Client for Imperative Calls
// ============================================================================

/**
 * Token getter function type for auth header injection.
 * Set by the auth provider when the user is authenticated.
 */
type TokenGetter = () => Promise<string | null>;

let _getToken: TokenGetter | null = null;

/**
 * Set the token getter function for tRPC authentication.
 * This should be called by the auth provider when the user logs in.
 *
 * @param getter - Function that returns the current auth token
 */
export function setTokenGetter(getter: TokenGetter): void {
  _getToken = getter;
}

/**
 * Vanilla tRPC client for use outside of React components.
 *
 * This client is used for imperative OAuth operations like `connectProvider`
 * which need to make tRPC calls outside of the React render cycle.
 *
 * Note: The auth token getter must be set via `setTokenGetter` before making calls.
 */
const vanillaClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/trpc`,
      transformer: superjson,
      headers: async () => {
        if (_getToken) {
          const token = await _getToken();
          if (token) {
            return { Authorization: `Bearer ${token}` };
          }
        }
        return {};
      },
    }),
  ],
});

// ============================================================================
// OAuth Configuration
// ============================================================================

/**
 * OAuth configuration for supported providers.
 * Client IDs are loaded from environment variables.
 */
export const OAUTH_CONFIG = {
  YOUTUBE: {
    clientId: process.env.EXPO_PUBLIC_YOUTUBE_CLIENT_ID ?? '',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  },
  SPOTIFY: {
    clientId: process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? '',
    authUrl: 'https://accounts.spotify.com/authorize',
    scopes: ['user-library-read'],
  },
} as const;

/**
 * Supported OAuth provider types.
 */
export type OAuthProvider = keyof typeof OAUTH_CONFIG;

// ============================================================================
// Redirect URI Configuration
// ============================================================================

/**
 * Custom scheme redirect URI for OAuth callbacks.
 * Used in production builds.
 */
export const REDIRECT_URI = 'zine://oauth/callback';

/**
 * Returns the appropriate redirect URI based on environment.
 *
 * For Google OAuth with Expo Go, we need to use the reversed client ID scheme
 * that Google provides for iOS apps. This is the only way to get OAuth working
 * in Expo Go without a custom development build.
 *
 * @returns The redirect URI to use for OAuth flows
 */
export function getRedirectUri(): string {
  if (__DEV__) {
    // For Expo Go development, we need to use a scheme that Google accepts.
    // The iOS client ID from Google comes with a reversed client ID scheme
    // Format: com.googleusercontent.apps.CLIENT_ID_PREFIX
    // You can find this in Google Cloud Console under your iOS OAuth client
    const clientId = process.env.EXPO_PUBLIC_YOUTUBE_CLIENT_ID ?? '';
    if (clientId) {
      // Extract the part before .apps.googleusercontent.com and reverse it
      // e.g., "123456789-abcdef.apps.googleusercontent.com" -> "com.googleusercontent.apps.123456789-abcdef"
      const match = clientId.match(/^(.+)\.apps\.googleusercontent\.com$/);
      if (match) {
        const reversedClientId = `com.googleusercontent.apps.${match[1]}`;
        return `${reversedClientId}:/oauth2redirect`;
      }
    }
    // Fallback to custom scheme
    return AuthSession.makeRedirectUri({ scheme: 'zine' });
  }
  return REDIRECT_URI;
}

// ============================================================================
// PKCE Utilities
// ============================================================================

/**
 * Convert a Uint8Array to a base64url-encoded string.
 *
 * Base64url encoding is base64 with URL-safe characters:
 * - '+' replaced with '-'
 * - '/' replaced with '_'
 * - Padding '=' removed
 *
 * This encoding is required by PKCE (RFC 7636) for the code verifier
 * and code challenge.
 *
 * @param buffer - Raw bytes to encode
 * @returns Base64url-encoded string
 *
 * @example
 * ```typescript
 * const bytes = new Uint8Array([72, 101, 108, 108, 111]);
 * const encoded = base64URLEncode(bytes);
 * // Result: "SGVsbG8" (no padding, URL-safe characters)
 * ```
 */
export function base64URLEncode(buffer: Uint8Array): string {
  // Convert bytes to base64 using btoa
  // btoa expects a string where each char represents a byte value (0-255)
  const base64 = btoa(String.fromCharCode(...buffer));

  // Convert to base64url:
  // - Replace '+' with '-' (URL-safe)
  // - Replace '/' with '_' (URL-safe)
  // - Remove '=' padding (not needed for PKCE)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Generate PKCE code verifier and challenge.
 *
 * MUST be generated on client - this is the core security guarantee of PKCE.
 * The verifier is a cryptographically random string, and the challenge is
 * the SHA-256 hash of the verifier, both base64url-encoded.
 *
 * Security requirements (RFC 7636):
 * - Verifier must be 43-128 characters (we use 43 from 32 random bytes)
 * - Challenge must be SHA-256 hash of verifier, base64url-encoded
 * - Both must use base64url encoding (not standard base64)
 *
 * @returns Promise resolving to object containing verifier and challenge strings
 *
 * @example
 * ```typescript
 * const { verifier, challenge } = await generatePKCE();
 * // verifier: 43-character cryptographically random string
 * // challenge: SHA-256 hash of verifier, base64url encoded
 *
 * // Store verifier securely for token exchange
 * await SecureStore.setItemAsync('code_verifier', verifier);
 *
 * // Send challenge with authorization request
 * authUrl.searchParams.set('code_challenge', challenge);
 * authUrl.searchParams.set('code_challenge_method', 'S256');
 * ```
 */
export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  // Generate 32 random bytes using cryptographically secure random number generator
  // 32 bytes -> 43 characters when base64url encoded (without padding)
  // This meets the RFC 7636 requirement of 43-128 characters
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const verifier = base64URLEncode(randomBytes);

  // Create SHA-256 hash of the verifier string
  // The verifier must be encoded as UTF-8 bytes before hashing
  const verifierBytes = new TextEncoder().encode(verifier);
  const digestBuffer = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, verifierBytes);

  // Convert ArrayBuffer to Uint8Array and base64url encode
  const challenge = base64URLEncode(new Uint8Array(digestBuffer));

  return { verifier, challenge };
}

// ============================================================================
// SecureStore Key Helpers
// ============================================================================

/**
 * Generate SecureStore key for code verifier.
 * Format: "{provider}_code_verifier" (lowercase provider)
 */
function getVerifierKey(provider: OAuthProvider): string {
  return `${provider.toLowerCase()}_code_verifier`;
}

/**
 * Generate SecureStore key for OAuth state.
 * Format: "{provider}_oauth_state" (lowercase provider)
 */
function getStateKey(provider: OAuthProvider): string {
  return `${provider.toLowerCase()}_oauth_state`;
}

// ============================================================================
// Connect Provider Flow
// ============================================================================

/**
 * Complete OAuth flow for connecting a provider.
 *
 * This function orchestrates the entire OAuth PKCE flow:
 * 1. Generate PKCE verifier and challenge (client-side security)
 * 2. Store verifier in SecureStore for later token exchange
 * 3. Generate state with provider prefix for CSRF protection
 * 4. Register state with server via tRPC
 * 5. Build provider-specific authorization URL
 * 6. Open browser for user authorization
 * 7. Handle redirect and exchange code for tokens
 * 8. Clean up SecureStore
 *
 * State Format: "PROVIDER:uuid"
 * - Provider prefix allows callback handler to know which SecureStore keys to use
 * - UUID portion provides CSRF protection
 *
 * @param provider - The OAuth provider to connect ('YOUTUBE' or 'SPOTIFY')
 * @throws Error if OAuth flow is cancelled, fails, or state mismatch occurs
 *
 * @example
 * ```typescript
 * try {
 *   await connectProvider('YOUTUBE');
 *   // Success - connection is now stored on server
 * } catch (error) {
 *   console.error('OAuth failed:', error.message);
 * }
 * ```
 */
export async function connectProvider(provider: OAuthProvider): Promise<void> {
  console.log(`[OAuth] Starting ${provider} connection flow`);
  const config = OAUTH_CONFIG[provider];

  // Validate client ID is configured
  if (!config.clientId) {
    const error = `${provider} client ID not configured. Check EXPO_PUBLIC_${provider}_CLIENT_ID.`;
    console.error(`[OAuth] ${error}`);
    throw new Error(error);
  }

  // STEP 1: Generate PKCE (CLIENT-SIDE - security requirement)
  // The verifier is a cryptographically random string, the challenge is its SHA-256 hash
  console.log('[OAuth] Generating PKCE challenge');
  const { verifier, challenge } = await generatePKCE();

  // Store verifier securely - needed for token exchange after redirect
  await SecureStore.setItemAsync(getVerifierKey(provider), verifier);

  // STEP 2: Generate state (CLIENT-SIDE) - encode provider for callback identification
  // The state parameter serves dual purposes:
  // 1. CSRF protection (validated by server)
  // 2. Provider identification (needed by cold-start callback handler)
  // Format: "PROVIDER:uuid" - allows parseOAuthCallback to know which SecureStore keys to use
  const state = `${provider}:${Crypto.randomUUID()}`;

  // STEP 3: Register state with server (CSRF protection only)
  // The server stores state → userId mapping with TTL for validation on callback
  //
  // Note: Using type assertion because the subscriptions.connections router
  // is not yet integrated into AppRouter. This will be fixed when the
  // backend router is updated to include: subscriptions: { connections: connectionsRouter }
  console.log('[OAuth] Registering state with server');
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (vanillaClient as any).subscriptions.connections.registerState.mutate({
      provider,
      state,
    });
    console.log('[OAuth] State registered successfully');
  } catch (error) {
    console.error('[OAuth] Failed to register state:', error);
    throw error;
  }

  // Store state for validation after redirect
  await SecureStore.setItemAsync(getStateKey(provider), state);

  // STEP 4: Build auth URL (CLIENT-SIDE)
  const redirectUri = getRedirectUri();
  console.log('[OAuth] Using redirect URI:', redirectUri);
  const authUrl = new URL(config.authUrl);
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', config.scopes.join(' '));
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // YouTube-specific: request offline access for refresh token
  // Without these params, Google may not issue a refresh token
  if (provider === 'YOUTUBE') {
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
  }

  // STEP 5: Open browser for user authorization
  // openAuthSessionAsync handles the browser session and waits for redirect
  console.log('[OAuth] Opening browser for authorization');
  const result = await WebBrowser.openAuthSessionAsync(authUrl.toString(), redirectUri);
  console.log('[OAuth] Browser result:', result.type);

  if (result.type !== 'success') {
    // Clean up stored values on cancellation/failure
    await SecureStore.deleteItemAsync(getVerifierKey(provider));
    await SecureStore.deleteItemAsync(getStateKey(provider));
    throw new Error('OAuth flow cancelled or failed');
  }

  // STEP 6: Handle redirect and extract params
  const redirectUrl = new URL(result.url);
  const code = redirectUrl.searchParams.get('code');
  const returnedState = redirectUrl.searchParams.get('state');

  // Check for error from provider
  const errorParam = redirectUrl.searchParams.get('error');
  if (errorParam) {
    const errorDescription = redirectUrl.searchParams.get('error_description');
    await SecureStore.deleteItemAsync(getVerifierKey(provider));
    await SecureStore.deleteItemAsync(getStateKey(provider));
    throw new Error(`OAuth error: ${errorDescription || errorParam}`);
  }

  // Validate state matches (client-side check - server also validates)
  const storedState = await SecureStore.getItemAsync(getStateKey(provider));
  if (returnedState !== storedState) {
    await SecureStore.deleteItemAsync(getVerifierKey(provider));
    await SecureStore.deleteItemAsync(getStateKey(provider));
    throw new Error('OAuth state mismatch - possible CSRF attack');
  }

  if (!code) {
    await SecureStore.deleteItemAsync(getVerifierKey(provider));
    await SecureStore.deleteItemAsync(getStateKey(provider));
    throw new Error('OAuth failed: No authorization code returned');
  }

  // Retrieve stored verifier
  const storedVerifier = await SecureStore.getItemAsync(getVerifierKey(provider));
  if (!storedVerifier) {
    await SecureStore.deleteItemAsync(getStateKey(provider));
    throw new Error('PKCE verifier not found - OAuth flow corrupted');
  }

  // STEP 7: Send code + verifier to server for token exchange
  // Server will exchange the code using the verifier and store encrypted tokens
  // NOTE: redirectUri must be sent to server because it must match the one used in auth request
  console.log('[OAuth] Exchanging code for tokens');
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (vanillaClient as any).subscriptions.connections.callback.mutate({
      provider,
      code,
      state: returnedState,
      codeVerifier: storedVerifier,
      redirectUri,
    });
    console.log('[OAuth] Token exchange successful');
  } catch (error) {
    console.error('[OAuth] Token exchange failed:', error);
    throw error;
  }

  // STEP 8: Cleanup secure storage
  await SecureStore.deleteItemAsync(getVerifierKey(provider));
  await SecureStore.deleteItemAsync(getStateKey(provider));
}

// ============================================================================
// OAuth Flow Completion (Cold Start Handler)
// ============================================================================

/**
 * Result of completing the OAuth flow.
 */
export interface OAuthFlowResult {
  success: boolean;
  provider?: 'YOUTUBE' | 'SPOTIFY';
  error?: string;
}

/**
 * Complete the OAuth flow by exchanging the authorization code for tokens.
 *
 * This function is called after the OAuth provider redirects back to the app
 * with an authorization code. It validates the state, retrieves the PKCE
 * verifier, and sends both to the server for token exchange.
 *
 * Flow:
 * 1. Validate state matches stored state in SecureStore
 * 2. Retrieve PKCE verifier from SecureStore
 * 3. Call tRPC connections.callback mutation for token exchange
 * 4. Cleanup SecureStore (delete verifier and state)
 * 5. Return success/error result
 *
 * @param code - Authorization code from OAuth provider
 * @param state - Full state string (format: "PROVIDER:uuid")
 * @param provider - Provider extracted from state (for consistency check)
 * @returns Result indicating success or failure
 *
 * @example
 * ```typescript
 * // Called from OAuthCallbackHandler after redirect
 * const result = await completeOAuthFlow(code, state, 'YOUTUBE');
 * if (result.success) {
 *   router.replace('/subscriptions');
 * } else {
 *   showError(result.error);
 * }
 * ```
 */
export async function completeOAuthFlow(
  code: string,
  state: string,
  provider: 'YOUTUBE' | 'SPOTIFY'
): Promise<OAuthFlowResult> {
  const providerKey = provider.toLowerCase();

  try {
    // 1. Validate state matches stored state
    const storedState = await SecureStore.getItemAsync(`${providerKey}_oauth_state`);
    if (storedState !== state) {
      return {
        success: false,
        error: 'State mismatch - possible CSRF attack',
      };
    }

    // 2. Retrieve PKCE verifier
    const verifier = await SecureStore.getItemAsync(`${providerKey}_code_verifier`);
    if (!verifier) {
      return {
        success: false,
        error: 'PKCE verifier not found - OAuth session may have expired',
      };
    }

    // 3. Exchange code for tokens via tRPC
    // The server validates the state, exchanges the code using PKCE,
    // and stores encrypted tokens in the database
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (vanillaClient as any).subscriptions.connections.callback.mutate({
      provider,
      code,
      state, // Full state string (PROVIDER:uuid format)
      codeVerifier: verifier,
    });

    // 4. Clean up SecureStore
    await Promise.all([
      SecureStore.deleteItemAsync(`${providerKey}_code_verifier`),
      SecureStore.deleteItemAsync(`${providerKey}_oauth_state`),
    ]);

    return {
      success: true,
      provider,
    };
  } catch (error) {
    // Clean up SecureStore even on error to prevent stale state
    await Promise.all([
      SecureStore.deleteItemAsync(`${providerKey}_code_verifier`).catch(() => {}),
      SecureStore.deleteItemAsync(`${providerKey}_oauth_state`).catch(() => {}),
    ]).catch(() => {});

    const message =
      error instanceof Error ? error.message : 'Unknown error during OAuth completion';
    return {
      success: false,
      error: message,
    };
  }
}
