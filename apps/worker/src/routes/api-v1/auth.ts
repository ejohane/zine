import { and, eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { createDb } from '../../db';
import { apiTokens } from '../../db/schema';
import {
  type ApiTokenScope,
  API_TOKEN_PREFIX,
  hasApiTokenScope,
  hashApiToken,
  isApiTokenActive,
} from '../../lib/api-tokens';
import { getDevelopmentAuthBypassUserId, verifyClerkRequestToken } from '../../middleware/auth';
import type { Env } from '../../types';

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function apiAuth(requiredPatScope: ApiTokenScope) {
  const middleware: MiddlewareHandler<Env> = async (c, next) => {
    const requestId = c.get('requestId');
    const traceId = c.get('traceId');
    const developmentUserId = getDevelopmentAuthBypassUserId(c.env);

    if (developmentUserId) {
      c.set('userId', developmentUserId);
      await next();
      return;
    }

    const rawToken = extractBearerToken(c.req.header('Authorization'));

    if (!rawToken) {
      return c.json(
        {
          error: 'Unauthorized',
          code: 'UNAUTHORIZED',
          requestId,
          traceId,
        },
        401
      );
    }

    if (!rawToken.startsWith(API_TOKEN_PREFIX)) {
      const result = await verifyClerkRequestToken(rawToken, c.env);
      if (!result.success) {
        c.header('X-Zine-Auth-Error', result.code);
        return c.json(
          {
            error: result.error,
            code: result.code,
            requestId,
            traceId,
          },
          result.code === 'INVALID_TOKEN' || result.code === 'EXPIRED_TOKEN' ? 403 : 401
        );
      }

      c.set('userId', result.userId);
      await next();
      return;
    }

    const tokenHash = await hashApiToken(rawToken);
    const db = createDb(c.env.DB);
    const token = await db.query.apiTokens.findFirst({
      where: eq(apiTokens.tokenHash, tokenHash),
    });

    if (!token || !isApiTokenActive(token)) {
      return c.json(
        {
          error: 'Unauthorized',
          code: 'UNAUTHORIZED',
          requestId,
          traceId,
        },
        401
      );
    }

    if (!hasApiTokenScope(token, requiredPatScope)) {
      return c.json(
        {
          error: 'Forbidden',
          code: 'FORBIDDEN',
          requestId,
          traceId,
        },
        403
      );
    }

    await db
      .update(apiTokens)
      .set({ lastUsedAt: Date.now() })
      .where(and(eq(apiTokens.id, token.id), eq(apiTokens.userId, token.userId)));

    c.set('userId', token.userId);
    await next();
  };

  return middleware;
}
