/**
 * tRPC Client Configuration
 *
 * Sets up the tRPC client for the mobile app to communicate with the
 * Cloudflare Worker backend. Handles platform-specific URL configuration
 * for development environments.
 *
 * @module
 */

import { Platform } from 'react-native';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../worker/src/trpc/router';

/**
 * Type-safe tRPC React hooks client.
 *
 * Provides hooks like `trpc.useQuery()` and `trpc.useMutation()` that are
 * fully typed against the worker's AppRouter.
 *
 * @example
 * ```tsx
 * const { data } = trpc.items.list.useQuery({ limit: 10 });
 * const mutation = trpc.items.markRead.useMutation();
 * ```
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Determines the API URL based on environment and platform.
 *
 * Platform-specific handling:
 * - iOS Simulator: localhost works directly (network shared with host)
 * - Android Emulator: requires 10.0.2.2 substitution (special alias for host)
 * - Physical device: should use EXPO_PUBLIC_API_URL with a reachable host
 *
 * The function handles worktree isolation where EXPO_PUBLIC_API_URL is set
 * to a dynamic port like http://localhost:8742. On Android, this must be
 * transformed to http://10.0.2.2:8742.
 *
 * @returns The API URL for the current platform
 */
export function resolveApiUrl(
  configuredUrl: string | undefined,
  platform: string,
  isDev: boolean
): string | undefined {
  if (!configuredUrl) return undefined;

  const trimmed = configuredUrl.trim();
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(trimmed);

  // Preview/release builds installed on physical devices cannot reach localhost.
  // If a local .env.preview accidentally sets localhost, force the production API.
  if (!isDev && isLocalhost) {
    return 'https://api.myzine.app';
  }

  if (platform === 'android') {
    return trimmed.replace('localhost', '10.0.2.2');
  }

  return trimmed;
}

function getApiUrl(): string {
  const configuredUrl = resolveApiUrl(
    process.env.EXPO_PUBLIC_API_URL,
    Platform.OS,
    typeof __DEV__ === 'boolean' ? __DEV__ : false
  );

  if (configuredUrl) {
    return configuredUrl;
  }

  // Fallback defaults (shouldn't reach here if using dev:worktree script)
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8787';
  }
  return 'http://localhost:8787';
}

/**
 * The API URL for the worker backend.
 *
 * Evaluated at module load time to ensure consistent URL across all tRPC calls.
 * See getApiUrl() for platform-specific handling.
 */
export const API_URL = getApiUrl();
