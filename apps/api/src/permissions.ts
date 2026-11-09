import type { MiddlewareHandler } from 'hono';
import { ApiError } from './lib';
import type { AppEnv } from './types';

export const tokenScopes = [
  'library:read',
  'library:write',
  'subscriptions:read',
  'subscriptions:write',
  'events:read',
  'webhooks:manage',
  'ops:read',
  'ops:manage',
] as const;
export type TokenScope = (typeof tokenScopes)[number];

export function requiredScope(method: string, path: string): TokenScope | null | 'unsupported' {
  const read = method === 'GET' || method === 'HEAD';
  // Existing interactive-only guards retain authority over credential/account operations.
  if (/^\/v1\/(?:tokens|account)(?:\/|$)/.test(path)) return null;
  if (path === '/v1/me') return null;
  if (/^\/v1\/connections(?:\/|$)/.test(path)) return read ? 'library:read' : null;
  if (path === '/v1/export/events') return read ? 'events:read' : 'unsupported';
  if (path === '/v1/export/webhooks') return read ? 'webhooks:manage' : 'unsupported';
  if (/^\/v1\/export\/(?:sources|routes|subscriptions|subscriptionSeen)$/.test(path))
    return read ? 'subscriptions:read' : 'unsupported';
  if (/^\/v1\/events(?:\/|$)/.test(path)) return read ? 'events:read' : 'unsupported';
  if (/^\/v1\/webhooks(?:\/|$)/.test(path)) return 'webhooks:manage';
  if (/^\/v1\/ops(?:\/|$)/.test(path)) return read ? 'ops:read' : 'ops:manage';
  if (/^\/v1\/(?:sources|subscriptions)(?:\/|$)/.test(path))
    return read ? 'subscriptions:read' : 'subscriptions:write';
  if (path === '/v1/items/search' && method === 'POST') return 'library:read';
  if (/^\/v1\/(?:items|collections|jobs|export)(?:\/|$)/.test(path))
    return read ? 'library:read' : 'library:write';
  if (path === '/v1/saves' && method === 'POST') return 'library:write';
  return 'unsupported';
}

/** REST is the shared authorization boundary, including internal MCP/alias dispatch. */
export const authorizeScopes: MiddlewareHandler<AppEnv> = async (c, next) => {
  const principal = c.get('principal');
  if (principal.scopes !== undefined) {
    const scope = requiredScope(c.req.method, c.req.path);
    if (scope && (scope === 'unsupported' || !principal.scopes.includes(scope)))
      throw new ApiError(
        403,
        'insufficient_scope',
        'This credential does not grant the required capability',
        {
          requiredScope: scope === 'unsupported' ? null : scope,
        }
      );
  }
  await next();
};
