# Subscriptions Feature: Frontend Specification

> **Scope**: React Native / Expo mobile app implementation for the subscriptions feature.
> For backend API contracts and server-side implementation, see [backend-spec.md](./backend-spec.md).

## Table of Contents

- [Styling Convention](#styling-convention)

1. [Mobile OAuth Flow with PKCE](#1-mobile-oauth-flow-with-pkce)
2. [Navigation Structure](#2-navigation-structure)
3. [Settings Screen](#3-settings-screen)
   - [3.1 Data Hooks](#31-data-hooks)
4. [Onboarding Flow](#4-onboarding-flow)
5. [Channel Selection](#5-channel-selection)
6. [Inbox Item Display](#6-inbox-item-display)
   - [6.2 InboxItem Type Definition](#62-inboxitem-type-definition)
7. [Deep Linking for OAuth](#7-deep-linking-for-oauth)
8. [Error Boundaries](#8-error-boundaries)
9. [Offline Handling](#9-offline-handling)
   - [9.0 Data Architecture Overview](#90-data-architecture-overview)
   - [9.3 Offline Action Queue](#93-offline-action-queue)
   - [9.8 tRPC/Offline Queue Integration Architecture](#98-trpcoffline-queue-integration-architecture)
10. [tRPC API Contract](#10-trpc-api-contract)

---

### Styling Convention

> ⚠️ **IMPORTANT: Read Before Implementing**
>
> This specification uses a mix of `StyleSheet` and Tailwind-style `className` syntax in code examples for brevity and readability.
>
> **Production code MUST use React Native `StyleSheet` with theme tokens** from `@/constants/theme` (`Colors`, `Spacing`, `Radius`, `Typography`, etc.). The codebase does NOT use NativeWind/Tailwind.
>
> The `className` syntax (e.g., `className="flex-1 p-4 bg-gray-100"`) is used in some examples for quick reading but **must be converted** to `StyleSheet` patterns when implementing. For example:
>
> ```typescript
> // Spec example (for readability):
> <View className="flex-1 items-center justify-center p-6">
>
> // Production implementation:
> <View style={styles.container}>
> // ...
> const styles = StyleSheet.create({
>   container: {
>     flex: 1,
>     alignItems: 'center',
>     justifyContent: 'center',
>     padding: Spacing['2xl'], // 24px from theme
>   },
> });
> ```
>
> **Theme Token Reference** (`apps/mobile/constants/theme.ts`):
> | Token | Values |
> |-------|--------|
> | `Colors.light` / `Colors.dark` | Semantic colors (text, background, card, primary, success, error, etc.) |
> | `Spacing` | xs: 4, sm: 8, md: 12, lg: 16, xl: 20, 2xl: 24, 3xl: 32, 4xl: 40, 5xl: 48 |
> | `Radius` | xs: 4, sm: 8, md: 12, lg: 16, xl: 20, 2xl: 24, full: 9999 |
> | `Typography` | Font size/weight/lineHeight presets (bodyLarge, titleMedium, etc.) |
> | `Shadows` | Platform-consistent shadow definitions (sm, md, lg, xl) |

---

## 1. Mobile OAuth Flow with PKCE

The mobile client is responsible for PKCE generation and auth URL construction. The server only provides state registration (CSRF protection) and token exchange.

### 1.1 OAuth Configuration

```typescript
// apps/mobile/lib/oauth.ts

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { trpc } from './trpc';

// OAuth configuration (from app config, NOT from server)
const OAUTH_CONFIG = {
  YOUTUBE: {
    clientId: process.env.EXPO_PUBLIC_YOUTUBE_CLIENT_ID!,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
  },
  SPOTIFY: {
    clientId: process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID!,
    authUrl: 'https://accounts.spotify.com/authorize',
    scopes: ['user-library-read'],
  },
} as const;

const REDIRECT_URI = 'zine://oauth/callback';
```

### 1.2 Connect Provider Flow

```typescript
/**
 * Complete OAuth flow for connecting a provider.
 *
 * PKCE Flow Ownership:
 * - Mobile: Generates PKCE, state, and builds auth URL
 * - Server: Registers state (CSRF), exchanges code for tokens
 */
async function connectProvider(provider: 'YOUTUBE' | 'SPOTIFY'): Promise<void> {
  const config = OAUTH_CONFIG[provider];

  // STEP 1: Generate PKCE (CLIENT-SIDE - security requirement)
  const { verifier, challenge } = await generatePKCE();

  // Store verifier securely - needed for token exchange
  await SecureStore.setItemAsync(`${provider.toLowerCase()}_code_verifier`, verifier);

  // STEP 2: Generate state (CLIENT-SIDE) - encode provider for callback identification
  // The state parameter serves dual purposes:
  // 1. CSRF protection (validated by server)
  // 2. Provider identification (needed by cold-start callback handler)
  // Format: "PROVIDER:uuid" - allows parseOAuthCallback to know which SecureStore keys to use
  const state = `${provider}:${crypto.randomUUID()}`;

  // STEP 3: Register state with server (CSRF protection only)
  await trpc.subscriptions.connections.registerState.mutate({
    provider,
    state,
  });

  // Store state for validation after redirect
  await SecureStore.setItemAsync(`${provider.toLowerCase()}_oauth_state`, state);

  // STEP 4: Build auth URL (CLIENT-SIDE)
  const authUrl = new URL(config.authUrl);
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', config.scopes.join(' '));
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // YouTube-specific: request offline access for refresh token
  if (provider === 'YOUTUBE') {
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
  }

  // STEP 5: Open browser for user authorization
  const result = await WebBrowser.openAuthSessionAsync(authUrl.toString(), REDIRECT_URI);

  if (result.type !== 'success') {
    throw new Error('OAuth flow cancelled or failed');
  }

  // STEP 6: Handle redirect and exchange code
  const redirectUrl = new URL(result.url);
  const code = redirectUrl.searchParams.get('code');
  const returnedState = redirectUrl.searchParams.get('state');

  // Validate state matches (client-side check)
  const storedState = await SecureStore.getItemAsync(`${provider.toLowerCase()}_oauth_state`);
  if (returnedState !== storedState) {
    throw new Error('OAuth state mismatch - possible CSRF attack');
  }

  if (!code) {
    const error = redirectUrl.searchParams.get('error');
    throw new Error(`OAuth failed: ${error || 'No code returned'}`);
  }

  // Retrieve stored verifier
  const storedVerifier = await SecureStore.getItemAsync(`${provider.toLowerCase()}_code_verifier`);
  if (!storedVerifier) {
    throw new Error('PKCE verifier not found');
  }

  // STEP 7: Send code + verifier to server for token exchange
  await trpc.subscriptions.connections.callback.mutate({
    provider,
    code,
    state: returnedState,
    codeVerifier: storedVerifier,
  });

  // STEP 8: Cleanup secure storage
  await SecureStore.deleteItemAsync(`${provider.toLowerCase()}_code_verifier`);
  await SecureStore.deleteItemAsync(`${provider.toLowerCase()}_oauth_state`);
}
```

### 1.3 PKCE Generation

```typescript
/**
 * Convert a Uint8Array to a base64url-encoded string.
 *
 * Base64url encoding is base64 with URL-safe characters:
 * - '+' replaced with '-'
 * - '/' replaced with '_'
 * - Padding '=' removed
 *
 * @param buffer - Raw bytes to encode
 * @returns Base64url-encoded string
 */
function base64URLEncode(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate PKCE code verifier and challenge.
 *
 * MUST be generated on client - this is the core security guarantee of PKCE.
 * The verifier is a cryptographically random string, and the challenge is
 * the SHA-256 hash of the verifier, both base64url-encoded.
 *
 * Security requirements:
 * - Verifier must be 43-128 characters (we use 43 from 32 random bytes)
 * - Challenge must be SHA-256 hash of verifier, base64url-encoded
 * - Both must use base64url encoding (not standard base64)
 *
 * @returns Object containing verifier and challenge strings
 */
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  // Generate 32 random bytes -> 43 character base64url string
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const verifier = base64URLEncode(randomBytes);

  // SHA256 hash of verifier, then base64url encode
  // Note: Crypto.digest returns ArrayBuffer, which we convert to Uint8Array
  const digestBuffer = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    new TextEncoder().encode(verifier)
  );
  const challenge = base64URLEncode(new Uint8Array(digestBuffer));

  return { verifier, challenge };
}
```

### 1.4 Complete OAuth Flow

The `completeOAuthFlow` function is called by the `OAuthCallbackHandler` (Section 7.6) after the OAuth provider redirects back to the app. It handles state validation, PKCE verifier retrieval, and token exchange.

```typescript
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
 * @param code - Authorization code from OAuth provider
 * @param state - Full state string (format: "PROVIDER:uuid")
 * @param provider - Provider extracted from state (for consistency check)
 * @returns Result indicating success or failure
 */
export async function completeOAuthFlow(
  code: string,
  state: string,
  provider: 'YOUTUBE' | 'SPOTIFY'
): Promise<OAuthFlowResult> {
  try {
    // 1. Validate state matches stored state
    const storedState = await SecureStore.getItemAsync(`${provider.toLowerCase()}_oauth_state`);
    if (storedState !== state) {
      return { success: false, error: 'State mismatch - possible CSRF attack' };
    }

    // 2. Retrieve PKCE verifier
    const verifier = await SecureStore.getItemAsync(`${provider.toLowerCase()}_code_verifier`);
    if (!verifier) {
      return { success: false, error: 'PKCE verifier not found' };
    }

    // 3. Extract the UUID portion of state for server
    const [, stateId] = state.split(':');

    // 4. Exchange code for tokens via tRPC
    await trpc.subscriptions.connections.callback.mutate({
      provider,
      code,
      state: stateId,
      codeVerifier: verifier,
    });

    // 5. Clean up SecureStore
    await SecureStore.deleteItemAsync(`${provider.toLowerCase()}_code_verifier`);
    await SecureStore.deleteItemAsync(`${provider.toLowerCase()}_oauth_state`);

    return { success: true, provider };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}
```

### 1.5 Server Responsibility Summary

| Server should NOT...                     | Reason                                         |
| ---------------------------------------- | ---------------------------------------------- |
| Generate PKCE verifier/challenge         | Defeats PKCE security model                    |
| Return a pre-built auth URL              | Client needs to embed its own PKCE challenge   |
| Store the PKCE verifier                  | Only client should have it until exchange      |
| Know the OAuth client secret for Spotify | PKCE replaces client secret for public clients |

> **Note**: YouTube still requires `client_secret` on the server for token exchange, even with PKCE. Spotify's PKCE flow is pure and doesn't need the client secret.

---

## 2. Navigation Structure

```
(tabs)/
├── index.tsx        # Home (with Settings gear icon in header)
├── inbox.tsx        # Inbox (includes subscription items)
├── library.tsx      # Library/Bookmarks
└── explore.tsx      # Explore -> Subscriptions tab

settings/
├── _layout.tsx      # Stack navigator configuration
├── index.tsx        # Settings main screen
├── connections.tsx  # Manage connected providers
├── account.tsx      # Account settings
└── about.tsx        # App info, version, etc.

subscriptions/
├── index.tsx        # Subscription management
├── connect/
│   ├── youtube.tsx  # YouTube OAuth flow
│   └── spotify.tsx  # Spotify OAuth flow
├── discover/
│   └── [provider].tsx  # Browse available channels/shows
└── [id].tsx         # Subscription detail
```

### 2.1 Settings Layout

The settings route group requires a `_layout.tsx` file to configure the Stack navigator for settings screens.

```typescript
// apps/mobile/app/settings/_layout.tsx

import { Stack } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function SettingsLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: '600',
        },
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Settings',
        }}
      />
      <Stack.Screen
        name="connections"
        options={{
          title: 'Connected Accounts',
        }}
      />
      <Stack.Screen
        name="account"
        options={{
          title: 'Account',
        }}
      />
      <Stack.Screen
        name="about"
        options={{
          title: 'About',
        }}
      />
    </Stack>
  );
}
```

### 2.2 Settings Access

Settings is accessed via a **gear icon button in the Home screen header** (top-right).

**Why not a tab?**

- Settings is not frequently accessed (connect once, rarely visit again)
- Saves tab bar space for primary content areas (Home, Inbox, Library)
- Consistent with apps like Apple Music, Podcasts, Photos

```typescript
// apps/mobile/app/(tabs)/index.tsx

import { Pressable } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

function SettingsIcon({ size = 24, color = '#000' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </Svg>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/settings')}
              style={{ padding: 8, marginRight: 8 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <SettingsIcon size={24} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      {/* ... rest of HomeScreen ... */}
    </>
  );
}
```

---

## 3. Settings Screen

The Settings screen provides access to connected accounts, subscription management, and account settings. It displays the status of OAuth provider connections (YouTube, Spotify) and allows users to navigate to detailed management views.

> **Prerequisites**: This component uses data hooks defined in [Section 3.1 Data Hooks](#31-data-hooks):
>
> - `useConnections()` - fetches OAuth connection status for each provider
> - `useSubscriptions()` - fetches the user's subscription list for count display
>
> Ensure these hooks are implemented before building this screen.

### 3.0.1 Required Imports

```typescript
// apps/mobile/app/settings/index.tsx

// React Native core components
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';

// Navigation
import { useRouter } from 'expo-router';

// Safe area handling for notched devices
import { SafeAreaView } from 'react-native-safe-area-context';

// Theme tokens - see Styling Convention section
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';

// Hooks
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useConnections } from '@/hooks/use-connections'; // Section 3.1.1
import { useSubscriptions } from '@/hooks/use-subscriptions'; // Section 3.1.2
import { useAuth } from '@/providers/auth-provider';
```

### 3.0.2 Component Implementation

```typescript
export default function SettingsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { signOut } = useAuth();

  const { data: connections } = useConnections();
  const { subscriptions } = useSubscriptions();

  const youtubeConnection = connections?.find((c) => c.provider === 'YOUTUBE');
  const spotifyConnection = connections?.find((c) => c.provider === 'SPOTIFY');
  // subscriptions is already the items array from the hook
  const activeSubscriptionCount = subscriptions?.length ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
        {/* Connected Accounts Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          CONNECTED ACCOUNTS
        </Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          {/* YouTube */}
          <Pressable
            style={styles.row}
            onPress={() => router.push('/settings/connections?provider=youtube')}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.providerIcon}>🎬</Text>
              <View>
                <Text style={[styles.rowTitle, { color: colors.text }]}>YouTube</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                  {youtubeConnection?.status === 'ACTIVE'
                    ? youtubeConnection.providerUserId || 'Connected'
                    : 'Not connected'}
                </Text>
              </View>
            </View>
            <Text style={[styles.rowStatus, {
              color: youtubeConnection?.status === 'ACTIVE' ? colors.success : colors.textTertiary
            }]}>
              {youtubeConnection?.status === 'ACTIVE' ? 'Connected' : 'Add'}
            </Text>
          </Pressable>

          {/* Spotify */}
          <Pressable
            style={styles.row}
            onPress={() => router.push('/settings/connections?provider=spotify')}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.providerIcon}>🎧</Text>
              <View>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Spotify</Text>
                <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                  {spotifyConnection?.status === 'ACTIVE'
                    ? spotifyConnection.providerUserId || 'Connected'
                    : 'Not connected'}
                </Text>
              </View>
            </View>
            <Text style={[styles.rowStatus, {
              color: spotifyConnection?.status === 'ACTIVE' ? colors.success : colors.textTertiary
            }]}>
              {spotifyConnection?.status === 'ACTIVE' ? 'Connected' : 'Add'}
            </Text>
          </Pressable>
        </View>

        {/* Subscriptions Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          SUBSCRIPTIONS
        </Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Pressable
            style={styles.row}
            onPress={() => router.push('/subscriptions')}
          >
            <View style={styles.rowLeft}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                Manage Subscriptions
              </Text>
              <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
                {activeSubscriptionCount} active subscription{activeSubscriptionCount !== 1 ? 's' : ''}
              </Text>
            </View>
            <Text style={{ color: colors.textTertiary }}>→</Text>
          </Pressable>
        </View>

        {/* Account Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          ACCOUNT
        </Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Pressable style={styles.row} onPress={signOut}>
            <Text style={[styles.rowTitle, { color: colors.error }]}>
              Sign Out
            </Text>
          </Pressable>
        </View>

        {/* About Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          ABOUT
        </Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <View style={styles.row}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Version</Text>
            <Text style={{ color: colors.textSecondary }}>1.0.0 (42)</Text>
          </View>
          <Pressable style={styles.row} onPress={() => { /* Open Terms */ }}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Terms of Service</Text>
            <Text style={{ color: colors.textTertiary }}>→</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => { /* Open Privacy */ }}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Privacy Policy</Text>
            <Text style={{ color: colors.textTertiary }}>→</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  section: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  providerIcon: {
    fontSize: 24,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  rowStatus: {
    fontSize: 14,
    fontWeight: '500',
  },
});
```

---

## 3.1 Data Hooks

The Settings screen and other components rely on data hooks that wrap tRPC queries. These hooks provide a consistent interface for accessing connection and subscription data.

### 3.1.1 useConnections Hook

````typescript
// apps/mobile/hooks/use-connections.ts

import { trpc } from '../lib/trpc';

/**
 * Connection type returned from the backend.
 * Represents an OAuth connection to a provider (YouTube, Spotify, etc.)
 */
export interface Connection {
  id: string;
  provider: 'YOUTUBE' | 'SPOTIFY';
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  providerUserId: string | null;
  createdAt: string;
  lastSyncAt: string | null;
}

/**
 * Hook to fetch the user's connected provider accounts.
 *
 * @returns Query result with connections array
 *
 * @example
 * ```tsx
 * const { data: connections, isLoading } = useConnections();
 * const youtubeConnection = connections?.find(c => c.provider === 'YOUTUBE');
 * ```
 */
export function useConnections() {
  return trpc.subscriptions.connections.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  });
}
````

### 3.1.2 useSubscriptions Hook (Query-only)

The Settings screen uses a simpler query-only version of `useSubscriptions` for displaying subscription counts. The full version with offline mutation support is defined in [Section 9.5](#95-optimistic-subscriptions-hook).

````typescript
// apps/mobile/hooks/use-subscriptions-query.ts

import { trpc } from '../lib/trpc';

/**
 * Subscription type returned from the backend.
 * Represents a user's subscription to a specific channel/show.
 */
export interface Subscription {
  id: string;
  provider: 'YOUTUBE' | 'SPOTIFY';
  providerChannelId: string;
  name: string;
  imageUrl: string | null;
  status: 'ACTIVE' | 'PAUSED';
  createdAt: string;
  lastItemAt: string | null;
}

/**
 * Subscriptions list response shape from tRPC.
 */
export interface SubscriptionsResponse {
  items: Subscription[];
  nextCursor?: string;
}

/**
 * Simple query hook for fetching subscriptions.
 * Use this for read-only scenarios (e.g., Settings screen).
 * For mutation support with offline handling, use the full
 * useSubscriptions hook from Section 9.5.
 *
 * @returns Query result with subscriptions data
 *
 * @example
 * ```tsx
 * const { data: subscriptions } = useSubscriptions();
 * const count = subscriptions?.items?.length ?? 0;
 * ```
 */
export function useSubscriptions() {
  return trpc.subscriptions.list.useQuery(
    {},
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 24 * 60 * 60 * 1000, // 24 hours
    }
  );
}
````

### 3.1.3 Expected tRPC Endpoint Responses

| Endpoint                         | Return Type                                      | Description                   |
| -------------------------------- | ------------------------------------------------ | ----------------------------- |
| `subscriptions.connections.list` | `Connection[]`                                   | Array of provider connections |
| `subscriptions.list`             | `{ items: Subscription[], nextCursor?: string }` | Paginated subscriptions list  |

---

## 4. Onboarding Flow

```
┌─────────────────────────────────────┐
│                                     │
│  Connect your favorite sources      │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  🎬  YouTube                │    │
│  │  Connect your subscriptions │    │
│  │                    [Connect] │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  🎧  Spotify                │    │
│  │  Connect your podcasts      │    │
│  │                    [Connect] │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  More coming soon...        │    │
│  │  RSS, Substack, X           │    │
│  └─────────────────────────────┘    │
│                                     │
│                      [Skip for now] │
└─────────────────────────────────────┘
```

---

## 5. Channel Selection

After OAuth, show user's subscriptions for selective import:

```
┌─────────────────────────────────────┐
│ ← Select YouTube Channels           │
├─────────────────────────────────────┤
│                                     │
│  Your subscriptions on YouTube      │
│  Select channels to follow in Zine  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ 🔍 Search channels...         │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ [✓] MKBHD                   │    │
│  │     Tech reviews            │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ [ ] Fireship               │    │
│  │     Code in 100 seconds     │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ [✓] Lex Fridman             │    │
│  │     Long-form interviews    │    │
│  └─────────────────────────────┘    │
│                                     │
│  Selected: 2 channels               │
│                                     │
│           [Add Selected Channels]   │
└─────────────────────────────────────┘
```

---

## 6. Inbox Item Display

### 6.1 Item Layout

Subscription items in inbox show source attribution:

```
┌─────────────────────────────────────┐
│  INBOX                              │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │ 📺 MKBHD · 2 hours ago      │    │
│  │                             │    │
│  │ iPhone 16 Review: Everything│    │
│  │ You Need to Know            │    │
│  │                             │    │
│  │ 12:34 · VIDEO               │    │
│  │                             │    │
│  │     [Archive]  [Bookmark]   │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │ 🎧 Lex Fridman · Yesterday  │    │
│  │                             │    │
│  │ #400 - Sam Altman on AGI    │    │
│  │                             │    │
│  │ 3:42:15 · PODCAST           │    │
│  │                             │    │
│  │     [Archive]  [Bookmark]   │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

### 6.2 InboxItem Type Definition

The `InboxItem` interface represents items displayed in the Inbox screen. It extends the base `ItemWithUserState` type (defined in `apps/mobile/hooks/use-items.ts`) with subscription-specific source attribution fields.

````typescript
// apps/mobile/types/inbox.ts

import type { ItemWithUserState } from '../hooks/use-items';

/**
 * Source attribution information for subscription-delivered content.
 * Provides context about where an inbox item originated from.
 */
export interface SourceAttribution {
  /** The subscription that delivered this item */
  subscriptionId: string;
  /** Display name of the source (channel/show name) */
  sourceName: string;
  /** Provider type for icon/styling purposes */
  provider: 'YOUTUBE' | 'SPOTIFY';
  /** Optional thumbnail/avatar URL for the source */
  sourceImageUrl?: string | null;
}

/**
 * Inbox item with full context for rendering in the inbox list.
 *
 * This interface extends ItemWithUserState with subscription source
 * attribution, enabling the inbox to show where each item came from
 * (e.g., "📺 MKBHD · 2 hours ago").
 *
 * Relationship to existing types:
 * - Extends `ItemWithUserState` from `apps/mobile/hooks/use-items.ts`
 * - `item` contains content metadata (title, duration, thumbnailUrl, etc.)
 * - `userItem` contains user-specific state (inbox/archived/bookmarked)
 * - `source` (optional) provides subscription attribution for display
 *
 * @example
 * ```tsx
 * const renderItem = ({ item }: { item: InboxItem }) => (
 *   <View>
 *     {item.source && (
 *       <Text>{item.source.provider === 'YOUTUBE' ? '📺' : '🎧'} {item.source.sourceName}</Text>
 *     )}
 *     <Text>{item.item.title}</Text>
 *   </View>
 * );
 * ```
 */
export interface InboxItem extends ItemWithUserState {
  /**
   * Source attribution for subscription-delivered items.
   * Present when the item was delivered via a subscription.
   * May be absent for manually-added items or items from other sources.
   */
  source?: SourceAttribution;
}

/**
 * Response shape from the inbox items query.
 * Used by `useInboxItems` hook and the Inbox screen.
 */
export interface InboxItemsResponse {
  items: InboxItem[];
  nextCursor?: string;
  hasMore: boolean;
}
````

#### Type Relationship Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ InboxItem                                                   │
├─────────────────────────────────────────────────────────────┤
│ extends ItemWithUserState (from hooks/use-items.ts)         │
│                                                             │
│ ├── item: {                                                 │
│ │     id, title, summary, creator, publisher,               │
│ │     thumbnailUrl, canonicalUrl, contentType,              │
│ │     duration, publishedAt                                 │
│ │   }                                                       │
│ │                                                           │
│ ├── userItem: {                                             │
│ │     id, itemId, state,                                    │
│ │     ingestedAt, bookmarkedAt                              │
│ │   }                                                       │
│ │                                                           │
│ └── source?: {                          ← NEW               │
│       subscriptionId, sourceName,                           │
│       provider, sourceImageUrl                              │
│     }                                                       │
└─────────────────────────────────────────────────────────────┘
```

#### Usage Notes

1. **Backend Contract**: The `items.inbox` tRPC endpoint should return `InboxItem[]` with the `source` field populated for subscription-delivered content.

2. **Backward Compatibility**: The `source` field is optional, allowing the inbox to display items from various origins (subscriptions, manual adds, imports).

3. **UI Rendering**: Use the `source.provider` field to select appropriate icons (📺 for YouTube, 🎧 for Spotify) and the `source.sourceName` for attribution text.

---

### 6.3 Pull to Refresh

#### 6.3.1 Required Imports

```typescript
// apps/mobile/app/(tabs)/inbox.tsx

import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  RefreshControl,
  RefreshControlProps,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useInboxItems } from '@/hooks/use-items-trpc';
import type { InboxItem } from '@/types/inbox';
```

#### 6.3.2 State Components

These helper components handle loading, error, and empty states. They can be defined inline or extracted to `components/ui/state-views.tsx` for reuse across screens.

```typescript
// Inline state components (or extract to @/components/ui/state-views.tsx)

interface StateColorsProps {
  colors: typeof Colors.light;
}

/**
 * Loading state shown while fetching initial data
 */
function LoadingState({ colors }: StateColorsProps) {
  return (
    <View style={styles.centeredContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.stateText, { color: colors.textSecondary }]}>
        Loading items...
      </Text>
    </View>
  );
}

/**
 * Error state shown when fetch fails
 */
function ErrorState({ colors, message }: StateColorsProps & { message: string }) {
  return (
    <View style={styles.centeredContainer}>
      <Text style={styles.stateEmoji}>⚠️</Text>
      <Text style={[styles.stateTitle, { color: colors.text }]}>
        Something went wrong
      </Text>
      <Text style={[styles.stateText, { color: colors.textSecondary }]}>
        {message}
      </Text>
    </View>
  );
}

/**
 * Empty state shown when inbox has no items
 */
function EmptyState({ colors }: StateColorsProps) {
  return (
    <View style={styles.centeredContainer}>
      <Text style={styles.stateEmoji}>📭</Text>
      <Text style={[styles.stateTitle, { color: colors.text }]}>
        All caught up!
      </Text>
      <Text style={[styles.stateText, { color: colors.textSecondary }]}>
        New items from your subscriptions will appear here.
      </Text>
    </View>
  );
}
```

#### 6.3.3 Inbox Screen Component

```typescript
export default function InboxScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const { data, isLoading, error, refetch } = useInboxItems();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  // Shared RefreshControl configuration for consistent styling across states
  // This ensures both empty and populated states have identical refresh behavior
  const refreshControlProps: RefreshControlProps = useMemo(
    () => ({
      refreshing: isRefreshing,
      onRefresh: handleRefresh,
      tintColor: colors.primary, // iOS spinner color
      colors: [colors.primary], // Android spinner color(s)
      progressBackgroundColor: colors.background, // Android spinner background
    }),
    [isRefreshing, handleRefresh, colors.primary, colors.background]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Inbox</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {data?.items && data.items.length > 0
              ? `${data.items.length} item${data.items.length === 1 ? '' : 's'} to triage`
              : 'Decide what to keep'}
          </Text>
        </View>

        {isLoading && !isRefreshing ? (
          <LoadingState colors={colors} />
        ) : error ? (
          <ErrorState colors={colors} message={error.message} />
        ) : !data?.items || data.items.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyScrollContent}
            refreshControl={<RefreshControl {...refreshControlProps} />}
          >
            <EmptyState colors={colors} />
          </ScrollView>
        ) : (
          <FlatList
            data={data.items}
            renderItem={({ item }) => <InboxItemCard item={item} />}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl {...refreshControlProps} />}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
```

#### 6.3.4 StyleSheet

```typescript
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  headerTitle: {
    ...Typography.titleLarge,
    fontWeight: '700',
  },
  headerSubtitle: {
    ...Typography.bodyMedium,
    marginTop: Spacing.xs,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  stateEmoji: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  stateTitle: {
    ...Typography.titleMedium,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  stateText: {
    ...Typography.bodyMedium,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  emptyScrollContent: {
    flex: 1,
  },
});
```

#### 6.3.5 Behavior Summary

| Action                   | Result                                                         |
| ------------------------ | -------------------------------------------------------------- |
| Pull down on inbox list  | Refetches inbox items from server                              |
| Pull down on empty inbox | Refetches (may show new items if subscriptions have delivered) |
| Spinner shows            | While refetch is in progress                                   |
| Success                  | List updates with any new/changed items                        |
| Error                    | Shows error toast, list unchanged                              |

> **Note:** Pull-to-refresh only refetches cached inbox data. To force-check a subscription for new content, use the "Sync Now" button.

### 6.4 Sync Now Button

```typescript
// apps/mobile/components/sync-now-button.tsx

import { Pressable, Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { useSyncNow } from '../hooks/use-sync-now';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface SyncNowButtonProps {
  subscriptionId: string;
  lastPolledAt: number | null;
  compact?: boolean;
  onSyncComplete?: (itemsFound: number) => void;
}

export function SyncNowButton({
  subscriptionId,
  lastPolledAt,
  compact = false,
  onSyncComplete,
}: SyncNowButtonProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { syncNow, isLoading, cooldownSeconds, lastResult } = useSyncNow(subscriptionId);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (cooldownSeconds > 0) {
      setCountdown(cooldownSeconds);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [cooldownSeconds]);

  useEffect(() => {
    if (lastResult?.success && lastResult.itemsFound > 0) {
      onSyncComplete?.(lastResult.itemsFound);
    }
  }, [lastResult, onSyncComplete]);

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  const isDisabled = isLoading || countdown > 0;

  if (compact) {
    return (
      <Pressable
        onPress={syncNow}
        disabled={isDisabled}
        style={[
          syncButtonStyles.compactButton,
          { backgroundColor: isDisabled ? colors.backgroundSecondary : colors.primaryLight },
        ]}
      >
        {isLoading ? (
          <>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[syncButtonStyles.compactText, { color: colors.primary }]}>Syncing...</Text>
          </>
        ) : countdown > 0 ? (
          <Text style={[syncButtonStyles.compactText, { color: colors.textSecondary }]}>
            {formatCountdown(countdown)}
          </Text>
        ) : (
          <>
            <Text style={{ color: colors.primary }}>⟳</Text>
            <Text style={[syncButtonStyles.compactText, { color: colors.primary }]}>Sync</Text>
          </>
        )}
      </Pressable>
    );
  }

  // Full version for detail view
  return (
    <View style={syncButtonStyles.fullContainer}>
      <Pressable
        onPress={syncNow}
        disabled={isDisabled}
        style={[
          syncButtonStyles.fullButton,
          { backgroundColor: isDisabled ? colors.backgroundSecondary : colors.primary },
        ]}
      >
        {isLoading ? (
          <>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={syncButtonStyles.fullButtonText}>Syncing...</Text>
          </>
        ) : countdown > 0 ? (
          <Text style={[syncButtonStyles.fullButtonText, { color: colors.textSecondary }]}>
            Wait {formatCountdown(countdown)}
          </Text>
        ) : (
          <>
            <Text style={syncButtonStyles.fullButtonEmoji}>🔄</Text>
            <Text style={syncButtonStyles.fullButtonText}>Sync Now</Text>
          </>
        )}
      </Pressable>

      {lastResult && (
        <Text
          style={[
            syncButtonStyles.resultText,
            { color: lastResult.success ? colors.success : colors.error },
          ]}
        >
          {lastResult.message}
        </Text>
      )}
    </View>
  );
}

const syncButtonStyles = StyleSheet.create({
  compactButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  compactText: {
    fontSize: 12,
  },
  fullContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fullButton: {
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  fullButtonText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  fullButtonEmoji: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  resultText: {
    fontSize: 14,
  },
});
```

| State                 | Button Appearance | User Feedback              |
| --------------------- | ----------------- | -------------------------- |
| Ready                 | Blue, enabled     | "Sync Now" or "⟳ Sync"     |
| Loading               | Blue with spinner | "Syncing..."               |
| Cooldown              | Gray, disabled    | Countdown "4:32"           |
| Success (items found) | N/A               | Toast: "Found 3 new items" |
| Success (no items)    | N/A               | Toast: "No new content"    |
| Error                 | N/A               | Toast: "Sync failed"       |

### 6.5 useSyncNow Hook

The `useSyncNow` hook provides manual sync functionality for individual subscriptions, handling rate limiting and providing user feedback.

```typescript
// apps/mobile/hooks/use-sync-now.ts

import { useState, useCallback, useEffect } from 'react';
import { trpc } from '../lib/trpc';

interface SyncResult {
  success: boolean;
  itemsFound?: number;
  message: string;
}

/**
 * Hook for triggering manual sync of a subscription.
 *
 * Features:
 * - Calls syncNow mutation with rate limiting awareness
 * - Tracks 5-minute cooldown per subscription (enforced by backend)
 * - Provides last result for UI feedback
 * - Handles TOO_MANY_REQUESTS errors gracefully
 *
 * @param subscriptionId - The subscription to sync
 * @returns Object with syncNow function, loading state, cooldown, and last result
 */
export function useSyncNow(subscriptionId: string) {
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const mutation = trpc.subscriptions.syncNow.useMutation({
    onSuccess: (data) => {
      setLastResult({
        success: true,
        itemsFound: data.itemsFound,
        message:
          data.itemsFound > 0
            ? `Found ${data.itemsFound} new item${data.itemsFound === 1 ? '' : 's'}`
            : 'No new content',
      });
      setCooldownSeconds(300); // 5 minutes
    },
    onError: (error) => {
      if (error.data?.code === 'TOO_MANY_REQUESTS') {
        // Parse cooldown from error message or use default
        const match = error.message.match(/(\d+)\s*seconds?/i);
        const seconds = match ? parseInt(match[1], 10) : 300;
        setCooldownSeconds(seconds);
        setLastResult({
          success: false,
          message: `Rate limited. Try again in ${Math.ceil(seconds / 60)} minutes.`,
        });
      } else {
        setLastResult({
          success: false,
          message: error.message || 'Sync failed',
        });
      }
    },
  });

  // Countdown timer for cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const timer = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const syncNow = useCallback(() => {
    if (cooldownSeconds > 0 || mutation.isPending) return;
    mutation.mutate({ subscriptionId });
  }, [subscriptionId, cooldownSeconds, mutation]);

  return {
    syncNow,
    isLoading: mutation.isPending,
    cooldownSeconds,
    lastResult,
  };
}
```

#### Usage Example

```typescript
// In a component
import { useSyncNow } from '../hooks/use-sync-now';

function SubscriptionDetail({ subscription }) {
  const { syncNow, isLoading, cooldownSeconds, lastResult } = useSyncNow(subscription.id);

  return (
    <View>
      <SyncNowButton
        subscriptionId={subscription.id}
        lastPolledAt={subscription.lastPolledAt}
        onSyncComplete={(count) => console.log(`Synced ${count} items`)}
      />

      {/* Or use the hook directly */}
      <Pressable onPress={syncNow} disabled={isLoading || cooldownSeconds > 0}>
        <Text>{isLoading ? 'Syncing...' : cooldownSeconds > 0 ? `Wait ${cooldownSeconds}s` : 'Sync'}</Text>
      </Pressable>

      {lastResult && (
        <Text style={{ color: lastResult.success ? 'green' : 'red' }}>
          {lastResult.message}
        </Text>
      )}
    </View>
  );
}
```

#### Return Values

| Property          | Type                 | Description                                             |
| ----------------- | -------------------- | ------------------------------------------------------- |
| `syncNow`         | `() => void`         | Function to trigger sync (no-op if loading or cooldown) |
| `isLoading`       | `boolean`            | True while sync mutation is in progress                 |
| `cooldownSeconds` | `number`             | Seconds remaining in rate limit cooldown (0 = ready)    |
| `lastResult`      | `SyncResult \| null` | Result of last sync attempt for UI feedback             |

#### SyncResult Interface

| Property     | Type                  | Description                                 |
| ------------ | --------------------- | ------------------------------------------- |
| `success`    | `boolean`             | Whether the sync completed successfully     |
| `itemsFound` | `number \| undefined` | Number of new items found (on success only) |
| `message`    | `string`              | Human-readable status message               |

#### Integration with tRPC

This hook consumes the `subscriptions.syncNow` mutation defined in [Section 10.3](#103-subscription-endpoints):

```typescript
// Backend response shape
interface SyncNowOutput {
  success: boolean;
  itemsFound: number;
  message?: string;
}
```

---

## 7. Deep Linking for OAuth

### 7.1 app.json Configuration

```json
{
  "expo": {
    "name": "zine",
    "slug": "zine",
    "scheme": "zine",
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "app.zine.mobile",
      "associatedDomains": ["applinks:zine.app", "applinks:api.zine.app"]
    },
    "android": {
      "package": "app.zine.mobile",
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "https",
              "host": "zine.app",
              "pathPrefix": "/oauth/callback"
            },
            {
              "scheme": "https",
              "host": "api.zine.app",
              "pathPrefix": "/oauth/callback"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        },
        {
          "action": "VIEW",
          "data": [
            {
              "scheme": "zine",
              "host": "oauth",
              "pathPrefix": "/callback"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    "plugins": ["expo-router", "expo-secure-store", "expo-web-browser"]
  }
}
```

> **Note on Deep Linking Configuration**:
>
> - The `scheme` property at the root level (line 5) is sufficient for custom URL scheme handling in Expo SDK 50+
> - `expo-linking` is NOT a valid Expo plugin—it's a core Expo module that doesn't require plugin configuration
> - `expo-web-browser` is included because the OAuth flow uses `WebBrowser.openAuthSessionAsync()` for the browser-based authentication
> - For Expo SDK 50+, no additional linking plugin configuration is needed; the `scheme` at root level automatically registers the custom URL scheme

### 7.2 Redirect URI Patterns

| Environment | Custom Scheme           | Universal Link                            |
| ----------- | ----------------------- | ----------------------------------------- |
| Development | `zine://oauth/callback` | N/A (use custom scheme)                   |
| Staging     | `zine://oauth/callback` | `https://staging.zine.app/oauth/callback` |
| Production  | `zine://oauth/callback` | `https://zine.app/oauth/callback`         |

### 7.3 Universal Links (iOS)

Host at `https://zine.app/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.app.zine.mobile",
        "paths": ["/oauth/callback/*", "/auth/*"]
      }
    ]
  },
  "webcredentials": {
    "apps": ["TEAM_ID.app.zine.mobile"]
  }
}
```

### 7.4 App Links (Android)

Host at `https://zine.app/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "app.zine.mobile",
      "sha256_cert_fingerprints": ["YOUR_RELEASE_KEY_FINGERPRINT", "YOUR_DEBUG_KEY_FINGERPRINT"]
    }
  }
]
```

### 7.5 expo-web-browser Integration

```typescript
// apps/mobile/lib/oauth.ts

import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

// CRITICAL: Call at module level to handle auth session completion
WebBrowser.maybeCompleteAuthSession();

export const REDIRECT_URI = 'zine://oauth/callback';

export function getRedirectUri(): string {
  if (__DEV__) {
    return REDIRECT_URI;
  }
  return 'https://zine.app/oauth/callback';
}
```

### 7.6 Cold Start Handler

```typescript
// apps/mobile/providers/oauth-callback-handler.tsx

import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';

interface OAuthCallbackHandlerProps {
  onSuccess?: (provider: string) => void;
  onError?: (error: string) => void;
  children: React.ReactNode;
}

export function OAuthCallbackHandler({
  onSuccess,
  onError,
  children,
}: OAuthCallbackHandlerProps) {
  const router = useRouter();
  const processedUrls = useRef<Set<string>>(new Set());

  /**
   * Parse OAuth callback URL and extract provider from state.
   *
   * The state parameter format is "PROVIDER:uuid" where:
   * - PROVIDER is 'YOUTUBE' or 'SPOTIFY' (used to retrieve correct SecureStore keys)
   * - uuid is the random component for CSRF protection
   *
   * This design allows the cold-start handler to know which provider's
   * code_verifier and oauth_state to retrieve from SecureStore.
   */
  const parseOAuthCallback = (url: string): {
    code: string;
    state: string;
    provider: 'YOUTUBE' | 'SPOTIFY';
  } | null => {
    try {
      const parsed = Linking.parse(url);
      if (!parsed.path?.includes('oauth/callback')) return null;

      const urlObj = new URL(url.replace('zine://', 'https://zine.app/'));
      const code = urlObj.searchParams.get('code');
      const state = urlObj.searchParams.get('state');

      if (!code || !state) return null;

      // Extract provider from state (format: "PROVIDER:uuid")
      const [provider] = state.split(':') as ['YOUTUBE' | 'SPOTIFY', string];
      if (!['YOUTUBE', 'SPOTIFY'].includes(provider)) {
        console.error('[OAuth] Invalid provider in state:', provider);
        return null;
      }

      return { code, state, provider };
    } catch (e) {
      console.error('[OAuth] Failed to parse callback URL:', e);
    }
    return null;
  };

  const processCallback = async (url: string) => {
    if (processedUrls.current.has(url)) return;
    processedUrls.current.add(url);

    const params = parseOAuthCallback(url);
    if (!params) return;

    try {
      const { completeOAuthFlow } = await import('../lib/oauth');
      // Pass provider to completeOAuthFlow so it can:
      // 1. Retrieve the correct PKCE verifier from SecureStore (`${provider}_code_verifier`)
      // 2. Retrieve the correct state from SecureStore (`${provider}_oauth_state`)
      // 3. Call the correct tRPC procedure with the provider
      const result = await completeOAuthFlow(params.code, params.state, params.provider);

      if (result.success) {
        onSuccess?.(params.provider);
        router.replace('/subscriptions');
      } else {
        onError?.(result.error || 'OAuth failed');
        router.replace({
          pathname: '/subscriptions/connect/error',
          params: { error: result.error },
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      onError?.(message);
    }
  };

  useEffect(() => {
    const checkInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) await processCallback(initialUrl);
    };
    checkInitialUrl();

    const subscription = Linking.addEventListener('url', (event) => {
      processCallback(event.url);
    });

    return () => subscription.remove();
  }, []);

  return <>{children}</>;
}
```

### 7.7 OAuth Error Handling

```typescript
// apps/mobile/lib/oauth-errors.ts

export enum OAuthErrorCode {
  USER_CANCELLED = 'user_cancelled',
  USER_DENIED = 'access_denied',
  STATE_EXPIRED = 'state_expired',
  STATE_MISMATCH = 'state_mismatch',
  STATE_NOT_FOUND = 'state_not_found',
  VERIFIER_NOT_FOUND = 'verifier_not_found',
  NETWORK_ERROR = 'network_error',
  TOKEN_EXCHANGE_FAILED = 'token_exchange_failed',
  PROVIDER_ERROR = 'provider_error',
  INVALID_GRANT = 'invalid_grant',
  INVALID_SCOPE = 'invalid_scope',
  INVALID_REDIRECT = 'invalid_redirect',
  DEEP_LINK_FAILED = 'deep_link_failed',
  SESSION_NOT_FOUND = 'session_not_found',
  UNKNOWN = 'unknown_error',
}

export interface OAuthError {
  code: OAuthErrorCode;
  message: string;
  recoverable: boolean;
  action?: 'retry' | 'reauthorize' | 'contact_support';
}

export function parseOAuthError(error: unknown): OAuthError {
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;

    if (errorObj.error === 'access_denied') {
      return {
        code: OAuthErrorCode.USER_DENIED,
        message: 'You denied access to your account',
        recoverable: true,
        action: 'retry',
      };
    }

    if (errorObj.error === 'invalid_grant') {
      return {
        code: OAuthErrorCode.INVALID_GRANT,
        message: 'Authorization code expired. Please try again.',
        recoverable: true,
        action: 'retry',
      };
    }
  }

  if (typeof error === 'string') {
    if (error.includes('cancelled') || error.includes('cancel')) {
      return {
        code: OAuthErrorCode.USER_CANCELLED,
        message: 'Authorization was cancelled',
        recoverable: true,
        action: 'retry',
      };
    }

    if (error.includes('network') || error.includes('fetch')) {
      return {
        code: OAuthErrorCode.NETWORK_ERROR,
        message: 'Network error. Please check your connection.',
        recoverable: true,
        action: 'retry',
      };
    }

    if (error.includes('state') || error.includes('mismatch')) {
      return {
        code: OAuthErrorCode.STATE_MISMATCH,
        message: 'Security validation failed. Please try again.',
        recoverable: true,
        action: 'retry',
      };
    }
  }

  return {
    code: OAuthErrorCode.UNKNOWN,
    message: typeof error === 'string' ? error : 'An unexpected error occurred',
    recoverable: true,
    action: 'retry',
  };
}
```

### 7.8 Testing Deep Links

```bash
# iOS Simulator - Note: state format is "PROVIDER:uuid"
xcrun simctl openurl booted "zine://oauth/callback?code=test123&state=YOUTUBE:abc-123-uuid"

# Android Emulator
adb shell am start -W -a android.intent.action.VIEW \
  -d "zine://oauth/callback?code=test123&state=YOUTUBE:abc-123-uuid" app.zine.mobile

# Using Expo CLI
npx uri-scheme open "zine://oauth/callback?code=test123&state=YOUTUBE:abc-123-uuid" --ios
npx uri-scheme open "zine://oauth/callback?code=test123&state=SPOTIFY:def-456-uuid" --android

# Verify apple-app-site-association
curl -I https://zine.app/.well-known/apple-app-site-association

# Verify Android App Links
adb shell pm get-app-links app.zine.mobile
```

---

## 8. Error Boundaries

### 8.1 Base Error Boundary

```typescript
// apps/mobile/components/error-boundary.tsx

import { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: unknown[];
  colorScheme?: 'light' | 'dark';
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && this.props.resetKeys) {
      const hasKeyChanged = this.props.resetKeys.some(
        (key, i) => key !== prevProps.resetKeys?.[i]
      );
      if (hasKeyChanged) {
        this.setState({ hasError: false, error: null });
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const colors = Colors[this.props.colorScheme ?? 'light'];

      return (
        <View style={errorBoundaryStyles.container}>
          <Text style={errorBoundaryStyles.emoji}>⚠️</Text>
          <Text style={[errorBoundaryStyles.title, { color: colors.text }]}>
            Something went wrong
          </Text>
          <Text style={[errorBoundaryStyles.message, { color: colors.textSecondary }]}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <Pressable
            onPress={this.handleReset}
            style={[errorBoundaryStyles.button, { backgroundColor: colors.primary }]}
          >
            <Text style={errorBoundaryStyles.buttonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

const errorBoundaryStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  emoji: {
    fontSize: 48,
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.titleMedium,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  message: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  button: {
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '500',
    fontSize: 16,
  },
});
```

### 8.2 Subscription Error Boundary

```typescript
// apps/mobile/components/subscription-error-boundary.tsx

import { ErrorInfo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ErrorBoundary } from './error-boundary';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface SubscriptionErrorBoundaryProps {
  children: React.ReactNode;
  subscriptionId?: string;
  onRetry?: () => void;
}

function SubscriptionErrorFallback({ onRetry }: { onRetry?: () => void }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <View style={[subscriptionErrorStyles.container, { backgroundColor: colors.errorLight }]}>
      <Text style={[subscriptionErrorStyles.title, { color: colors.error }]}>
        Failed to load subscription
      </Text>
      <Text style={[subscriptionErrorStyles.message, { color: colors.error }]}>
        There was a problem displaying this content.
      </Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={[subscriptionErrorStyles.button, { backgroundColor: colors.errorLight }]}
        >
          <Text style={[subscriptionErrorStyles.buttonText, { color: colors.error }]}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

export function SubscriptionErrorBoundary({
  children,
  subscriptionId,
  onRetry,
}: SubscriptionErrorBoundaryProps) {
  const handleError = (error: Error, errorInfo: ErrorInfo) => {
    console.error('[SubscriptionError]', {
      subscriptionId,
      error: error.message,
      stack: errorInfo.componentStack,
    });
  };

  return (
    <ErrorBoundary
      onError={handleError}
      resetKeys={[subscriptionId]}
      fallback={<SubscriptionErrorFallback onRetry={onRetry} />}
    >
      {children}
    </ErrorBoundary>
  );
}

const subscriptionErrorStyles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
  },
  title: {
    fontWeight: '500',
    marginBottom: Spacing.sm,
  },
  message: {
    fontSize: 14,
    marginBottom: Spacing.md,
  },
  button: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  buttonText: {
    fontWeight: '500',
  },
});
```

### 8.3 OAuth Error Boundary

```typescript
// apps/mobile/components/oauth-error-boundary.tsx

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ErrorBoundary } from './error-boundary';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface OAuthErrorFallbackProps {
  provider: 'YOUTUBE' | 'SPOTIFY';
  onRetry?: () => void;
}

function OAuthErrorFallback({ provider, onRetry }: OAuthErrorFallbackProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <View style={oauthErrorStyles.container}>
      <Text style={oauthErrorStyles.emoji}>🔐</Text>
      <Text style={[oauthErrorStyles.title, { color: colors.text }]}>
        Connection Error
      </Text>
      <Text style={[oauthErrorStyles.message, { color: colors.textSecondary }]}>
        We couldn't complete the {provider.toLowerCase()} connection. Please try again.
      </Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={[oauthErrorStyles.button, { backgroundColor: colors.primary }]}
        >
          <Text style={oauthErrorStyles.buttonText}>Try Again</Text>
        </Pressable>
      )}
    </View>
  );
}

export function OAuthErrorBoundary({
  children,
  provider,
  onRetry,
}: {
  children: React.ReactNode;
  provider: 'YOUTUBE' | 'SPOTIFY';
  onRetry?: () => void;
}) {
  return (
    <ErrorBoundary
      onError={(error) => {
        console.error(`[OAuthError:${provider}]`, error.message);
      }}
      fallback={<OAuthErrorFallback provider={provider} onRetry={onRetry} />}
    >
      {children}
    </ErrorBoundary>
  );
}

const oauthErrorStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  emoji: {
    fontSize: 64,
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.titleMedium,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  message: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  button: {
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
});
```

### 8.4 Query Error Boundary

```typescript
// apps/mobile/components/query-error-boundary.tsx

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary } from './error-boundary';
import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

function QueryErrorFallback({ onReset }: { onReset: () => void }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <View style={queryErrorStyles.container}>
      <Text style={[queryErrorStyles.title, { color: colors.text }]}>
        Failed to load data
      </Text>
      <Pressable
        onPress={onReset}
        style={[queryErrorStyles.button, { backgroundColor: colors.primary }]}
      >
        <Text style={queryErrorStyles.buttonText}>Retry</Text>
      </Pressable>
    </View>
  );
}

export function QueryErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary fallback={<QueryErrorFallback onReset={reset} />}>
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

const queryErrorStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  title: {
    ...Typography.titleMedium,
    marginBottom: Spacing.lg,
  },
  button: {
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
});
```

### 8.5 Integration Pattern

```typescript
// apps/mobile/app/subscriptions/index.tsx

import { View, FlatList, StyleSheet } from 'react-native';
import { ErrorBoundary } from '@/components/error-boundary';
import { SubscriptionErrorBoundary } from '@/components/subscription-error-boundary';
import { useSubscriptions } from '@/hooks/use-subscriptions';

export default function SubscriptionsScreen() {
  const { subscriptions, refetch } = useSubscriptions();

  return (
    <ErrorBoundary>
      <View style={styles.container}>
        <FlatList
          data={subscriptions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SubscriptionErrorBoundary subscriptionId={item.id} onRetry={refetch}>
              <SubscriptionRow subscription={item} />
            </SubscriptionErrorBoundary>
          )}
        />
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
```

---

## 9. Offline Handling

> **Architecture Note**: See `docs/zine-tech-stack.md` for the full data architecture.

### 9.0 Data Architecture Overview

This section documents the offline handling strategy for the **subscriptions feature specifically**.

#### Architecture Decision: tRPC + React Query

All data flows through **tRPC with React Query caching**:

| Data Type                           | Sync Strategy        | Reason                                         |
| ----------------------------------- | -------------------- | ---------------------------------------------- |
| Connections (OAuth)                 | tRPC + offline queue | User-initiated, infrequent, security-sensitive |
| Subscriptions (add/remove/pause)    | tRPC + offline queue | User-initiated, infrequent operations          |
| Inbox items                         | tRPC + React Query   | Server-authoritative with optimistic updates   |
| Subscription metadata (name, image) | React Query cache    | Read-heavy, server-authoritative               |

#### Key Patterns

1. **Optimistic Updates**: Mutations update the cache immediately, then sync with server
2. **Stale-While-Revalidate**: Show cached data while fetching fresh data in background
3. **Offline Queue**: Queue mutations when offline, replay when connection restored

### 9.1 Network Status Detection

```typescript
// apps/mobile/hooks/use-network-status.ts

import { useEffect, useState, useCallback } from 'react';
import NetInfo, { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
    type: 'unknown',
  });

  useEffect(() => {
    NetInfo.fetch().then((state: NetInfoState) => {
      setStatus({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      });
    });

    const unsubscribe: NetInfoSubscription = NetInfo.addEventListener((state: NetInfoState) => {
      setStatus({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      });
    });

    return () => unsubscribe();
  }, []);

  return status;
}

export function useIsOnline(): () => Promise<boolean> {
  return useCallback(async () => {
    const state = await NetInfo.fetch();
    return state.isConnected === true && state.isInternetReachable !== false;
  }, []);
}
```

### 9.2 Offline Banner

```typescript
// apps/mobile/components/offline-banner.tsx

import { Text, Animated, StyleSheet } from 'react-native';
import { useEffect, useRef } from 'react';
import { useNetworkStatus } from '../hooks/use-network-status';
import { Colors, Spacing } from '@/constants/theme';

export function OfflineBanner() {
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const slideAnim = useRef(new Animated.Value(-50)).current;

  const isOffline = !isConnected || isInternetReachable === false;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isOffline ? 0 : -50,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOffline, slideAnim]);

  if (!isOffline) return null;

  return (
    <Animated.View
      style={[
        offlineBannerStyles.container,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Text style={offlineBannerStyles.text}>
        You're offline. Changes will sync when you reconnect.
      </Text>
    </Animated.View>
  );
}

const offlineBannerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.light.warning, // Yellow warning color
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    zIndex: 50,
  },
  text: {
    textAlign: 'center',
    color: Colors.light.warningText, // Dark text for contrast on yellow
    fontWeight: '500',
  },
});
```

### 9.3 Offline Action Queue

#### 9.3.0 Architecture: tRPC Client Integration

The offline queue must integrate properly with tRPC's client and React Query's cache to ensure:

1. Queued actions execute through the same tRPC client used by React hooks
2. Query cache is invalidated after queued mutations complete
3. Optimistic updates remain consistent across online/offline transitions

**Problem**: The naive approach of dynamically importing tRPC (`await import('./trpc')`) creates a new client instance disconnected from React Query's cache. This breaks optimistic updates and cache consistency.

**Solution**: Use a singleton tRPC client with a custom offline-aware link chain.

```typescript
// apps/mobile/lib/trpc-offline-client.ts

import { createTRPCClient, httpBatchLink, TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import NetInfo from '@react-native-community/netinfo';
import type { AppRouter } from '@zine/worker/src/trpc/router';

/**
 * Singleton tRPC client for use by the offline queue.
 *
 * This client is separate from the React hooks client but shares
 * the same configuration. It's used by the offline queue to execute
 * mutations when processing queued actions.
 *
 * Important: After successful execution, the queue notifies React Query
 * to invalidate relevant caches via the queueProcessedCallback.
 */

let queueProcessedCallback: (() => void) | null = null;

/**
 * Register a callback to be called when the queue successfully processes actions.
 * The tRPC provider calls this at initialization to enable cache invalidation.
 */
export function setQueueProcessedCallback(callback: () => void): void {
  queueProcessedCallback = callback;
}

/**
 * Notify React Query that queued actions have been processed.
 * Called by the offline queue after successfully executing mutations.
 */
export function notifyQueueProcessed(): void {
  queueProcessedCallback?.();
}

/**
 * Create the offline queue's tRPC client.
 * Uses the same API endpoint but is independent of React Query.
 */
export function createOfflineTRPCClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: process.env.EXPO_PUBLIC_API_URL + '/trpc',
        headers: async () => {
          const { getAuthHeaders } = await import('./auth');
          return getAuthHeaders();
        },
      }),
    ],
  });
}

// Singleton instance for the offline queue
let offlineClient: ReturnType<typeof createOfflineTRPCClient> | null = null;

export function getOfflineTRPCClient() {
  if (!offlineClient) {
    offlineClient = createOfflineTRPCClient();
  }
  return offlineClient;
}
```

```typescript
// apps/mobile/providers/trpc-provider.tsx (integration snippet)

import { useEffect } from 'react';
import { setQueueProcessedCallback } from '../lib/trpc-offline-client';
import { trpc } from '../lib/trpc';

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const utils = trpc.useUtils();

  useEffect(() => {
    // Register cache invalidation callback for offline queue
    setQueueProcessedCallback(() => {
      // Invalidate all subscription-related queries when queue processes
      utils.subscriptions.list.invalidate();
      utils.subscriptions.connections.list.invalidate();
      utils.items.inbox.invalidate();
    });
  }, [utils]);

  // ... rest of provider implementation
}
```

#### 9.3.1 Queue Implementation

```typescript
// apps/mobile/lib/offline-queue.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { ulid } from 'ulid';

const QUEUE_KEY = 'zine:offline_action_queue';
const MAX_RETRIES = 3;
const AUTH_RETRY_LIMIT = 1; // Only retry auth errors once after token refresh

export type OfflineActionType =
  | 'SUBSCRIBE'
  | 'UNSUBSCRIBE'
  | 'PAUSE_SUBSCRIPTION'
  | 'RESUME_SUBSCRIPTION';

/**
 * Error classification for retry logic.
 * Determines how the queue should handle different failure types.
 */
export type ErrorClassification =
  | 'NETWORK' // Temporary network failure - should retry
  | 'AUTH' // 401 Unauthorized - refresh auth and retry once
  | 'CONFLICT' // 409 Conflict - subscription already exists
  | 'CLIENT' // 4xx errors (except 401, 409) - permanent failure, don't retry
  | 'SERVER' // 5xx errors - should retry with backoff
  | 'UNKNOWN'; // Unknown error - treat as retryable

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: Record<string, unknown>;
  createdAt: number;
  retryCount: number;
  authRetryCount: number; // Separate counter for auth retries
  lastError?: string;
  lastErrorType?: ErrorClassification;
}

/**
 * Classify an error to determine retry behavior.
 *
 * @param error - The error thrown during action execution
 * @returns Error classification for retry logic
 */
function classifyError(error: unknown): ErrorClassification {
  // Network errors (fetch failures, timeouts, etc.)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return 'NETWORK';
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network-related error messages
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('aborted') ||
      message.includes('connection')
    ) {
      return 'NETWORK';
    }
  }

  // tRPC/HTTP errors with status codes
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;

    // Check for tRPC error shape
    const httpStatus =
      (errorObj.data as Record<string, unknown>)?.httpStatus ??
      errorObj.status ??
      errorObj.statusCode;
    const code = (errorObj.data as Record<string, unknown>)?.code ?? errorObj.code;

    // 401 Unauthorized - auth token expired or invalid
    if (httpStatus === 401 || code === 'UNAUTHORIZED') {
      return 'AUTH';
    }

    // 409 Conflict - resource already exists (e.g., subscription already added)
    if (httpStatus === 409 || code === 'CONFLICT') {
      return 'CONFLICT';
    }

    // 4xx Client errors (except 401, 409) - permanent failures
    if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
      return 'CLIENT';
    }

    // 5xx Server errors - temporary failures, should retry
    if (typeof httpStatus === 'number' && httpStatus >= 500) {
      return 'SERVER';
    }
  }

  return 'UNKNOWN';
}

/**
 * Determine if an error should trigger a retry.
 *
 * @param errorType - The classified error type
 * @param action - The action being processed (for retry count checks)
 * @returns Whether the action should be retried
 */
function isRetryableError(errorType: ErrorClassification, action: OfflineAction): boolean {
  switch (errorType) {
    case 'NETWORK':
    case 'SERVER':
    case 'UNKNOWN':
      // Retry if under the retry limit
      return action.retryCount < MAX_RETRIES;

    case 'AUTH':
      // Auth errors get one retry after token refresh
      return action.authRetryCount < AUTH_RETRY_LIMIT;

    case 'CONFLICT':
      // Conflict means the action already succeeded (e.g., already subscribed)
      // Don't retry - mark as resolved
      return false;

    case 'CLIENT':
      // Client errors (4xx except 401, 409) are permanent - don't retry
      return false;

    default:
      return false;
  }
}

class OfflineActionQueue {
  private isProcessing = false;
  private listeners: Set<() => void> = new Set();

  async enqueue(action: {
    type: OfflineActionType;
    payload: Record<string, unknown>;
  }): Promise<string> {
    const queue = await this.getQueue();

    const queuedAction: OfflineAction = {
      id: ulid(),
      type: action.type,
      payload: action.payload,
      createdAt: Date.now(),
      retryCount: 0,
      authRetryCount: 0,
    };

    queue.push(queuedAction);
    await this.saveQueue(queue);
    this.notifyListeners();
    this.processQueue();

    return queuedAction.id;
  }

  async getQueue(): Promise<OfflineAction[]> {
    try {
      const data = await AsyncStorage.getItem(QUEUE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      return [];
    }
  }

  async getPendingCount(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    const state = await NetInfo.fetch();
    if (!state.isConnected || state.isInternetReachable === false) return;

    this.isProcessing = true;

    try {
      const queue = await this.getQueue();
      const remainingActions: OfflineAction[] = [];

      for (const action of queue) {
        try {
          await this.executeAction(action);
          // Action succeeded - don't add to remaining
        } catch (error) {
          const errorType = classifyError(error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          // Handle based on error type
          if (errorType === 'CONFLICT') {
            // 409 Conflict: Subscription already exists
            // This is actually a success case - the user's intent is fulfilled
            // Log it but don't retry or keep in queue
            console.log(`[OfflineQueue] Action ${action.id} resolved as conflict (already exists)`);
            continue;
          }

          if (errorType === 'AUTH') {
            // 401 Unauthorized: Try to refresh auth token and retry once
            if (action.authRetryCount < AUTH_RETRY_LIMIT) {
              try {
                await this.refreshAuth();
                // Retry the action immediately after auth refresh
                await this.executeAction(action);
                // Success after auth refresh - don't add to remaining
                continue;
              } catch (retryError) {
                // Auth refresh failed or retry failed
                // Only keep in queue if it's still a retryable error
                const retryErrorType = classifyError(retryError);
                if (
                  isRetryableError(retryErrorType, {
                    ...action,
                    authRetryCount: action.authRetryCount + 1,
                  })
                ) {
                  remainingActions.push({
                    ...action,
                    authRetryCount: action.authRetryCount + 1,
                    lastError:
                      retryError instanceof Error ? retryError.message : 'Auth retry failed',
                    lastErrorType: retryErrorType,
                  });
                }
                // If not retryable after auth, action is dropped (permanent failure)
              }
            }
            // Exceeded auth retry limit - permanent failure
            continue;
          }

          if (errorType === 'CLIENT') {
            // 4xx Client errors (except 401, 409): Permanent failure
            // Don't retry - these indicate bad input or invalid state
            console.error(`[OfflineQueue] Action ${action.id} failed permanently: ${errorMessage}`);
            continue;
          }

          // NETWORK, SERVER, UNKNOWN errors: Retry with backoff
          if (isRetryableError(errorType, action)) {
            remainingActions.push({
              ...action,
              retryCount: action.retryCount + 1,
              lastError: errorMessage,
              lastErrorType: errorType,
            });
          } else {
            // Exceeded retry limit
            console.error(
              `[OfflineQueue] Action ${action.id} exceeded retry limit: ${errorMessage}`
            );
          }
        }
      }

      await this.saveQueue(remainingActions);
      this.notifyListeners();

      // Notify React Query to invalidate caches after queue processing
      // This ensures the UI reflects the server state after offline mutations complete
      const { notifyQueueProcessed } = await import('./trpc-offline-client');
      notifyQueueProcessed();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Attempt to refresh the authentication token.
   * Called when a 401 Unauthorized error is encountered.
   *
   * @throws Error if auth refresh fails
   */
  private async refreshAuth(): Promise<void> {
    const { refreshAuthToken } = await import('./auth');
    await refreshAuthToken();
  }

  /**
   * Execute a single queued action using the singleton tRPC client.
   *
   * Uses getOfflineTRPCClient() instead of dynamic import to ensure:
   * 1. Same client instance across all queue operations
   * 2. Proper auth header injection
   * 3. Ability to notify React Query after successful execution
   */
  private async executeAction(action: OfflineAction): Promise<void> {
    const { getOfflineTRPCClient } = await import('./trpc-offline-client');
    const client = getOfflineTRPCClient();

    switch (action.type) {
      case 'SUBSCRIBE':
        await client.subscriptions.add.mutate(action.payload as any);
        break;
      case 'UNSUBSCRIBE':
        await client.subscriptions.remove.mutate(action.payload as any);
        break;
      case 'PAUSE_SUBSCRIPTION':
        await client.subscriptions.pause.mutate(action.payload as any);
        break;
      case 'RESUME_SUBSCRIPTION':
        await client.subscriptions.resume.mutate(action.payload as any);
        break;
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async saveQueue(queue: OfflineAction[]): Promise<void> {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const offlineQueue = new OfflineActionQueue();

// Process queue when app comes online
NetInfo.addEventListener((state) => {
  if (state.isConnected && state.isInternetReachable !== false) {
    offlineQueue.processQueue();
  }
});
```

### 9.4 Offline Mutation Hook

```typescript
// apps/mobile/hooks/use-offline-mutation.ts

import { useState, useCallback } from 'react';
import { useNetworkStatus } from './use-network-status';
import { offlineQueue, OfflineActionType } from '../lib/offline-queue';

interface UseOfflineMutationOptions<TPayload> {
  actionType: OfflineActionType;
  mutationFn: (payload: TPayload) => Promise<void>;
  onOptimisticUpdate?: (payload: TPayload) => void;
  onRollback?: (payload: TPayload) => void;
  onSuccess?: (payload: TPayload) => void;
  onError?: (error: Error, payload: TPayload) => void;
}

export function useOfflineMutation<TPayload extends Record<string, unknown>>({
  actionType,
  mutationFn,
  onOptimisticUpdate,
  onRollback,
  onSuccess,
  onError,
}: UseOfflineMutationOptions<TPayload>) {
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const [isPending, setIsPending] = useState(false);
  const [isQueued, setIsQueued] = useState(false);

  const isOnline = isConnected && isInternetReachable !== false;

  const mutate = useCallback(
    async (payload: TPayload) => {
      setIsPending(true);
      setIsQueued(false);
      onOptimisticUpdate?.(payload);

      if (!isOnline) {
        try {
          await offlineQueue.enqueue({ type: actionType, payload });
          setIsQueued(true);
        } catch (error) {
          onRollback?.(payload);
        } finally {
          setIsPending(false);
        }
        return;
      }

      try {
        await mutationFn(payload);
        onSuccess?.(payload);
      } catch (error) {
        onRollback?.(payload);
        onError?.(error as Error, payload);
      } finally {
        setIsPending(false);
      }
    },
    [isOnline, actionType, mutationFn, onOptimisticUpdate, onRollback, onSuccess, onError]
  );

  return { mutate, isPending, isQueued, isOnline };
}
```

### 9.5 Optimistic Subscriptions Hook

> **API Contract**: The `subscriptions.list` endpoint returns a paginated response:
> `{ items: Subscription[], nextCursor: string | null, hasMore: boolean }`.
> See [Section 10.3](#103-subscription-endpoints) for full endpoint documentation.

````typescript
// apps/mobile/hooks/use-subscriptions.ts

import { trpc } from '../lib/trpc';
import { useOfflineMutation } from './use-offline-mutation';

/**
 * Hook for managing subscriptions with offline support.
 *
 * The subscriptions.list endpoint returns a paginated response with shape:
 * { items: Subscription[], nextCursor: string | null, hasMore: boolean }
 *
 * This hook extracts the items array for easier consumption while
 * preserving the full response for cache updates.
 *
 * For paginated/infinite scroll scenarios, use useInfiniteSubscriptions instead.
 */
export function useSubscriptions() {
  const utils = trpc.useUtils();

  const {
    data: subscriptionsResponse,
    isLoading,
    refetch,
  } = trpc.subscriptions.list.useQuery(
    { limit: 50 }, // Use default limit from API contract
    { staleTime: 5 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000 }
  );

  const {
    mutate: subscribe,
    isPending: isSubscribing,
    isQueued: subscribeQueued,
  } = useOfflineMutation<{
    provider: 'YOUTUBE' | 'SPOTIFY';
    providerChannelId: string;
    name: string;
    imageUrl?: string;
  }>({
    actionType: 'SUBSCRIBE',
    mutationFn: async (payload) => {
      await utils.client.subscriptions.add.mutate(payload);
    },
    onOptimisticUpdate: (payload) => {
      // Response shape: { items: Subscription[], nextCursor, hasMore }
      utils.subscriptions.list.setData({ limit: 50 }, (old) =>
        old
          ? {
              ...old,
              items: [
                ...old.items,
                {
                  id: `temp-${Date.now()}`,
                  provider: payload.provider,
                  providerChannelId: payload.providerChannelId,
                  name: payload.name,
                  imageUrl: payload.imageUrl ?? null,
                  description: null,
                  externalUrl: null,
                  status: 'ACTIVE' as const,
                  lastPolledAt: null,
                  pollIntervalSeconds: 3600,
                  createdAt: Date.now(),
                },
              ],
            }
          : { items: [], nextCursor: null, hasMore: false }
      );
    },
    onRollback: (payload) => {
      utils.subscriptions.list.setData({ limit: 50 }, (old) =>
        old
          ? {
              ...old,
              items: old.items.filter((s) => s.providerChannelId !== payload.providerChannelId),
            }
          : { items: [], nextCursor: null, hasMore: false }
      );
    },
    onSuccess: () => utils.subscriptions.list.invalidate(),
  });

  const {
    mutate: unsubscribe,
    isPending: isUnsubscribing,
    isQueued: unsubscribeQueued,
  } = useOfflineMutation<{ subscriptionId: string }>({
    actionType: 'UNSUBSCRIBE',
    mutationFn: async (payload) => {
      await utils.client.subscriptions.remove.mutate(payload);
    },
    onOptimisticUpdate: (payload) => {
      utils.subscriptions.list.setData({ limit: 50 }, (old) =>
        old
          ? {
              ...old,
              items: old.items.filter((s) => s.id !== payload.subscriptionId),
            }
          : { items: [], nextCursor: null, hasMore: false }
      );
    },
    onRollback: () => utils.subscriptions.list.invalidate(),
  });

  return {
    // Extract items from paginated response for easier consumption
    subscriptions: subscriptionsResponse?.items ?? [],
    // Expose full response for components that need pagination info
    subscriptionsResponse,
    isLoading,
    refetch,
    subscribe,
    isSubscribing,
    subscribeQueued,
    unsubscribe,
    isUnsubscribing,
    unsubscribeQueued,
  };
}

/**
 * Hook for infinite scroll/pagination of subscriptions.
 *
 * Uses React Query's useInfiniteQuery for cursor-based pagination.
 * Preferred for long subscription lists that should load progressively.
 *
 * @example
 * ```tsx
 * const {
 *   data,
 *   fetchNextPage,
 *   hasNextPage,
 *   isFetchingNextPage,
 * } = useInfiniteSubscriptions();
 *
 * // Flatten pages for FlatList
 * const allSubscriptions = data?.pages.flatMap(page => page.items) ?? [];
 * ```
 */
export function useInfiniteSubscriptions(options?: { limit?: number }) {
  return trpc.subscriptions.list.useInfiniteQuery(
    { limit: options?.limit ?? 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
    }
  );
}
````

### 9.6 Sync Recovery

```typescript
// apps/mobile/hooks/use-sync-recovery.ts

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useNetworkStatus } from './use-network-status';
import { offlineQueue } from '../lib/offline-queue';
import { trpc } from '../lib/trpc';

export function useSyncRecovery() {
  const utils = trpc.useUtils();
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const wasOffline = useRef(false);
  const appState = useRef(AppState.currentState);

  const isOnline = isConnected && isInternetReachable !== false;

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      return;
    }

    if (wasOffline.current) {
      wasOffline.current = false;
      performSyncRecovery();
    }
  }, [isOnline]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        if (isOnline) performSyncRecovery();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [isOnline]);

  async function performSyncRecovery() {
    try {
      const pendingCount = await offlineQueue.getPendingCount();
      if (pendingCount > 0) {
        await offlineQueue.processQueue();
      }

      await Promise.all([
        utils.subscriptions.list.invalidate(),
        utils.subscriptions.connections.list.invalidate(),
        utils.items.inbox.invalidate(),
      ]);
    } catch (error) {
      console.error('[SyncRecovery] Recovery failed:', error);
    }
  }

  return { performSyncRecovery };
}
```

### 9.7 Sync Status Indicator

```typescript
// apps/mobile/components/sync-status-indicator.tsx

import { View, Text, Animated, StyleSheet } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { offlineQueue } from '../lib/offline-queue';
import { Colors, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function SyncStatusIndicator() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [pendingCount, setPendingCount] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Store animation reference for cleanup on unmount
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    offlineQueue.getPendingCount().then(setPendingCount);
    const unsubscribe = offlineQueue.subscribe(async () => {
      const count = await offlineQueue.getPendingCount();
      setPendingCount(count);
    });
    return unsubscribe;
  }, []);

  // Animation effect with proper cleanup
  useEffect(() => {
    // Stop any existing animation before starting a new one
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }

    if (pendingCount > 0) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.5, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      animationRef.current = pulse;
      pulse.start();
    } else {
      pulseAnim.setValue(1);
    }

    // Cleanup on unmount OR when pendingCount changes
    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
    };
  }, [pendingCount]); // pulseAnim is a ref.current, stable - not needed in deps

  if (pendingCount === 0) return null;

  return (
    <Animated.View style={[styles.container, { opacity: pulseAnim, backgroundColor: colors.primaryLight }]}>
      <View style={[styles.dot, { backgroundColor: colors.primary }]} />
      <Text style={[styles.text, { color: colors.primaryDark }]}>
        {pendingCount} pending {pendingCount === 1 ? 'change' : 'changes'}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontSize: 14,
  },
});
```

### 9.8 tRPC/Offline Queue Integration Architecture

This section summarizes how the offline queue integrates with tRPC and React Query to maintain cache consistency.

#### 9.8.1 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           React Components                                   │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐   │
│  │ useSubscriptions │    │ useOfflineMutation│    │  SyncStatusIndicator │   │
│  └────────┬─────────┘    └────────┬─────────┘    └──────────┬───────────┘   │
│           │                       │                         │               │
└───────────┼───────────────────────┼─────────────────────────┼───────────────┘
            │                       │                         │
            ▼                       ▼                         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              React Query Cache                             │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  subscriptions.list  │  connections.list  │  items.inbox            │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    ▲                                       │
│                                    │ invalidate()                          │
└────────────────────────────────────┼───────────────────────────────────────┘
                                     │
            ┌────────────────────────┴────────────────────────┐
            │                                                 │
            ▼                                                 ▼
┌───────────────────────────┐               ┌─────────────────────────────────┐
│   tRPC React Client       │               │    Offline Queue Callback       │
│   (with React Query)      │               │    notifyQueueProcessed()       │
│                           │               └─────────────┬───────────────────┘
│   Used by hooks for:      │                             │
│   - Direct mutations      │                             │
│   - Queries               │                             │
│   - Optimistic updates    │                             │
└───────────────────────────┘                             │
                                                          │
┌─────────────────────────────────────────────────────────┼───────────────────┐
│                        Offline Queue                     │                   │
│  ┌──────────────────────────────────────────────────────┴─────────────────┐ │
│  │  processQueue()                                                        │ │
│  │    │                                                                   │ │
│  │    ├─► executeAction() ─► getOfflineTRPCClient() ─► HTTP Request      │ │
│  │    │                                                                   │ │
│  │    └─► notifyQueueProcessed() ─► Invalidate React Query Cache         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Singleton tRPC Client (trpc-offline-client.ts)                        │ │
│  │    - Separate from React hooks client                                   │ │
│  │    - Shares auth headers                                                │ │
│  │    - No React Query integration (fire-and-forget mutations)            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 9.8.2 Data Flow: Online Mutation

When the user is online, mutations flow directly through React Query:

1. User triggers `subscribe()` from `useSubscriptions`
2. `useOfflineMutation` detects online status
3. Calls `mutationFn` which uses `utils.client.subscriptions.add.mutate()`
4. `onOptimisticUpdate` immediately updates React Query cache
5. Server responds → `onSuccess` invalidates queries
6. UI reflects final server state

#### 9.8.3 Data Flow: Offline Mutation

When the user is offline, mutations are queued:

1. User triggers `subscribe()` from `useSubscriptions`
2. `useOfflineMutation` detects offline status
3. `onOptimisticUpdate` immediately updates React Query cache (optimistic)
4. `offlineQueue.enqueue()` persists action to AsyncStorage
5. UI shows "pending" indicator via `SyncStatusIndicator`

When the device comes back online:

6. `NetInfo` listener triggers `processQueue()`
7. Queue uses `getOfflineTRPCClient()` (singleton) to execute mutations
8. On success: `notifyQueueProcessed()` fires
9. Callback registered in `TRPCProvider` invalidates React Query caches
10. UI refreshes with server-confirmed state

#### 9.8.4 Key Design Decisions

| Decision                                  | Rationale                                                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Singleton offline client**              | Avoids creating new client instances on each queue process, ensuring consistent auth headers                                                   |
| **Callback-based cache invalidation**     | Decouples the queue (vanilla JS) from React Query (React context), allowing the queue to run outside React lifecycle                           |
| **Invalidate vs. update cache**           | After processing queued actions, we invalidate rather than update cache because server may have applied business logic (timestamps, IDs, etc.) |
| **No optimistic updates on queue replay** | Original optimistic update already applied; queue replay just confirms server state                                                            |

#### 9.8.5 Error Handling During Queue Processing

When queued mutations fail:

| Error Type       | Behavior                                               |
| ---------------- | ------------------------------------------------------ |
| Network error    | Retry with exponential backoff, keep in queue          |
| 401 Unauthorized | Refresh auth token, retry once                         |
| 409 Conflict     | Remove from queue (action already succeeded elsewhere) |
| 4xx Client error | Remove from queue (permanent failure)                  |
| 5xx Server error | Retry with backoff                                     |

After any queue processing (success or partial failure), `notifyQueueProcessed()` still fires to ensure cache consistency.

### 9.9 Offline Scenarios Summary

| Scenario                                      | Detection               | User Feedback                         | Recovery                          |
| --------------------------------------------- | ----------------------- | ------------------------------------- | --------------------------------- |
| **Subscribe while offline**                   | `NetInfo.isConnected`   | "Pending" badge, offline banner       | Queue action, sync on reconnect   |
| **Unsubscribe while offline**                 | `NetInfo.isConnected`   | Immediate removal + pending indicator | Queue action, sync on reconnect   |
| **App backgrounded then foregrounded**        | `AppState` listener     | None (seamless)                       | Invalidate queries, process queue |
| **Conflict: same action on multiple devices** | Server response differs | Toast notification                    | Server wins, preserve user intent |

---

## 10. tRPC API Contract

This section documents all tRPC procedures used by the frontend with their TypeScript input/output types. For backend implementation details, see [backend-spec.md](./backend-spec.md).

### 10.1 Type Definitions

```typescript
// packages/shared/src/types/subscriptions.ts

/** OAuth provider identifier */
export type Provider = 'YOUTUBE' | 'SPOTIFY';

/** Connection status for OAuth credentials */
export type ConnectionStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

/** Subscription status for polling management */
export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'DISCONNECTED' | 'UNSUBSCRIBED';

/** Provider connection info returned from connections.list */
export interface Connection {
  id: string;
  provider: Provider;
  status: ConnectionStatus;
  providerUserId: string | null;
  connectedAt: number;
  lastRefreshedAt: number | null;
}

/** Subscription info returned from subscriptions.list */
export interface Subscription {
  id: string;
  provider: Provider;
  providerChannelId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  externalUrl: string | null;
  status: SubscriptionStatus;
  lastPolledAt: number | null;
  pollIntervalSeconds: number;
  createdAt: number;
}

/** Standard success response */
export interface SuccessResponse {
  success: boolean;
}

/** Paginated list response */
export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
```

### 10.2 Connection Endpoints

#### `connections.registerState`

Registers OAuth state parameter for CSRF protection before initiating OAuth flow.

```typescript
// Input
interface RegisterStateInput {
  provider: Provider;
  state: string; // UUID generated by client
}

// Output
interface RegisterStateOutput {
  success: boolean;
}

// Usage
await trpc.subscriptions.connections.registerState.mutate({
  provider: 'YOUTUBE',
  state: crypto.randomUUID(),
});
```

#### `connections.callback`

Exchanges OAuth authorization code for tokens. Called after user completes OAuth flow.

```typescript
// Input
interface CallbackInput {
  provider: Provider;
  code: string; // Authorization code from OAuth redirect
  state: string; // State parameter for CSRF validation
  codeVerifier: string; // PKCE verifier (43-128 chars)
}

// Output
interface CallbackOutput {
  success: boolean;
}

// Usage
await trpc.subscriptions.connections.callback.mutate({
  provider: 'YOUTUBE',
  code: 'auth_code_from_redirect',
  state: storedState,
  codeVerifier: storedVerifier,
});
```

#### `connections.list`

Returns the user's connected provider accounts.

```typescript
// Input: none (uses authenticated user context)

// Output
interface ConnectionsListOutput {
  YOUTUBE: Connection | null;
  SPOTIFY: Connection | null;
}

// Usage
const { data } = trpc.subscriptions.connections.list.useQuery();
const youtubeConnected = data?.YOUTUBE?.status === 'ACTIVE';
```

#### `connections.disconnect`

Disconnects a provider account and revokes OAuth tokens.

```typescript
// Input
interface DisconnectInput {
  provider: Provider;
}

// Output
interface DisconnectOutput {
  success: boolean;
}

// Usage
await trpc.subscriptions.connections.disconnect.mutate({
  provider: 'SPOTIFY',
});
```

### 10.3 Subscription Endpoints

#### `subscriptions.list`

Returns paginated list of user's subscriptions with optional filtering.

```typescript
// Input
interface ListSubscriptionsInput {
  provider?: Provider; // Filter by provider
  status?: SubscriptionStatus; // Filter by status
  limit?: number; // Max items (1-100, default 50)
  cursor?: string; // Pagination cursor
}

// Output
type ListSubscriptionsOutput = PaginatedResponse<Subscription>;
// { items: Subscription[], nextCursor: string | null, hasMore: boolean }

// Usage
const { data, fetchNextPage, hasNextPage } = trpc.subscriptions.list.useInfiniteQuery(
  { limit: 20 },
  { getNextPageParam: (lastPage) => lastPage.nextCursor }
);
```

#### `subscriptions.add`

Subscribes to a channel/show. Triggers initial fetch of latest content.

```typescript
// Input
interface AddSubscriptionInput {
  provider: Provider;
  providerChannelId: string; // YouTube channel ID or Spotify show ID
  name?: string; // Optional display name
  imageUrl?: string; // Optional thumbnail URL
}

// Output
interface AddSubscriptionOutput {
  subscriptionId: string;
  name: string;
  imageUrl: string | null;
}

// Usage
const result = await trpc.subscriptions.add.mutate({
  provider: 'YOUTUBE',
  providerChannelId: 'UCxxxxxxxxxxxxxxxxxxxxxx',
  name: 'Channel Name',
});
```

#### `subscriptions.remove`

Unsubscribes from a channel/show. Preserves user's saved/archived content.

```typescript
// Input
interface RemoveSubscriptionInput {
  subscriptionId: string;
}

// Output
interface RemoveSubscriptionOutput {
  success: boolean;
}

// Usage
await trpc.subscriptions.remove.mutate({
  subscriptionId: 'sub_01234567890',
});
```

#### `subscriptions.pause`

Pauses polling for a subscription without unsubscribing.

```typescript
// Input
interface PauseSubscriptionInput {
  subscriptionId: string;
}

// Output
interface PauseSubscriptionOutput {
  success: boolean;
}

// Usage
await trpc.subscriptions.pause.mutate({
  subscriptionId: 'sub_01234567890',
});
```

#### `subscriptions.resume`

Resumes polling for a paused subscription.

```typescript
// Input
interface ResumeSubscriptionInput {
  subscriptionId: string;
}

// Output
interface ResumeSubscriptionOutput {
  success: boolean;
}

// Usage
await trpc.subscriptions.resume.mutate({
  subscriptionId: 'sub_01234567890',
});
```

#### `subscriptions.syncNow`

Manually triggers a sync for a subscription. Rate limited to 1 per 5 minutes per subscription.

```typescript
// Input
interface SyncNowInput {
  subscriptionId: string;
}

// Output
interface SyncNowOutput {
  success: boolean;
  itemsFound: number;
  message?: string; // Human-readable status message
}

// Usage
const result = await trpc.subscriptions.syncNow.mutate({
  subscriptionId: 'sub_01234567890',
});
// result: { success: true, itemsFound: 3, message: 'Found 3 new items' }
```

### 10.4 Discovery Endpoints

#### `discover.available`

Returns channels/shows the user is subscribed to on the provider (for import selection).

```typescript
// Input
interface DiscoverAvailableInput {
  provider: Provider;
}

// Output
interface DiscoverableChannel {
  providerChannelId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  subscriberCount: number | null;
  isSubscribed: boolean; // Already subscribed in Zine
}

type DiscoverAvailableOutput = DiscoverableChannel[];

// Usage
const { data } = trpc.subscriptions.discover.available.useQuery({
  provider: 'YOUTUBE',
});
```

#### `discover.search`

Searches for channels/shows on a provider.

```typescript
// Input
interface SearchChannelsInput {
  provider: Provider;
  query: string; // Search query (1-100 chars)
  limit?: number; // Max results (1-50, default 20)
}

// Output
type SearchChannelsOutput = DiscoverableChannel[];

// Usage
const { data } = trpc.subscriptions.discover.search.useQuery({
  provider: 'SPOTIFY',
  query: 'tech podcasts',
  limit: 10,
});
```

### 10.5 Error Handling

All tRPC endpoints may return standard tRPC errors. Handle these in the frontend:

```typescript
import { TRPCClientError } from '@trpc/client';

try {
  await trpc.subscriptions.add.mutate({ ... });
} catch (error) {
  if (error instanceof TRPCClientError) {
    switch (error.data?.code) {
      case 'UNAUTHORIZED':
        // Redirect to login
        break;
      case 'TOO_MANY_REQUESTS':
        // Show rate limit message, display retry-after
        break;
      case 'BAD_REQUEST':
        // Invalid input - show validation error
        break;
      case 'NOT_FOUND':
        // Subscription not found
        break;
      case 'CONFLICT':
        // Already subscribed
        break;
      default:
        // Generic error handling
    }
  }
}
```

### 10.6 React Query Integration

The frontend uses `@tanstack/react-query` via tRPC's React integration. Key patterns:

```typescript
// Optimistic updates for mutations
const utils = trpc.useUtils();

const addMutation = trpc.subscriptions.add.useMutation({
  onMutate: async (newSub) => {
    await utils.subscriptions.list.cancel();
    const previous = utils.subscriptions.list.getData();
    utils.subscriptions.list.setData({}, (old) => ({
      ...old,
      items: [...(old?.items ?? []), { id: 'temp', ...newSub }],
    }));
    return { previous };
  },
  onError: (err, newSub, context) => {
    utils.subscriptions.list.setData({}, context?.previous);
  },
  onSettled: () => {
    utils.subscriptions.list.invalidate();
  },
});

// Prefetching for better UX
const prefetchConnections = () => {
  utils.subscriptions.connections.list.prefetch();
};
```

### 10.7 Endpoint Summary Table

| Endpoint                    | Method   | Input                                               | Output                                          |
| --------------------------- | -------- | --------------------------------------------------- | ----------------------------------------------- |
| `connections.registerState` | mutation | `{ provider, state }`                               | `{ success }`                                   |
| `connections.callback`      | mutation | `{ provider, code, state, codeVerifier }`           | `{ success }`                                   |
| `connections.list`          | query    | none                                                | `{ YOUTUBE: Connection?, SPOTIFY: Connection?}` |
| `connections.disconnect`    | mutation | `{ provider }`                                      | `{ success }`                                   |
| `subscriptions.list`        | query    | `{ provider?, status?, limit?, cursor? }`           | `{ items, nextCursor, hasMore }`                |
| `subscriptions.add`         | mutation | `{ provider, providerChannelId, name?, imageUrl? }` | `{ subscriptionId, name, imageUrl }`            |
| `subscriptions.remove`      | mutation | `{ subscriptionId }`                                | `{ success }`                                   |
| `subscriptions.pause`       | mutation | `{ subscriptionId }`                                | `{ success }`                                   |
| `subscriptions.resume`      | mutation | `{ subscriptionId }`                                | `{ success }`                                   |
| `subscriptions.syncNow`     | mutation | `{ subscriptionId }`                                | `{ success, itemsFound, message? }`             |
| `discover.available`        | query    | `{ provider }`                                      | `DiscoverableChannel[]`                         |
| `discover.search`           | query    | `{ provider, query, limit? }`                       | `DiscoverableChannel[]`                         |

---

## API Reference (Legacy)

See [backend-spec.md](./backend-spec.md) for additional backend implementation details.
