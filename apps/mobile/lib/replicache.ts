/**
 * Replicache Client Factory for Zine Mobile
 *
 * Creates and configures a Replicache instance with:
 * - Clerk-based authentication
 * - Shared mutators from @zine/shared
 * - Push/pull URL configuration
 *
 * @module lib/replicache
 */

import { Replicache } from 'replicache';
import Constants from 'expo-constants';
import { mutators, type Mutators } from '@zine/shared';
import { API_BASE_URL } from './auth';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for creating a Replicache client
 */
export interface ReplicacheClientOptions {
  /** Clerk user ID - used as the Replicache name */
  userId: string;
  /** Function to get a fresh auth token */
  getToken: () => Promise<string | null>;
  /** Optional license key (for production) */
  licenseKey?: string;
}

/**
 * Type-safe Replicache instance with Zine mutators
 */
export type ZineReplicache = Replicache<Mutators>;

// ============================================================================
// Constants
// ============================================================================

/**
 * Default push URL for Replicache sync
 */
export const PUSH_URL = `${API_BASE_URL}/api/replicache/push`;

/**
 * Default pull URL for Replicache sync
 */
export const PULL_URL = `${API_BASE_URL}/api/replicache/pull`;

/**
 * Get the Replicache license key from environment
 */
function getLicenseKey(): string {
  const extra = Constants.expoConfig?.extra;
  const key = extra?.replicacheLicenseKey as string | undefined;
  // Replicache allows empty string for development
  return key || '';
}

// ============================================================================
// Client Factory
// ============================================================================

/**
 * Create a Replicache client configured for Zine
 *
 * @param options - Configuration options
 * @returns Configured Replicache instance
 *
 * @example
 * ```tsx
 * import { createReplicacheClient } from '@/lib/replicache';
 * import { useAuth } from '@clerk/clerk-expo';
 *
 * function MyComponent() {
 *   const { userId, getToken } = useAuth();
 *
 *   useEffect(() => {
 *     if (!userId) return;
 *
 *     const rep = createReplicacheClient({
 *       userId,
 *       getToken,
 *     });
 *
 *     // Use rep.mutate.bookmarkItem({ userItemId: 'abc' });
 *
 *     return () => {
 *       rep.close();
 *     };
 *   }, [userId, getToken]);
 * }
 * ```
 */
export function createReplicacheClient(options: ReplicacheClientOptions): ZineReplicache {
  const { userId, getToken, licenseKey } = options;

  const rep = new Replicache<Mutators>({
    // Use userId as the Replicache name for unique local storage per user
    name: userId,

    // License key (empty string works for development)
    licenseKey: licenseKey || getLicenseKey(),

    // Use shared mutators from @zine/shared
    mutators,

    // Push configuration
    pushURL: PUSH_URL,
    pusher: async (request) => {
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated - cannot push');
      }

      const response = await fetch(PUSH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Push failed: ${response.status} - ${errorText}`);
      }

      return {
        httpRequestInfo: {
          httpStatusCode: response.status,
          errorMessage: '',
        },
      };
    },

    // Pull configuration
    pullURL: PULL_URL,
    puller: async (request) => {
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated - cannot pull');
      }

      const response = await fetch(PULL_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pull failed: ${response.status} - ${errorText}`);
      }

      const pullResponse = await response.json();

      return {
        response: pullResponse,
        httpRequestInfo: {
          httpStatusCode: response.status,
          errorMessage: '',
        },
      };
    },

    // Log push/pull errors in development
    logLevel: __DEV__ ? 'debug' : 'error',
  });

  return rep;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Safely close a Replicache instance
 *
 * @param rep - Replicache instance to close
 */
export async function closeReplicacheClient(rep: ZineReplicache | null): Promise<void> {
  if (rep) {
    await rep.close();
  }
}
