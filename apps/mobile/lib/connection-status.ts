/**
 * Connection Status Display Utilities
 *
 * Functions for determining how to display OAuth connection status
 * in the UI. Used by ProviderCard component on the subscriptions screen.
 */

import type { Colors } from '@/constants/theme';

/**
 * Connection status from the API.
 * - ACTIVE: Connection is valid and working
 * - EXPIRED: Token expired and refresh failed
 * - REVOKED: User revoked access in the provider
 * - null: No connection exists
 */
export type ConnectionStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | null;

/**
 * Display configuration for a connection status.
 * Used to render the visual state in ProviderCard.
 */
export interface StatusDisplay {
  /** Color for the status indicator dot */
  dotColor: string;
  /** Text to display (e.g., "Connected", "Reconnect required") */
  text: string;
  /** Color for the status text */
  textColor: string;
  /** Whether to show subscription count */
  showCount: boolean;
}

/**
 * Returns the display configuration for a given connection status.
 *
 * Status mapping:
 * - ACTIVE: Green dot, "Connected" text, shows subscription count
 * - EXPIRED/REVOKED: Amber dot, "Reconnect required" text, hides count
 * - null (no connection): Gray dot, "Not connected" text, hides count
 *
 * @param connectionStatus - The connection status from the API
 * @param colors - Theme colors object (Colors.dark or Colors.light)
 * @returns Display configuration for the status
 */
export function getStatusDisplay(
  connectionStatus: ConnectionStatus,
  colors: typeof Colors.dark
): StatusDisplay {
  switch (connectionStatus) {
    case 'ACTIVE':
      return {
        dotColor: colors.success,
        text: 'Connected',
        textColor: colors.textSecondary,
        showCount: true,
      };
    case 'EXPIRED':
    case 'REVOKED':
      return {
        dotColor: colors.warning,
        text: 'Reconnect required',
        textColor: colors.warning,
        showCount: false,
      };
    default:
      return {
        dotColor: colors.textTertiary,
        text: 'Not connected',
        textColor: colors.textTertiary,
        showCount: false,
      };
  }
}
