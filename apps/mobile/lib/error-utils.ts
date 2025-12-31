/**
 * Unified Error Classification Utilities
 *
 * Provides consistent error classification across the mobile app for:
 * - Offline queue retry logic
 * - Error boundary UI display
 * - Error tracking and reporting
 *
 * @see offline-queue.ts for retry behavior based on error types
 * @see query-error-boundary.tsx for UI display based on error types
 */

import { TRPCClientError } from '@trpc/client';

// ============================================================================
// Types
// ============================================================================

/**
 * Error classification for determining handling behavior.
 *
 * @property network - No connectivity (fetch failed, timeout, connection refused)
 * @property auth - Authentication failure (401 Unauthorized)
 * @property validation - Invalid input (4xx client errors except 401/409)
 * @property conflict - Resource conflict (409 - action already done)
 * @property server - Server error (5xx)
 * @property timeout - Request timed out
 * @property unknown - Can't classify
 */
export type ErrorType =
  | 'network'
  | 'auth'
  | 'validation'
  | 'conflict'
  | 'server'
  | 'timeout'
  | 'unknown';

/**
 * Legacy error classification type used by offline-queue.ts
 * Maps to ErrorType for backward compatibility
 */
export type ErrorClassification = 'NETWORK' | 'AUTH' | 'CONFLICT' | 'CLIENT' | 'SERVER' | 'UNKNOWN';

// ============================================================================
// Network Error Detection
// ============================================================================

/**
 * Network error message patterns to check against.
 * These cover various network failure scenarios across platforms.
 */
const NETWORK_ERROR_PATTERNS = [
  'network request failed',
  'failed to fetch',
  'network error',
  'net::err',
  'econnrefused',
  'enotfound',
  'unable to resolve host',
  'no internet connection',
  'offline',
  'connection',
  'aborted',
] as const;

/**
 * Check if an error is a network error (no connectivity).
 *
 * Detects:
 * - TypeError from fetch failures
 * - AbortError from timeouts
 * - Errors with network-related messages
 *
 * @param error - The error to check
 * @returns true if the error is network-related
 */
export function isNetworkError(error: unknown): boolean {
  // TypeError from fetch (connection refused, no network, etc.)
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase();
    return msg.includes('network') || msg.includes('fetch');
  }

  if (error instanceof Error) {
    const message = error.message?.toLowerCase() ?? '';
    const name = error.name?.toLowerCase() ?? '';

    // Check error message against known patterns
    if (NETWORK_ERROR_PATTERNS.some((pattern) => message.includes(pattern))) {
      return true;
    }

    // TypeError with fetch in message
    if (name === 'typeerror' && message.includes('fetch')) {
      return true;
    }

    // AbortError from request timeout
    if (name === 'aborterror') {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Auth Error Detection
// ============================================================================

/**
 * Check if an error is an authentication error (401 Unauthorized).
 *
 * Detects:
 * - tRPC errors with UNAUTHORIZED code
 * - HTTP 401 status codes
 *
 * @param error - The error to check
 * @returns true if the error is auth-related
 */
export function isAuthError(error: unknown): boolean {
  // tRPC client error with UNAUTHORIZED code
  if (error instanceof TRPCClientError) {
    return error.data?.code === 'UNAUTHORIZED';
  }

  // Generic object with status/code properties
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    const data = errorObj.data as Record<string, unknown> | undefined;
    const httpStatus = data?.httpStatus ?? errorObj.status ?? errorObj.statusCode;
    const code = data?.code ?? errorObj.code;

    return httpStatus === 401 || code === 'UNAUTHORIZED';
  }

  return false;
}

// ============================================================================
// Timeout Error Detection
// ============================================================================

/**
 * Check if an error is a timeout error.
 *
 * @param error - The error to check
 * @returns true if the error is timeout-related
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    return message.includes('timeout') || name === 'aborterror' || name === 'timeouterror';
  }

  return false;
}

// ============================================================================
// Server Error Detection
// ============================================================================

/**
 * Check if an error is a server error (5xx).
 *
 * @param error - The error to check
 * @returns true if the error is a server error
 */
export function isServerError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    const data = errorObj.data as Record<string, unknown> | undefined;
    const httpStatus = data?.httpStatus ?? errorObj.status ?? errorObj.statusCode;

    return typeof httpStatus === 'number' && httpStatus >= 500;
  }

  return false;
}

