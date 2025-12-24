/**
 * Network status detection hooks for connectivity awareness.
 *
 * Provides reactive and imperative network status checking for offline handling.
 *
 * @requires @react-native-community/netinfo
 * Install with: npx expo install @react-native-community/netinfo
 *
 * @see Frontend Spec Section 9.1 for detailed requirements
 */

import { useEffect, useState, useCallback } from 'react';
import NetInfo, {
  type NetInfoState,
  type NetInfoSubscription,
} from '@react-native-community/netinfo';

/**
 * Network status information.
 *
 * @property isConnected - Whether the device has network connectivity
 * @property isInternetReachable - Whether the internet is reachable (may be null on Android initially)
 * @property type - The type of network connection (wifi, cellular, none, unknown, etc.)
 */
export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
}

/**
 * Reactive hook for network status monitoring.
 *
 * Subscribes to network state changes and provides real-time connectivity info.
 * Handles Android's quirk where isInternetReachable may initially be null
 * (we treat null as "assume reachable" for better UX).
 *
 * @returns Current network status with isConnected, isInternetReachable, and type
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isConnected, isInternetReachable } = useNetworkStatus();
 *
 *   // For offline detection, check both:
 *   const isOffline = !isConnected || isInternetReachable === false;
 *
 *   if (isOffline) {
 *     return <OfflineBanner />;
 *   }
 *
 *   return <OnlineContent />;
 * }
 * ```
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: true,
    type: 'unknown',
  });

  useEffect(() => {
    // Initial fetch of network state
    NetInfo.fetch().then((state: NetInfoState) => {
      setStatus({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      });
    });

    // Subscribe to network state changes
    const unsubscribe: NetInfoSubscription = NetInfo.addEventListener((state: NetInfoState) => {
      setStatus({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      });
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  return status;
}

/**
 * Imperative hook for checking network status on-demand.
 *
 * Returns a function that can be called to check if the device is currently online.
 * Useful for checking connectivity before making network requests.
 *
 * Handles Android's null isInternetReachable by treating it as "assume reachable"
 * (isInternetReachable !== false instead of === true).
 *
 * @returns An async function that resolves to true if online, false if offline
 *
 * @example
 * ```tsx
 * function SubmitButton() {
 *   const checkIsOnline = useIsOnline();
 *
 *   const handleSubmit = async () => {
 *     const isOnline = await checkIsOnline();
 *
 *     if (!isOnline) {
 *       // Queue action for later
 *       await offlineQueue.enqueue(action);
 *       showToast('Saved offline. Will sync when online.');
 *       return;
 *     }
 *
 *     // Proceed with online submission
 *     await submitToServer();
 *   };
 *
 *   return <Button onPress={handleSubmit}>Submit</Button>;
 * }
 * ```
 */
export function useIsOnline(): () => Promise<boolean> {
  return useCallback(async () => {
    const state = await NetInfo.fetch();
    // isConnected must be true AND isInternetReachable must not be false
    // (null means "unknown/assume reachable" - common on Android)
    return state.isConnected === true && state.isInternetReachable !== false;
  }, []);
}
