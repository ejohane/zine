/**
 * Tests for lib/connection-status.ts
 *
 * Tests the getStatusDisplay function which determines how to render
 * OAuth connection status in the ProviderCard component.
 *
 * Test cases cover all four status states:
 * - ACTIVE: Green "Connected" state
 * - EXPIRED: Amber "Reconnect required" state
 * - REVOKED: Amber "Reconnect required" state
 * - null: Gray "Not connected" state
 *
 * @see Issue zine-rvo: Frontend: Add tests for connection status display
 */

import { getStatusDisplay, type ConnectionStatus } from './connection-status';
import { Colors } from '@/constants/theme';

describe('getStatusDisplay', () => {
  // Use dark theme colors (the app uses dark-only theme)
  const colors = Colors.dark;

  describe('ACTIVE status', () => {
    it('returns green Connected state', () => {
      const result = getStatusDisplay('ACTIVE', colors);

      expect(result.dotColor).toBe(colors.success);
      expect(result.text).toBe('Connected');
      expect(result.textColor).toBe(colors.textSecondary);
      expect(result.showCount).toBe(true);
    });

    it('uses success color for the status dot', () => {
      const result = getStatusDisplay('ACTIVE', colors);

      // Verify the success color is the expected green
      expect(result.dotColor).toBe('#10B981');
    });
  });

  describe('EXPIRED status', () => {
    it('returns amber Reconnect required state', () => {
      const result = getStatusDisplay('EXPIRED', colors);

      expect(result.dotColor).toBe(colors.warning);
      expect(result.text).toBe('Reconnect required');
      expect(result.textColor).toBe(colors.warning);
      expect(result.showCount).toBe(false);
    });

    it('uses warning color for both dot and text', () => {
      const result = getStatusDisplay('EXPIRED', colors);

      // Verify the warning color is the expected amber
      expect(result.dotColor).toBe('#F59E0B');
      expect(result.textColor).toBe('#F59E0B');
    });

    it('hides subscription count', () => {
      const result = getStatusDisplay('EXPIRED', colors);

      expect(result.showCount).toBe(false);
    });
  });

  describe('REVOKED status', () => {
    it('returns amber Reconnect required state', () => {
      const result = getStatusDisplay('REVOKED', colors);

      expect(result.dotColor).toBe(colors.warning);
      expect(result.text).toBe('Reconnect required');
      expect(result.textColor).toBe(colors.warning);
      expect(result.showCount).toBe(false);
    });

    it('has same display as EXPIRED status', () => {
      const expiredResult = getStatusDisplay('EXPIRED', colors);
      const revokedResult = getStatusDisplay('REVOKED', colors);

      expect(revokedResult.dotColor).toBe(expiredResult.dotColor);
      expect(revokedResult.text).toBe(expiredResult.text);
      expect(revokedResult.textColor).toBe(expiredResult.textColor);
      expect(revokedResult.showCount).toBe(expiredResult.showCount);
    });

    it('hides subscription count', () => {
      const result = getStatusDisplay('REVOKED', colors);

      expect(result.showCount).toBe(false);
    });
  });

  describe('null status (not connected)', () => {
    it('returns gray Not connected state', () => {
      const result = getStatusDisplay(null, colors);

      expect(result.dotColor).toBe(colors.textTertiary);
      expect(result.text).toBe('Not connected');
      expect(result.textColor).toBe(colors.textTertiary);
      expect(result.showCount).toBe(false);
    });

    it('uses textTertiary color for muted appearance', () => {
      const result = getStatusDisplay(null, colors);

      // Verify the tertiary color is the expected gray
      expect(result.dotColor).toBe('#6A6A6A');
      expect(result.textColor).toBe('#6A6A6A');
    });

    it('hides subscription count', () => {
      const result = getStatusDisplay(null, colors);

      expect(result.showCount).toBe(false);
    });
  });

  describe('subscription count visibility', () => {
    it('only shows count for ACTIVE status', () => {
      const statuses: ConnectionStatus[] = ['ACTIVE', 'EXPIRED', 'REVOKED', null];

      const results = statuses.map((status) => ({
        status,
        showCount: getStatusDisplay(status, colors).showCount,
      }));

      // Only ACTIVE should show count
      expect(results.find((r) => r.status === 'ACTIVE')?.showCount).toBe(true);
      expect(results.find((r) => r.status === 'EXPIRED')?.showCount).toBe(false);
      expect(results.find((r) => r.status === 'REVOKED')?.showCount).toBe(false);
      expect(results.find((r) => r.status === null)?.showCount).toBe(false);
    });
  });

  describe('return type', () => {
    it('returns StatusDisplay object with all required properties', () => {
      const result = getStatusDisplay('ACTIVE', colors);

      // Type check - ensure all properties exist
      expect(result).toHaveProperty('dotColor');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('textColor');
      expect(result).toHaveProperty('showCount');

      // Type check - ensure correct types
      expect(typeof result.dotColor).toBe('string');
      expect(typeof result.text).toBe('string');
      expect(typeof result.textColor).toBe('string');
      expect(typeof result.showCount).toBe('boolean');
    });
  });

  describe('theme compatibility', () => {
    it('works with light theme colors', () => {
      const lightColors = Colors.light;
      const result = getStatusDisplay('ACTIVE', lightColors);

      expect(result.dotColor).toBe(lightColors.success);
      expect(result.textColor).toBe(lightColors.textSecondary);
    });

    it('uses theme colors consistently across all statuses', () => {
      const statuses: ConnectionStatus[] = ['ACTIVE', 'EXPIRED', 'REVOKED', null];

      // Each status should use colors from the theme object
      for (const status of statuses) {
        const result = getStatusDisplay(status, colors);

        // All colors should be hex strings
        expect(result.dotColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(result.textColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });
});
