/**
 * Replicache Context and Provider for Zine Mobile
 *
 * Manages Replicache lifecycle tied to Clerk authentication state:
 * - Creates client on sign-in
 * - Closes client on sign-out
 * - Provides client via React Context
 *
 * @module hooks/useReplicache
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useAuth } from '@clerk/clerk-expo';
import {
  createReplicacheClient,
  closeReplicacheClient,
  type ZineReplicache,
} from '@/lib/replicache';

// ============================================================================
// Types
// ============================================================================

/**
 * Sync status for the Replicache client
 */
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

/**
 * Replicache context value
 */
export interface ReplicacheContextValue {
  /** The Replicache client instance, or null if not authenticated */
  rep: ZineReplicache | null;
  /** Whether the Replicache client is ready for use */
  isReady: boolean;
  /** Current sync status */
  syncStatus: SyncStatus;
  /** Last sync error, if any */
  syncError: Error | null;
  /** Manually trigger a sync */
  sync: () => Promise<void>;
}

// ============================================================================
// Context
// ============================================================================

const ReplicacheContext = createContext<ReplicacheContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export interface ReplicacheProviderProps {
  children: ReactNode;
}

/**
 * Provider component that manages Replicache lifecycle
 *
 * Wraps children with ReplicacheContext and automatically:
 * - Creates a Replicache client when user signs in
 * - Closes the client when user signs out
 * - Tracks sync status and errors
 *
 * @example
 * ```tsx
 * import { ReplicacheProvider } from '@/hooks/useReplicache';
 *
 * export default function RootLayout() {
 *   return (
 *     <ClerkProvider>
 *       <ClerkLoaded>
 *         <ReplicacheProvider>
 *           <App />
 *         </ReplicacheProvider>
 *       </ClerkLoaded>
 *     </ClerkProvider>
 *   );
 * }
 * ```
 */
export function ReplicacheProvider({ children }: ReplicacheProviderProps) {
  const { userId, isSignedIn, isLoaded, getToken } = useAuth();

  // State
  const [rep, setRep] = useState<ZineReplicache | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<Error | null>(null);

  // Create a stable getToken wrapper
  const getTokenWrapper = useCallback(async (): Promise<string | null> => {
    try {
      const token = await getToken();
      return token;
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }, [getToken]);

  // Initialize/cleanup Replicache based on auth state
  useEffect(() => {
    // Wait for Clerk to load
    if (!isLoaded) {
      return;
    }

    // If not signed in, ensure client is closed
    if (!isSignedIn || !userId) {
      if (rep) {
        closeReplicacheClient(rep);
        setRep(null);
        setIsReady(false);
        setSyncStatus('idle');
        setSyncError(null);
      }
      return;
    }

    // Create new client for signed-in user
    let mounted = true;
    let newRep: ZineReplicache | null = null;

    const initReplicache = async () => {
      try {
        newRep = createReplicacheClient({
          userId,
          getToken: getTokenWrapper,
        });

        if (mounted) {
          setRep(newRep);
          setIsReady(true);
          setSyncStatus('idle');
          setSyncError(null);
        }
      } catch (error) {
        console.error('Failed to initialize Replicache:', error);
        if (mounted) {
          setSyncError(error instanceof Error ? error : new Error('Failed to initialize'));
          setSyncStatus('error');
        }
      }
    };

    initReplicache();

    // Cleanup on unmount or auth change
    return () => {
      mounted = false;
      if (newRep) {
        closeReplicacheClient(newRep);
      }
    };
  }, [isLoaded, isSignedIn, userId, getTokenWrapper]);

  // Set up sync status listeners
  useEffect(() => {
    if (!rep) return;

    const handleSyncStart = () => {
      setSyncStatus('syncing');
    };

    const handleSyncComplete = () => {
      setSyncStatus('idle');
      setSyncError(null);
    };

    // Replicache emits events for sync status
    const syncHandler = (syncing: boolean) => {
      if (syncing) {
        handleSyncStart();
      } else {
        handleSyncComplete();
      }
    };

    rep.onSync = syncHandler;

    // Note: For offline handling, we rely on Replicache's built-in support.
    // Network status can be tracked via @react-native-community/netinfo if needed.

    return () => {
      // Cleanup - set to null instead of undefined
      if (rep) {
        rep.onSync = null;
      }
    };
  }, [rep, syncStatus]);

  // Manual sync trigger
  const sync = useCallback(async () => {
    if (!rep) {
      console.warn('Cannot sync: Replicache not initialized');
      return;
    }

    try {
      setSyncStatus('syncing');
      await rep.pull();
      setSyncStatus('idle');
      setSyncError(null);
    } catch (error) {
      console.error('Manual sync failed:', error);
      setSyncError(error instanceof Error ? error : new Error('Sync failed'));
      setSyncStatus('error');
    }
  }, [rep]);

  // Memoize context value
  const contextValue = useMemo<ReplicacheContextValue>(
    () => ({
      rep,
      isReady,
      syncStatus,
      syncError,
      sync,
    }),
    [rep, isReady, syncStatus, syncError, sync]
  );

  return <ReplicacheContext.Provider value={contextValue}>{children}</ReplicacheContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access the Replicache client and sync status
 *
 * @returns Replicache context value
 * @throws Error if used outside of ReplicacheProvider
 *
 * @example
 * ```tsx
 * import { useReplicache } from '@/hooks/useReplicache';
 *
 * function MyComponent() {
 *   const { rep, isReady, syncStatus } = useReplicache();
 *
 *   if (!isReady) {
 *     return <Text>Loading...</Text>;
 *   }
 *
 *   return (
 *     <View>
 *       <Text>Sync status: {syncStatus}</Text>
 *       <Button onPress={() => rep?.mutate.bookmarkItem({ userItemId: '123' })}>
 *         Bookmark
 *       </Button>
 *     </View>
 *   );
 * }
 * ```
 */
export function useReplicache(): ReplicacheContextValue {
  const context = useContext(ReplicacheContext);

  if (!context) {
    throw new Error('useReplicache must be used within a ReplicacheProvider');
  }

  return context;
}

/**
 * Hook to check if Replicache is ready without throwing
 *
 * Useful for conditional rendering without try/catch
 *
 * @returns true if Replicache is initialized and ready
 */
export function useReplicacheReady(): boolean {
  const context = useContext(ReplicacheContext);
  return context?.isReady ?? false;
}
