import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { authenticateClerkOpaque, clerkClients, CLERK_ISSUER } from './clerk';

export interface McpConfig {
  MCP_RESOURCE: string;
  MCP_OAUTH_ISSUER: string;
  MCP_OAUTH_JWKS_URL: string;
  MCP_AUTH_MODE?: 'jwt' | 'clerk-jwt' | 'clerk-opaque';
  MCP_CLERK_CLIENT_IDS?: string;
  MCP_CLERK_CLIENT_POLICY?: 'allowlist' | 'instance';
  MCP_CLERK_SECRET_KEY?: string;
}
export const scopes = ['bookmarks:read', 'bookmarks:write'] as const;
export type Principal = { userId: string; scopes: string[] };

export function config(env: Partial<McpConfig>): McpConfig {
  for (const key of ['MCP_RESOURCE', 'MCP_OAUTH_ISSUER', 'MCP_OAUTH_JWKS_URL'] as const) {
    const value = env[key];
    if (!value) throw new Error('MCP_NOT_CONFIGURED');
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw new Error('MCP_NOT_CONFIGURED');
  }
  if (new URL(env.MCP_RESOURCE!).pathname !== '/mcp') throw new Error('MCP_NOT_CONFIGURED');
  if (env.MCP_AUTH_MODE && !['jwt', 'clerk-jwt', 'clerk-opaque'].includes(env.MCP_AUTH_MODE))
    throw new Error('MCP_NOT_CONFIGURED');
  if (env.MCP_AUTH_MODE?.startsWith('clerk-')) {
    if (
      env.MCP_OAUTH_ISSUER !== CLERK_ISSUER ||
      env.MCP_OAUTH_JWKS_URL !== `${CLERK_ISSUER}/.well-known/jwks.json` ||
      (env.MCP_AUTH_MODE === 'clerk-opaque' && !env.MCP_CLERK_SECRET_KEY)
    )
      throw new Error('MCP_NOT_CONFIGURED');
    if (env.MCP_CLERK_CLIENT_POLICY === 'instance') {
      // Dynamic admission requires authoritative verification by this Clerk instance.
      if (env.MCP_AUTH_MODE !== 'clerk-opaque') throw new Error('MCP_NOT_CONFIGURED');
    } else {
      if (env.MCP_CLERK_CLIENT_POLICY && env.MCP_CLERK_CLIENT_POLICY !== 'allowlist')
        throw new Error('MCP_NOT_CONFIGURED');
      clerkClients(env as McpConfig);
    }
  }
  return env as McpConfig;
}

const keySets = new Map<string, JWTVerifyGetKey>();
export async function authenticate(
  authorization: string | null,
  cfg: McpConfig,
  keys?: JWTVerifyGetKey
): Promise<Principal> {
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match) throw new Error('UNAUTHORIZED');
  if (cfg.MCP_AUTH_MODE === 'clerk-opaque') return authenticateClerkOpaque(match[1], cfg);
  let keySet = keys ?? keySets.get(cfg.MCP_OAUTH_JWKS_URL);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(cfg.MCP_OAUTH_JWKS_URL));
    keySets.set(cfg.MCP_OAUTH_JWKS_URL, keySet);
  }
  const clerk = cfg.MCP_AUTH_MODE === 'clerk-jwt';
  const lifetime = clerk ? 86400 : 3600;
  const { payload } = await jwtVerify(match[1], keySet, {
    algorithms: ['RS256'],
    typ: 'at+jwt',
    issuer: cfg.MCP_OAUTH_ISSUER,
    audience: cfg.MCP_RESOURCE,
    requiredClaims: ['exp', 'iat', 'sub'],
    maxTokenAge: lifetime,
  });
  // The authorization server must issue the existing Clerk subject, never an email mapping.
  if (!payload.sub?.startsWith('user_')) throw new Error('UNAUTHORIZED');
  if (payload.exp! - payload.iat! > lifetime || payload.iat! > Date.now() / 1000)
    throw new Error('UNAUTHORIZED');
  let granted: string[];
  if (clerk) {
    if (
      typeof payload.client_id !== 'string' ||
      !clerkClients(cfg).includes(payload.client_id) ||
      payload.act !== undefined
    )
      throw new Error('UNAUTHORIZED');
    const scp = payload.scp;
    if (
      scp !== undefined &&
      (!Array.isArray(scp) ||
        scp.length > 100 ||
        scp.some((s) => typeof s !== 'string' || !s.length || s.length > 200))
    )
      throw new Error('UNAUTHORIZED');
    if (typeof payload.scope !== 'string' && scp === undefined) throw new Error('UNAUTHORIZED');
    granted = (scp as string[]) ?? (payload.scope as string).split(' ').filter(Boolean);
    if (
      scp !== undefined &&
      payload.scope !== undefined &&
      (typeof payload.scope !== 'string' ||
        [...new Set(payload.scope.split(' ').filter(Boolean))].sort().join(' ') !==
          [...new Set(granted)].sort().join(' '))
    )
      throw new Error('UNAUTHORIZED');
  } else {
    if (typeof payload.scope !== 'string') throw new Error('UNAUTHORIZED');
    granted = payload.scope.split(' ').filter(Boolean);
  }
  return { userId: payload.sub, scopes: granted };
}

export function challenge(cfg: McpConfig, scope = 'bookmarks:read', insufficient = false) {
  const metadata = new URL('/.well-known/oauth-protected-resource/mcp', cfg.MCP_RESOURCE).href;
  return `Bearer resource_metadata="${metadata}", scope="${scope}", error="${insufficient ? 'insufficient_scope' : 'invalid_token'}", error_description="Link Zine with the required permission"`;
}
