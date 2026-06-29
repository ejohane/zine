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

import { useEffect, useState } from 'react';
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
