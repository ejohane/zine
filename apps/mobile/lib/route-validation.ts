/**
 * Route Parameter Validation
 *
 * Provides utilities for validating dynamic route parameters.
 * Ensures type safety at runtime, not just compile time.
 *
 * Uses type guards from @zine/shared for consistent validation.
 *
 * @see zine-b4h.27 - Add input validation for route params
 */

import type { Provider } from '@zine/shared';

// ============================================================================
// Constants
// ============================================================================

/**
 * Valid lowercase provider values for route parameters.
 * Routes use lowercase (youtube/spotify), backend uses uppercase (YOUTUBE/SPOTIFY).
 */
export const VALID_PROVIDER_ROUTES = ['youtube', 'spotify'] as const;
export type ProviderRoute = (typeof VALID_PROVIDER_ROUTES)[number];

// ============================================================================
// Validation Result Types
// ============================================================================

export type ValidationSuccess<T> = {
  success: true;
  data: T;
};

export type ValidationError = {
  success: false;
  message: string;
};

export type ValidationResult<T> = ValidationSuccess<T> | ValidationError;

// ============================================================================
// ID Validation
// ============================================================================

/**
 * Maximum length for item IDs.
 * Prevents potential abuse and ensures reasonable storage.
 */
const MAX_ID_LENGTH = 100;

/**
 * Type guard to check if an ID is valid (non-empty string within length limit).
 *
 * @example
 * if (!isValidId(id)) {
 *   return <NotFoundScreen />;
 * }
 */
export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

/**
 * Validates an item ID parameter.
 * Returns a discriminated union for easy pattern matching.
 *
 * @example
 * const result = validateItemId(id);
 * if (!result.success) {
 *   return <InvalidParamScreen message={result.message} />;
 * }
 * // result.data is now typed and validated
 */
export function validateItemId(value: unknown): ValidationResult<string> {
  if (typeof value !== 'string') {
    return { success: false, message: 'Item ID is required' };
  }

  if (value.length === 0) {
    return { success: false, message: 'Item ID is required' };
  }

  if (value.length > MAX_ID_LENGTH) {
    return { success: false, message: 'Item ID is too long' };
  }

  return { success: true, data: value };
}

// ============================================================================
// Provider Validation
// ============================================================================

/**
 * Type guard to check if a lowercase string is a valid provider route.
 *
 * @example
 * if (!isValidProviderRoute(provider)) {
 *   router.replace('/onboarding');
 *   return null;
 * }
 */
export function isValidProviderRoute(value: unknown): value is ProviderRoute {
  return (
    typeof value === 'string' &&
    VALID_PROVIDER_ROUTES.includes(value.toLowerCase() as ProviderRoute)
  );
}

/**
 * Normalizes a provider string to lowercase route format.
 * Returns undefined if invalid.
 *
 * @example
 * const provider = normalizeProviderRoute(params.provider);
 * if (!provider) {
 *   return <InvalidParamScreen param="provider" />;
 * }
 */
export function normalizeProviderRoute(value: unknown): ProviderRoute | undefined {
  if (typeof value !== 'string') return undefined;
  const lower = value.toLowerCase() as ProviderRoute;
  if (VALID_PROVIDER_ROUTES.includes(lower)) {
    return lower;
  }
  return undefined;
}

/**
 * Converts a route provider (lowercase) to backend Provider enum (uppercase).
 *
 * @example
 * const backendProvider = toBackendProvider('youtube'); // 'YOUTUBE'
 */
export function toBackendProvider(routeProvider: ProviderRoute): Provider {
  return routeProvider.toUpperCase() as Provider;
}

/**
 * Validates a provider route parameter.
 * Returns the normalized lowercase provider or an error.
 *
 * @example
 * const result = validateProviderRoute(params.provider);
 * if (!result.success) {
 *   return <InvalidParamScreen message={result.message} />;
 * }
 * // result.data is 'youtube' | 'spotify'
 */
export function validateProviderRoute(value: unknown): ValidationResult<ProviderRoute> {
  if (typeof value !== 'string') {
    return { success: false, message: 'Provider is required' };
  }

  const normalized = normalizeProviderRoute(value);
  if (!normalized) {
    return {
      success: false,
      message: `Invalid provider "${value}". Must be one of: ${VALID_PROVIDER_ROUTES.join(', ')}`,
    };
  }

  return { success: true, data: normalized };
}

/**
 * Validates and converts a provider route parameter to backend format.
 * Returns the uppercase Provider enum value or an error.
 *
 * @example
 * const result = validateAndConvertProvider(params.provider);
 * if (!result.success) {
 *   return <InvalidParamScreen message={result.message} />;
 * }
 * // result.data is 'YOUTUBE' | 'SPOTIFY'
 */
export function validateAndConvertProvider(
  value: unknown
): ValidationResult<'YOUTUBE' | 'SPOTIFY'> {
  const routeResult = validateProviderRoute(value);
  if (!routeResult.success) {
    return routeResult;
  }

  return { success: true, data: toBackendProvider(routeResult.data) as 'YOUTUBE' | 'SPOTIFY' };
}
