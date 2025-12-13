/**
 * Authentication helpers for Clerk token verification
 */

import * as jose from 'jose';

/**
 * Clerk JWT payload structure
 */
export interface ClerkJWTPayload extends jose.JWTPayload {
  /** Clerk user ID */
  sub: string;
  /** Authorized parties */
  azp?: string;
  /** Session ID */
  sid?: string;
}

/**
 * Result of token verification
 */
export interface VerifyTokenResult {
  success: true;
  userId: string;
  payload: ClerkJWTPayload;
}

/**
 * Error result from token verification
 */
export interface VerifyTokenError {
  success: false;
  error: string;
  code: 'MISSING_TOKEN' | 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'JWKS_ERROR';
}

export type VerifyTokenResponse = VerifyTokenResult | VerifyTokenError;

/** JWKS cache for performance */
let jwksCache: jose.JWTVerifyGetKey | null = null;

/**
 * Get or create JWKS remote key set
 */
function getJWKS(jwksUrl: string): jose.JWTVerifyGetKey {
  if (!jwksCache) {
    jwksCache = jose.createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwksCache;
}

/**
 * Clear JWKS cache (useful for testing or key rotation)
 */
export function clearJWKSCache(): void {
  jwksCache = null;
}

/**
 * Verify a Clerk JWT token
 *
 * @param token - The JWT token to verify (without "Bearer " prefix)
 * @param jwksUrl - The Clerk JWKS URL for key verification
 * @returns Verification result with user ID or error details
 */
export async function verifyClerkToken(
  token: string | undefined,
  jwksUrl: string
): Promise<VerifyTokenResponse> {
  if (!token) {
    return {
      success: false,
      error: 'No authentication token provided',
      code: 'MISSING_TOKEN',
    };
  }

  try {
    const JWKS = getJWKS(jwksUrl);

    const { payload } = await jose.jwtVerify(token, JWKS, {
      // Clerk tokens have specific requirements
      clockTolerance: 5, // 5 seconds clock tolerance
    });

    const clerkPayload = payload as ClerkJWTPayload;

    if (!clerkPayload.sub) {
      return {
        success: false,
        error: 'Token missing subject claim',
        code: 'INVALID_TOKEN',
      };
    }

    return {
      success: true,
      userId: clerkPayload.sub,
      payload: clerkPayload,
    };
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      return {
        success: false,
        error: 'Token has expired',
        code: 'EXPIRED_TOKEN',
      };
    }

    if (error instanceof jose.errors.JWKSNoMatchingKey) {
      return {
        success: false,
        error: 'No matching key found in JWKS',
        code: 'JWKS_ERROR',
      };
    }

    // Generic JWT verification error
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token verification failed',
      code: 'INVALID_TOKEN',
    };
  }
}
