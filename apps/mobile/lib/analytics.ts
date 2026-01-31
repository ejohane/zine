/**
 * Analytics Utility for React Native
 *
 * Provides type-safe analytics event tracking that adapts to the environment:
 * - Development: Logs events to console for debugging
 * - Production: Ready to connect to analytics service (Segment, Mixpanel, etc.)
 *
 * Features:
 * - Type-safe event definitions
 * - Environment-aware output
 * - No PII validation
 * - React Native compatible
 *
 * @example
 * ```typescript
 * import { analytics } from '@/lib/analytics';
 *
 * analytics.track('creator_view_opened', {
 *   creatorId: 'creator-123',
 *   provider: 'YOUTUBE',
 *   source: 'item_page',
 *   bookmarkCount: 5,
 * });
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Source from which the Creator View was opened
 */
export type CreatorViewSource = 'item_page' | 'search' | 'deep_link';

/**
 * Reason for showing connection prompt
 */
export type ConnectionPromptReason = 'NOT_CONNECTED' | 'TOKEN_EXPIRED';

/**
 * Type of content opened from Creator View
 */
export type CreatorContentType = 'bookmark' | 'latest';

/**
 * Destination of content navigation
 */
export type CreatorContentDestination = 'internal' | 'external';

/**
 * Analytics event definitions
 */
export interface AnalyticsEvents {
  /**
   * Fired when user opens the Creator View screen
   */
  creator_view_opened: {
    creatorId: string;
    provider: string;
    source: CreatorViewSource;
    bookmarkCount: number;
  };

  /**
   * Fired when latest content is successfully fetched
   */
  creator_latest_content_loaded: {
    creatorId: string;
    provider: string;
    contentCount: number;
    hadCache: boolean;
  };

  /**
   * Fired when user taps the subscribe button
   */
  creator_subscribe_tapped: {
    creatorId: string;
    provider: string;
    success: boolean;
    errorReason?: string;
  };

  /**
   * Fired when user opens content from Creator View
   */
  creator_content_opened: {
    creatorId: string;
    contentType: CreatorContentType;
    provider: string;
    destination: CreatorContentDestination;
    itemId?: string | null;
    externalUrl?: string;
  };

  /**
   * Fired when connection prompt is shown
   */
  creator_connect_prompt_shown: {
    creatorId: string;
    provider: string;
    reason: ConnectionPromptReason;
  };
}

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Check if we're in a development-like environment.
 * Uses a function to allow lazy evaluation (important for test environments).
 */
function isDev(): boolean {
  if (typeof __DEV__ !== 'undefined') {
    return __DEV__;
  }
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
}

// ============================================================================
// Formatters
// ============================================================================

/**
 * Format properties for console output.
 */
function formatProperties(properties: Record<string, unknown>): string {
  const parts = Object.entries(properties).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  return parts.join(', ');
}

// ============================================================================
// Analytics Class
// ============================================================================

class Analytics {
  private enabled: boolean = true;

  /**
   * Enable or disable analytics tracking
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Track an analytics event with type-safe properties
   *
   * @param event - The event name
   * @param properties - Event-specific properties
   *
   * @example
   * ```typescript
   * analytics.track('creator_view_opened', {
   *   creatorId: 'creator-123',
   *   provider: 'YOUTUBE',
   *   source: 'item_page',
   *   bookmarkCount: 5,
   * });
   * ```
   */
  track<E extends keyof AnalyticsEvents>(event: E, properties: AnalyticsEvents[E]): void {
    if (!this.enabled) return;

    // In development, log to console directly
    // Uses isDev() function for lazy evaluation (important for test environments)
    if (isDev()) {
      console.log(
        `[Analytics] Event: ${event} | ${formatProperties(properties as Record<string, unknown>)}`
      );
    }

    // TODO(zine-x5ut.4.3): In production, send to analytics service
    // Example with Segment:
    // if (!isDev()) {
    //   SegmentClient.track(event, properties);
    // }
  }

  /**
   * Identify a user for analytics purposes
   * Call this after successful authentication
   *
   * @param userId - Unique user identifier (not email or PII)
   * @param traits - Optional user traits (non-PII)
   */
  identify(userId: string, traits?: Record<string, unknown>): void {
    if (!this.enabled) return;

    if (isDev()) {
      const traitsStr = traits ? `, traits=${JSON.stringify(traits)}` : '';
      console.log(`[Analytics] Identify user | userId="${userId}"${traitsStr}`);
    }

    // TODO(zine-x5ut.4.3): In production, identify to analytics service
    // if (!IS_DEV) {
    //   SegmentClient.identify(userId, traits);
    // }
  }

  /**
   * Reset analytics state (call on logout)
   */
  reset(): void {
    if (isDev()) {
      console.log('[Analytics] Analytics reset');
    }

    // TODO(zine-x5ut.4.3): In production, reset analytics service state
    // if (!isDev()) {
    //   SegmentClient.reset();
    // }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Default analytics instance
 *
 * @example
 * ```typescript
 * import { analytics } from '@/lib/analytics';
 *
 * analytics.track('creator_view_opened', { ... });
 * ```
 */
export const analytics = new Analytics();
