/**
 * OAuthCallbackHandler - Deep link handler for OAuth callbacks
 *
 * This provider component intercepts deep links to zine://oauth/callback
 * and completes the OAuth flow by:
 * 1. Parsing the callback URL to extract code, state, and provider
 * 2. Calling completeOAuthFlow() to exchange the code for tokens
 * 3. Navigating to success/error screens based on the result
 *
 * Handles both:
 * - Cold start: App was killed, opened via deep link (Linking.getInitialURL)
 * - Warm start: App in background, opened via deep link (Linking.addEventListener)
 */

import { useEffect, useRef, type ReactNode } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { completeOAuthFlow, type OAuthProvider } from '../lib/oauth';
import { oauthLogger } from '../lib/logger';

// ============================================================================
// Types
// ============================================================================

interface OAuthCallbackHandlerProps {
  /**
   * Called when OAuth flow completes successfully.
   * @param provider - The provider that was connected (YOUTUBE or SPOTIFY)
   */
  onSuccess?: (provider: string) => void;

  /**
   * Called when OAuth flow fails.
   * @param error - Error message describing what went wrong
   */
  onError?: (error: string) => void;

  /**
   * Child components to render.
   */
  children: ReactNode;
}

interface ParsedOAuthCallback {
  code: string;
  state: string;
  provider: OAuthProvider;
}

// ============================================================================
// URL Parsing
// ============================================================================

/**
 * Parse OAuth callback URL and extract provider from state.
 *
 * The state parameter format is "PROVIDER:uuid" where:
 * - PROVIDER is 'YOUTUBE' or 'SPOTIFY' (used to retrieve correct SecureStore keys)
 * - uuid is the random component for CSRF protection
 *
 * This design allows the cold-start handler to know which provider's
 * code_verifier and oauth_state to retrieve from SecureStore.
 *
 * @param url - The full callback URL (e.g., zine://oauth/callback?code=xxx&state=YOUTUBE:uuid)
 * @returns Parsed callback data or null if URL is not a valid OAuth callback
 */
function parseOAuthCallback(url: string): ParsedOAuthCallback | null {
  try {
    const parsed = Linking.parse(url);
    if (!parsed.path?.includes('oauth/callback')) return null;

    // Convert custom scheme to HTTPS for URL parsing
    // zine://oauth/callback -> https://zine.app/oauth/callback
    const urlObj = new URL(url.replace('zine://', 'https://zine.app/'));
    const code = urlObj.searchParams.get('code');
    const state = urlObj.searchParams.get('state');

    if (!code || !state) return null;

    // Extract provider from state (format: "PROVIDER:uuid")
    const [provider] = state.split(':') as [OAuthProvider, string];
    if (!['YOUTUBE', 'SPOTIFY'].includes(provider)) {
      oauthLogger.error('Invalid provider in state', { provider });
      return null;
    }

    return { code, state, provider };
  } catch (e) {
    oauthLogger.error('Failed to parse callback URL', { error: e });
    return null;
  }
}

// ============================================================================
// Provider Component
// ============================================================================

/**
 * Provider component that handles OAuth deep link callbacks.
 *
 * Wrap your app (or relevant screens) with this provider to enable
 * automatic OAuth callback handling for both cold and warm starts.
 *
 * @example
 * ```tsx
 * // In your app layout
 * <OAuthCallbackHandler
 *   onSuccess={(provider) => {
 *     console.log(`Connected to ${provider}`);
 *   }}
 *   onError={(error) => {
 *     console.error('OAuth failed:', error);
 *   }}
 * >
 *   <Stack />
 * </OAuthCallbackHandler>
 * ```
 */
export function OAuthCallbackHandler({ onSuccess, onError, children }: OAuthCallbackHandlerProps) {
  const router = useRouter();

  // Track processed URLs to prevent duplicate processing
  // This can happen if the same URL triggers both initial URL and event listener
  const processedUrls = useRef<Set<string>>(new Set());

  /**
   * Process an OAuth callback URL.
   *
   * This function:
   * 1. Checks if URL was already processed (prevents duplicates)
   * 2. Parses the URL to extract code, state, and provider
   * 3. Calls completeOAuthFlow to exchange code for tokens
   * 4. Navigates based on success/error
   * 5. Invokes the appropriate callback (onSuccess/onError)
   */
  const processCallback = async (url: string) => {
    // Prevent duplicate processing
    if (processedUrls.current.has(url)) {
      return;
    }
    processedUrls.current.add(url);

    const params = parseOAuthCallback(url);
    if (!params) {
      // Not an OAuth callback URL, ignore
      return;
    }

    try {
      // Complete the OAuth flow
      // Pass provider so completeOAuthFlow can:
      // 1. Retrieve the correct PKCE verifier from SecureStore (`${provider}_code_verifier`)
      // 2. Retrieve the correct state from SecureStore (`${provider}_oauth_state`)
      // 3. Call the correct tRPC procedure with the provider
      const result = await completeOAuthFlow(params.code, params.state, params.provider);

      if (result.success) {
        onSuccess?.(params.provider);
        // Navigate to home/index on success
        // TODO(zine-x4x3): Update to '/settings/connections' when subscriptions routes are added
        router.replace('/');
      } else {
        onError?.(result.error || 'OAuth failed');
        // Navigate to home with error state
        // TODO(zine-x4x3): Update to '/subscriptions/connect/error' when that route exists
        router.replace('/');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      onError?.(message);
      router.replace('/');
    }
  };

  useEffect(() => {
    // Handle cold start: app was killed, opened via deep link
    const checkInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        await processCallback(initialUrl);
      }
    };
    checkInitialUrl();

    // Handle warm start: app in background, opened via deep link
    const subscription = Linking.addEventListener('url', (event) => {
      processCallback(event.url);
    });

    // Cleanup listener on unmount
    return () => subscription.remove();
  }, []);

  return <>{children}</>;
}
