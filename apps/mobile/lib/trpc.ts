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
function getApiUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL;

  if (configuredUrl) {
    // For Android emulator, substitute localhost with the special host alias
    // This allows worktree-generated .env.local (which uses localhost) to work
    if (Platform.OS === 'android') {
      return configuredUrl.replace('localhost', '10.0.2.2');
    }
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
