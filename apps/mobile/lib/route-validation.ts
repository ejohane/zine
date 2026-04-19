import type { OAuthProvider, Provider } from '@zine/shared/types';

// Routes use lowercase provider slugs; the backend uses uppercase enum values.
export const VALID_PROVIDER_ROUTES = ['youtube', 'spotify', 'gmail'] as const;
export type ProviderRoute = (typeof VALID_PROVIDER_ROUTES)[number];

// Gmail uses newsletter detection instead of creator discovery.
export const VALID_DISCOVER_PROVIDER_ROUTES = ['youtube', 'spotify'] as const;
export type DiscoverProviderRoute = (typeof VALID_DISCOVER_PROVIDER_ROUTES)[number];

export type ValidationSuccess<T> = {
  success: true;
  data: T;
};

export type ValidationError = {
  success: false;
  message: string;
};

export type ValidationResult<T> = ValidationSuccess<T> | ValidationError;

const MAX_ID_LENGTH = 100;

export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

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

export function isValidProviderRoute(value: unknown): value is ProviderRoute {
  return normalizeProviderRoute(value) !== undefined;
}

export function normalizeProviderRoute(value: unknown): ProviderRoute | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase() as ProviderRoute;
  if (VALID_PROVIDER_ROUTES.includes(normalized)) {
    return normalized;
  }

  return undefined;
}

export function toBackendProvider(routeProvider: ProviderRoute): Provider {
  return routeProvider.toUpperCase() as Provider;
}

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

export function validateAndConvertProvider(value: unknown): ValidationResult<OAuthProvider> {
  const routeResult = validateProviderRoute(value);
  if (!routeResult.success) {
    return routeResult;
  }

  return {
    success: true,
    data: toBackendProvider(routeResult.data) as OAuthProvider,
  };
}

// Discovery only supports providers with creator/channel browsing.
export function validateAndConvertDiscoverProvider(
  value: unknown
): ValidationResult<Extract<OAuthProvider, 'YOUTUBE' | 'SPOTIFY'>> {
  const routeResult = validateProviderRoute(value);
  if (!routeResult.success) {
    return routeResult;
  }

  if (!VALID_DISCOVER_PROVIDER_ROUTES.includes(routeResult.data as DiscoverProviderRoute)) {
    return {
      success: false,
      message: `Provider "${routeResult.data}" is not supported for discovery.`,
    };
  }

  return {
    success: true,
    data: routeResult.data.toUpperCase() as Extract<OAuthProvider, 'YOUTUBE' | 'SPOTIFY'>,
  };
}
