/**
 * OAuth error handling utilities for classifying and displaying OAuth errors.
 *
 * This module provides:
 * - OAuthErrorCode enum for standardized error classification
 * - OAuthError interface for structured error representation
 * - parseOAuthError function to classify errors from various sources
 *
 * Used by OAuthErrorBoundary to display specialized recovery options.
 */

/**
 * Standardized OAuth error codes for classification.
 */
export enum OAuthErrorCode {
  USER_CANCELLED = 'user_cancelled',
  USER_DENIED = 'access_denied',
  STATE_EXPIRED = 'state_expired',
  STATE_MISMATCH = 'state_mismatch',
  STATE_NOT_FOUND = 'state_not_found',
  VERIFIER_NOT_FOUND = 'verifier_not_found',
  NETWORK_ERROR = 'network_error',
  TOKEN_EXCHANGE_FAILED = 'token_exchange_failed',
  PROVIDER_ERROR = 'provider_error',
  INVALID_GRANT = 'invalid_grant',
  INVALID_SCOPE = 'invalid_scope',
  INVALID_REDIRECT = 'invalid_redirect',
  DEEP_LINK_FAILED = 'deep_link_failed',
  SESSION_NOT_FOUND = 'session_not_found',
  UNKNOWN = 'unknown_error',
}

/**
 * Structured OAuth error with recovery information.
 */
export interface OAuthError {
  /** Standardized error code for UI classification */
  code: OAuthErrorCode;
  /** Human-readable error message */
  message: string;
  /** Whether the error can be recovered from */
  recoverable: boolean;
  /** Suggested recovery action */
  action?: 'retry' | 'reauthorize' | 'contact_support';
}

/**
 * UI configuration for displaying OAuth errors.
 * Maps error codes to emoji, title, and description.
 */
export interface OAuthErrorDisplay {
  emoji: string;
  title: string;
  description: string;
}

/**
 * Get display configuration for an OAuth error code.
 *
 * @param code - The OAuth error code
 * @param providerName - Human-readable provider name (e.g., "YouTube", "Spotify")
 * @returns Display configuration with emoji, title, and description
 */
export function getOAuthErrorDisplay(
  code: OAuthErrorCode,
  providerName: string = 'the provider'
): OAuthErrorDisplay {
  switch (code) {
    case OAuthErrorCode.USER_CANCELLED:
      return {
        emoji: '🚫',
        title: 'Connection Cancelled',
        description: `You cancelled the ${providerName} connection. Tap below to try again.`,
      };

    case OAuthErrorCode.USER_DENIED:
      return {
        emoji: '🔒',
        title: 'Access Denied',
        description: `You denied access to your ${providerName} account. We need permission to import your subscriptions.`,
      };

    case OAuthErrorCode.NETWORK_ERROR:
      return {
        emoji: '📡',
        title: 'Connection Problem',
        description: 'Please check your internet connection and try again.',
      };

    case OAuthErrorCode.STATE_MISMATCH:
    case OAuthErrorCode.STATE_EXPIRED:
    case OAuthErrorCode.STATE_NOT_FOUND:
      return {
        emoji: '🔐',
        title: 'Security Check Failed',
        description: 'The connection session expired or was invalid. Please try again.',
      };

    case OAuthErrorCode.VERIFIER_NOT_FOUND:
    case OAuthErrorCode.SESSION_NOT_FOUND:
      return {
        emoji: '⏰',
        title: 'Session Expired',
        description: 'Your connection session has expired. Please start over.',
      };

    case OAuthErrorCode.INVALID_GRANT:
      return {
        emoji: '🔄',
        title: 'Authorization Expired',
        description: 'The authorization code has expired. Please try connecting again.',
      };

    case OAuthErrorCode.TOKEN_EXCHANGE_FAILED:
      return {
        emoji: '⚠️',
        title: 'Connection Failed',
        description: `We couldn't complete the ${providerName} connection. Please try again.`,
      };

    case OAuthErrorCode.INVALID_SCOPE:
      return {
        emoji: '🚷',
        title: 'Permission Error',
        description: `We couldn't get the required permissions from ${providerName}.`,
      };

    case OAuthErrorCode.INVALID_REDIRECT:
    case OAuthErrorCode.DEEP_LINK_FAILED:
      return {
        emoji: '🔗',
        title: 'Redirect Error',
        description: 'There was a problem returning to the app. Please try again.',
      };

    case OAuthErrorCode.PROVIDER_ERROR:
      return {
        emoji: '🏢',
        title: 'Provider Error',
        description: `${providerName} is having issues. Please try again later.`,
      };

    case OAuthErrorCode.UNKNOWN:
    default:
      return {
        emoji: '❓',
        title: 'Connection Error',
        description: `We couldn't complete the ${providerName} connection. Please try again.`,
      };
  }
}

