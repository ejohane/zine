import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import { ApiError, digest, now, ownerGeneration, stmt } from './lib';
import type { AppEnv } from './types';
import { tokenScopes } from './permissions';

const keysets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = c.req.header('authorization');
  if (!auth?.startsWith('Bearer '))
    throw new ApiError(401, 'unauthorized', 'Bearer authentication required');
  const token = auth.slice(7);
  if (token.startsWith('zine2_')) {
    const row = await stmt(
      c.env.DB,
      'SELECT id,owner_id,scopes_json,COALESCE((SELECT generation FROM owner_generations WHERE owner_id=api_tokens.owner_id),0) AS generation FROM api_tokens WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?',
      await digest(token),
      now()
    ).first<{ id: string; owner_id: string; generation: number; scopes_json: string }>();
    if (!row) throw new ApiError(401, 'invalid_token', 'API token is invalid, expired, or revoked');
    let scopes: string[];
    try {
      const parsed: unknown = JSON.parse(row.scopes_json);
      if (
        !Array.isArray(parsed) ||
        parsed.some(
          (scope) =>
            typeof scope !== 'string' || !(tokenScopes as readonly string[]).includes(scope)
        )
      )
        throw new Error('Invalid scopes');
      scopes = parsed;
    } catch {
      throw new ApiError(401, 'invalid_token', 'API credential capabilities are invalid');
    }
    c.set('principal', {
      userId: row.owner_id,
      contributor: `api-token:${row.id}`,
      tokenId: row.id,
      scopes,
    });
    await stmt(c.env.DB, 'UPDATE api_tokens SET last_used_at=? WHERE id=?', now(), row.id).run();
    c.env = {
      ...c.env,
      OPERATION_EPOCH:
        c.env.OPERATION_EPOCH?.owner === row.owner_id
          ? c.env.OPERATION_EPOCH
          : { owner: row.owner_id, generation: row.generation },
    };
    await next();
    return;
  }
  const { AUTH_ISSUER: issuer, AUTH_AUDIENCE: audience } = c.env;
  const parties =
    c.env.AUTH_AUTHORIZED_PARTIES?.split(',')
      .map((party) => party.trim())
      .filter(Boolean) ?? [];
  if (!issuer || (!audience && !parties.length))
    throw new ApiError(503, 'auth_not_configured', 'Authentication is not configured');
  const jwksUrl = c.env.AUTH_JWKS_URL ?? `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`;
  let keys = keysets.get(jwksUrl);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(jwksUrl));
    keysets.set(jwksUrl, keys);
  }
  try {
    const { payload } = await jwtVerify(auth.slice(7), keys, {
      issuer,
      ...(audience ? { audience } : {}),
      algorithms: ['RS256', 'ES256'],
      requiredClaims: ['sub', 'exp', 'iat'],
    });
    if (
      typeof payload.sub !== 'string' ||
      !payload.sub ||
      typeof payload.iat !== 'number' ||
      payload.iat > Date.now() / 1000 + 30
    )
      throw new Error('Invalid subject or issuance');
    if (
      !audience &&
      (typeof payload.azp !== 'string' ||
        !parties.includes(payload.azp) ||
        typeof payload.sid !== 'string' ||
        (payload.aud !== undefined && payload.aud !== null))
    )
      throw new Error('Invalid session authorized party');
    // Contributor comes from signed claims, never from caller-controlled JSON.
    const client =
      typeof payload.azp === 'string'
        ? payload.azp
        : typeof payload.client_id === 'string'
          ? payload.client_id
          : 'authenticated';
    c.set('principal', { userId: payload.sub, contributor: client });
  } catch {
    throw new ApiError(401, 'invalid_token', 'A valid, unexpired token for this API is required');
  }
  const owner = c.get('principal').userId;
  c.env = {
    ...c.env,
    OPERATION_EPOCH:
      c.env.OPERATION_EPOCH?.owner === owner
        ? c.env.OPERATION_EPOCH
        : { owner, generation: await ownerGeneration(c.env, owner) },
  };
  await next();
};