// ============================================================================
// Conflict Error Detection
// ============================================================================

/**
 * Check if an error is a conflict error (409).
 *
 * @param error - The error to check
 * @returns true if the error is a conflict error
 */
export function isConflictError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    const data = errorObj.data as Record<string, unknown> | undefined;
    const httpStatus = data?.httpStatus ?? errorObj.status ?? errorObj.statusCode;
    const code = data?.code ?? errorObj.code;

    return httpStatus === 409 || code === 'CONFLICT';
  }

  return false;
}

// ============================================================================
// Validation/Client Error Detection
// ============================================================================

/**
 * Check if an error is a validation/client error (4xx except 401, 409).
 *
 * @param error - The error to check
 * @returns true if the error is a client validation error
 */
export function isValidationError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const errorObj = error as Record<string, unknown>;
    const data = errorObj.data as Record<string, unknown> | undefined;
    const httpStatus = data?.httpStatus ?? errorObj.status ?? errorObj.statusCode;

    if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
      // Exclude 401 (auth) and 409 (conflict)
      return httpStatus !== 401 && httpStatus !== 409;
    }
  }

  return false;
}

// ============================================================================
// Unified Error Classification
// ============================================================================

/**
 * Classify an error for appropriate handling.
 *
 * Classification priority:
 * 1. Network-level failures (TypeError from fetch, connection errors)
 * 2. Timeout errors (AbortError, timeout messages)
 * 3. Auth errors (401 Unauthorized)
 * 4. Conflict errors (409 Conflict)
 * 5. Validation/client errors (4xx except 401, 409)
 * 6. Server errors (5xx)
 * 7. Unknown (default)
 *
 * @param error - The error to classify
 * @returns The error type classification
 */
export function classifyError(error: unknown): ErrorType {
  if (isNetworkError(error)) return 'network';
  if (isTimeoutError(error)) return 'timeout';
  if (isAuthError(error)) return 'auth';
  if (isConflictError(error)) return 'conflict';
  if (isValidationError(error)) return 'validation';
  if (isServerError(error)) return 'server';
  return 'unknown';
}

/**
 * Classify an error using legacy ErrorClassification type.
 *
 * This provides backward compatibility with offline-queue.ts which uses
 * uppercase error classifications. Maps the new ErrorType to the legacy format.
 *
 * @param error - The error to classify
 * @returns The legacy error classification
 */
export function classifyErrorLegacy(error: unknown): ErrorClassification {
  const errorType = classifyError(error);

  switch (errorType) {
    case 'network':
    case 'timeout':
      return 'NETWORK';
    case 'auth':
      return 'AUTH';
    case 'conflict':
      return 'CONFLICT';
    case 'validation':
      return 'CLIENT';
    case 'server':
      return 'SERVER';
    case 'unknown':
    default:
      return 'UNKNOWN';
  }
}

// ============================================================================
// Error Message Utilities
// ============================================================================

/**
 * Get a user-friendly error message based on error type.
 *
 * @param error - The error to get a message for
 * @param fallbackMessage - Optional fallback message
 * @returns A user-friendly error message
 */
export function getErrorMessage(error: unknown, fallbackMessage?: string): string {
  if (!error) {
    return fallbackMessage ?? 'An unexpected error occurred';
  }

  const errorType = classifyError(error);

  switch (errorType) {
    case 'network':
      return 'Unable to connect. Please check your internet connection and try again.';
    case 'timeout':
      return 'The request timed out. Please try again.';
    case 'auth':
      return 'Your session has expired. Please sign in again.';
    case 'server':
      return 'Something went wrong on our end. Please try again later.';
    case 'validation':
      return fallbackMessage ?? (error instanceof Error ? error.message : 'Invalid request');
    case 'conflict':
      return fallbackMessage ?? 'This action has already been completed.';
    case 'unknown':
    default:
      return (
        fallbackMessage ?? (error instanceof Error ? error.message : 'An unexpected error occurred')
      );
  }
}
