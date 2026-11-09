import { Hono } from 'hono';
import { z } from 'zod4';
import { all, ApiError, atomicOwnerWrite, digest, id, now, parseBody, stmt } from './lib';
import type { AppEnv } from './types';
import type { MiddlewareHandler } from 'hono';
import { tokenScopes } from './permissions';
export const tokenInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    expiresInDays: z.number().int().min(1).max(365).default(30),
    scopes: z.array(z.enum(tokenScopes)).min(1).max(tokenScopes.length).default(['library:read']),
  })
  .strict();

export const accessRoutes = new Hono<AppEnv>();
const interactive: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('principal').contributor.startsWith('api-token:'))
    throw new ApiError(
      403,
      'interactive_login_required',
      'Manage API credentials through interactive sign-in'
    );
  await next();
};
accessRoutes.use('/tokens', interactive);
accessRoutes.use('/tokens/*', interactive);
accessRoutes.post('/tokens', async (c) => {
  const input = await parseBody(c.req.raw, tokenInputSchema);
  input.scopes = [...new Set(input.scopes)].sort();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = `zine2_${Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('')}`;
  const tokenId = id('tok');
  const timestamp = now();
  const expiresAt = new Date(Date.now() + input.expiresInDays * 86400000).toISOString();
  await atomicOwnerWrite(c.env, c.get('principal').userId, [
    stmt(
      c.env.DB,
      'INSERT INTO api_tokens(id,owner_id,name,token_hash,expires_at,created_at,scopes_json) VALUES(?,?,?,?,?,?,?)',
      tokenId,
      c.get('principal').userId,
      input.name,
      await digest(token),
      expiresAt,
      timestamp,
      JSON.stringify(input.scopes)
    ),
  ]);
  return c.json(
    { id: tokenId, name: input.name, token, scopes: input.scopes, expiresAt, createdAt: timestamp },
    201
  );
});
accessRoutes.get('/tokens', async (c) => {
  const rows = await all<{
    id: string;
    name: string;
    expiresAt: string;
    revokedAt: string | null;
    createdAt: string;
    lastUsedAt: string | null;
    scopes_json: string;
  }>(
    c.env.DB,
    'SELECT id,name,expires_at AS expiresAt,revoked_at AS revokedAt,created_at AS createdAt,last_used_at AS lastUsedAt,scopes_json FROM api_tokens WHERE owner_id=? ORDER BY created_at DESC',
    c.get('principal').userId
  );
  return c.json({
    tokens: rows.map(({ scopes_json, ...row }) => ({ ...row, scopes: JSON.parse(scopes_json) })),
  });
});
accessRoutes.delete('/tokens/:tokenId', async (c) => {
  const result = await stmt(
    c.env.DB,
    'UPDATE api_tokens SET revoked_at=? WHERE id=? AND owner_id=?',
    now(),
    c.req.param('tokenId'),
    c.get('principal').userId
  ).run();
  if (!result.meta.changes) throw new ApiError(404, 'not_found', 'API token not found');
  return c.body(null, 204);
});
