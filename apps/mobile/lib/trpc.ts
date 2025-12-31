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
 * Determines the default API URL based on the current platform.
 *
 * Platform-specific defaults:
 * - iOS Simulator: localhost works directly
 * - Android Emulator: requires 10.0.2.2 (special alias for host machine)
 * - Physical device: should use EXPO_PUBLIC_API_URL environment variable
 *
 * @returns The default API URL for the current platform
 */
function getDefaultApiUrl(): string {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8787';
  }
  return 'http://localhost:8787';
}

/**
 * The API URL for the worker backend.
 *
 * Uses EXPO_PUBLIC_API_URL if set, otherwise falls back to platform-specific defaults.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL || getDefaultApiUrl();