/**
 * Parse an error into a structured OAuthError.
 *
 * Handles errors from various sources:
 * - OAuth provider error responses (error/error_description params)
 * - Error strings from the OAuth flow
 * - Error objects with message property
 *
 * @param error - The error to parse (unknown type for flexibility)
 * @returns Structured OAuthError with classification and recovery info
 *
 * @example
 * ```typescript
 * // From OAuth provider
 * const error = parseOAuthError({ error: 'access_denied' });
 * // { code: 'access_denied', message: 'You denied access...', recoverable: true }
 *
 * // From string
 * const error = parseOAuthError('OAuth flow cancelled');
 * // { code: 'user_cancelled', message: 'Authorization was cancelled', recoverable: true }
 * ```
 */
export function parseOAuthError(error: unknown): OAuthError {
  // Handle OAuth provider error object (from URL params)
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;

    // Standard OAuth error response
    if (errorObj.error === 'access_denied') {
      return {
        code: OAuthErrorCode.USER_DENIED,
        message: 'You denied access to your account',
        recoverable: true,
        action: 'retry',
      };
    }

    if (errorObj.error === 'invalid_grant') {
      return {
        code: OAuthErrorCode.INVALID_GRANT,
        message: 'Authorization code expired. Please try again.',
        recoverable: true,
        action: 'retry',
      };
    }

    if (errorObj.error === 'invalid_scope') {
      return {
        code: OAuthErrorCode.INVALID_SCOPE,
        message: 'Invalid permissions requested.',
        recoverable: true,
        action: 'retry',
      };
    }

    // Check for message property (Error objects)
    if (typeof errorObj.message === 'string') {
      return parseOAuthError(errorObj.message);
    }

    // Check for error property as string
    if (typeof errorObj.error === 'string') {
      return {
        code: OAuthErrorCode.PROVIDER_ERROR,
        message: String(errorObj.error_description || errorObj.error),
        recoverable: true,
        action: 'retry',
      };
    }
  }

  // Handle error strings
  if (typeof error === 'string') {
    const errorLower = error.toLowerCase();

    // User cancelled
    if (errorLower.includes('cancelled') || errorLower.includes('canceled')) {
      return {
        code: OAuthErrorCode.USER_CANCELLED,
        message: 'Authorization was cancelled',
        recoverable: true,
        action: 'retry',
      };
    }

    // User denied
    if (errorLower.includes('denied') || errorLower.includes('access_denied')) {
      return {
        code: OAuthErrorCode.USER_DENIED,
        message: 'You denied access to your account',
        recoverable: true,
        action: 'retry',
      };
    }

    // Network errors
    if (
      errorLower.includes('network') ||
      errorLower.includes('fetch') ||
      errorLower.includes('timeout') ||
      errorLower.includes('connection')
    ) {
      return {
        code: OAuthErrorCode.NETWORK_ERROR,
        message: 'Network error. Please check your connection.',
        recoverable: true,
        action: 'retry',
      };
    }

    // State validation errors
    if (errorLower.includes('state') && errorLower.includes('mismatch')) {
      return {
        code: OAuthErrorCode.STATE_MISMATCH,
        message: 'Security validation failed. Please try again.',
        recoverable: true,
        action: 'retry',
      };
    }

    if (errorLower.includes('state') && errorLower.includes('expired')) {
      return {
        code: OAuthErrorCode.STATE_EXPIRED,
        message: 'Session expired. Please try again.',
        recoverable: true,
        action: 'retry',
      };
    }

    if (errorLower.includes('state') && errorLower.includes('not found')) {
      return {
        code: OAuthErrorCode.STATE_NOT_FOUND,
        message: 'Session not found. Please try again.',
        recoverable: true,
        action: 'retry',
      };
    }

    // PKCE verifier errors
    if (errorLower.includes('verifier') && errorLower.includes('not found')) {
      return {
        code: OAuthErrorCode.VERIFIER_NOT_FOUND,
        message: 'OAuth session corrupted. Please try again.',
        recoverable: true,
        action: 'retry',
      };
    }

    // Token exchange errors
    if (errorLower.includes('token') && errorLower.includes('exchange')) {
      return {
        code: OAuthErrorCode.TOKEN_EXCHANGE_FAILED,
        message: 'Failed to complete authentication. Please try again.',
        recoverable: true,
        action: 'retry',
      };
    }

    // Invalid grant
    if (errorLower.includes('invalid_grant') || errorLower.includes('invalid grant')) {
      return {
        code: OAuthErrorCode.INVALID_GRANT,
        message: 'Authorization code expired. Please try again.',
        recoverable: true,
        action: 'retry',
      };
    }

    // Deep link errors
    if (errorLower.includes('deep link') || errorLower.includes('redirect')) {
      return {
        code: OAuthErrorCode.DEEP_LINK_FAILED,
        message: 'Failed to return to app. Please try again.',
        recoverable: true,
        action: 'retry',
      };
    }
  }

  // Default unknown error
  return {
    code: OAuthErrorCode.UNKNOWN,
    message: typeof error === 'string' ? error : 'An unexpected error occurred',
    recoverable: true,
    action: 'retry',
  };
}
