/**
 * Authentication middleware for Hono
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { verifyClerkToken } from '../lib/auth';
import { createDb } from '../db';
import { users } from '../db/schema';

/**
 * Default JWKS URL for Clerk (can be overridden via environment)
 */
const DEFAULT_CLERK_JWKS_URL = 'https://clerk.zine.app/.well-known/jwks.json';

/**
 * Development user ID used when auth is bypassed
 */
const DEV_USER_ID = 'dev-user-001';

/**
 * Flag to track if we've already ensured the dev user exists
 * (avoids unnecessary DB queries on every request)
 */
let devUserEnsured = false;

/**
 * Error response structure for auth failures
 */
interface AuthErrorResponse {
  error: string;
  code: string;
  requestId: string;
}

/**
 * Create a structured auth error response
 */
function createAuthError(message: string, code: string, requestId: string): AuthErrorResponse {
  return {
    error: message,
    code,
    requestId,
  };
}

/**
 * Authentication middleware that verifies Clerk JWT tokens
 *
 * Extracts the Bearer token from the Authorization header,
 * verifies it against Clerk's JWKS, and sets the userId
 * in the context if valid.
 *
 * Returns 401 Unauthorized if no token is provided.
 * Returns 403 Forbidden if the token is invalid or expired.
 *
 * The userId is set on the Hono context via `c.set('userId', ...)` and can be
 * accessed in route handlers or tRPC context via `c.get('userId')`.
 *
 * @example
 * ```typescript
 * // Apply to protected routes
 * import { authMiddleware } from './middleware/auth';
 * app.use('/api/*', authMiddleware());
 *
 * // Access userId in tRPC context
 * export async function createContext(c: Context): Promise<TRPCContext> {
 *   const userId = c.get('userId'); // Set by auth middleware
 *   return { userId, db };
 * }
 * ```
 */
export function authMiddleware(): MiddlewareHandler<Env> {
  return async (c, next) => {
    const requestId = c.get('requestId') || 'unknown';

    // Development bypass: use mock user ID when no auth is configured
    if (c.env.ENVIRONMENT === 'development' || !c.env.CLERK_JWKS_URL) {
      // Ensure dev user exists in database (only once per process)
      if (!devUserEnsured) {
        try {
          const db = createDb(c.env.DB);
          const now = new Date().toISOString();
          await db
            .insert(users)
            .values({
              id: DEV_USER_ID,
              email: 'dev@example.com',
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing();
          devUserEnsured = true;
        } catch (error) {
          console.warn('[auth] Failed to ensure dev user exists:', error);
          // Continue anyway - user might already exist
        }
      }
      c.set('userId', DEV_USER_ID);
      await next();
      return;
    }

    const authHeader = c.req.header('Authorization');

    // Check for Authorization header
    if (!authHeader) {
      return c.json(
        createAuthError('Authorization header is required', 'MISSING_AUTH_HEADER', requestId),
        401
      );
    }

    // Check for Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      return c.json(
        createAuthError(
          'Authorization header must use Bearer scheme',
          'INVALID_AUTH_SCHEME',
          requestId
        ),
        401
      );
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix

    if (!token) {
      return c.json(createAuthError('Bearer token is empty', 'EMPTY_TOKEN', requestId), 401);
    }

    // Get JWKS URL from environment or use default
    const jwksUrl = c.env.CLERK_JWKS_URL || DEFAULT_CLERK_JWKS_URL;

    // Verify the token
    const result = await verifyClerkToken(token, jwksUrl);

    if (!result.success) {
      // Map error codes to HTTP status codes
      const statusCode =
        result.code === 'EXPIRED_TOKEN' || result.code === 'INVALID_TOKEN' ? 403 : 401;

      return c.json(createAuthError(result.error, result.code, requestId), statusCode);
    }

    // Set userId in context for downstream handlers
    c.set('userId', result.userId);

    await next();
  };
}

/**
 * Optional authentication middleware
 *
 * Similar to authMiddleware but doesn't fail if no token is provided.
 * Sets userId to null if no valid token is present.
 * Useful for routes that work differently for authenticated vs anonymous users.
 *
 * @example
 * ```typescript
 * app.use('/api/public/*', optionalAuthMiddleware());
 *
 * app.get('/api/public/profile', (c) => {
 *   const userId = c.get('userId');
 *   if (userId) {
 *     // Return personalized content
 *   } else {
 *     // Return anonymous content
 *   }
 * });
 * ```
 */
export function optionalAuthMiddleware(): MiddlewareHandler<Env> {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization');

    // No auth header - that's okay, continue without userId
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      c.set('userId', null);
      await next();
      return;
    }

    const token = authHeader.slice(7);

    if (!token) {
      c.set('userId', null);
      await next();
      return;
    }

    const jwksUrl = c.env.CLERK_JWKS_URL || DEFAULT_CLERK_JWKS_URL;
    const result = await verifyClerkToken(token, jwksUrl);

    // Set userId if valid, null otherwise
    c.set('userId', result.success ? result.userId : null);

    await next();
  };
}
