import { fetchMock } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { authenticate, config, type McpConfig } from './auth';
import { CLERK_ISSUER, AuthenticationUnavailable } from './clerk';
vi.mock('googleapis', () => ({ google: {} }));

const cfg: McpConfig = {
  MCP_RESOURCE: 'https://mcp.myzine.app/mcp',
  MCP_OAUTH_ISSUER: CLERK_ISSUER,
  MCP_OAUTH_JWKS_URL: `${CLERK_ISSUER}/.well-known/jwks.json`,
  MCP_AUTH_MODE: 'clerk-opaque',
  MCP_CLERK_SECRET_KEY: 'fixture-only-not-a-real-secret',
  MCP_CLERK_CLIENT_IDS: '["client_fixture"]',
};
const bearer = 'Bearer oat_fixtureonlyabcdefghijklmnop';
const valid = () => ({
  object: 'clerk_idp_oauth_access_token',
  subject: 'user_alice',
  client_id: 'client_fixture',
  scopes: ['bookmarks:read'],
  aud: [cfg.MCP_RESOURCE],
  revoked: false,
  expired: false,
  expiration: Math.floor(Date.now() / 1000) + 86400,
  id: 'oat_fixture',
  created_at: Math.floor(Date.now() / 1000),
});
function reply(data: unknown, status = 200) {
  fetchMock.activate();
  fetchMock.disableNetConnect();
  fetchMock
    .get('https://api.clerk.com')
    .intercept({
      method: 'POST',
      path: '/v1/oauth_applications/access_tokens/verify',
      body: JSON.stringify({ access_token: bearer.slice(7) }),
      headers: {
        authorization: `Bearer ${cfg.MCP_CLERK_SECRET_KEY}`,
        'content-type': 'application/json',
      },
    })
    .reply(status, JSON.stringify(data));
}
afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.deactivate();
});

describe('Clerk opaque OAuth adapter', () => {
  it('verifies the existing instance, approved client and resource audience without mapping by email', async () => {
    expect(config(cfg)).toEqual(cfg);
    reply(valid());
    expect(await authenticate(bearer, cfg)).toEqual({
      userId: 'user_alice',
      scopes: ['bookmarks:read'],
    });
  });
  it.each([
    { aud: undefined },
    { aud: ['https://other.example/mcp'] },
    { aud: [cfg.MCP_RESOURCE, 'https://other.example'] },
    { revoked: true },
    { expired: true },
    { expiration: 1 },
    { expiration: null },
    { client_id: 'client_someotherapp' },
    { subject: 'mch_service' },
    { scopes: 'bookmarks:write' },
    { object: 'session' },
    { active: false },
    { act: { sub: 'client_delegate' } },
  ])('fails closed for invalid token response %j', async (change) => {
    reply({ ...valid(), ...change });
    await expect(authenticate(bearer, cfg)).rejects.toThrow('UNAUTHORIZED');
  });
  it.each([429, 500, 503])(
    'reports upstream %s as unavailable without asking for fresh consent',
    async (status) => {
      reply({}, status);
      await expect(authenticate(bearer, cfg)).rejects.toBeInstanceOf(AuthenticationUnavailable);
    }
  );
  it('rejects invalid access tokens and never sends a session token or PAT to Clerk', async () => {
    reply({}, 401);
    await expect(authenticate(bearer, cfg)).rejects.toThrow('UNAUTHORIZED');
    await expect(authenticate('Bearer zine_pat_fixture', cfg)).rejects.toThrow('UNAUTHORIZED');
    await expect(authenticate('Bearer session.fixture.jwt', cfg)).rejects.toThrow('UNAUTHORIZED');
  });
  it('requires explicit pinned configuration, backend secret and client admission', () => {
    expect(() => config({ ...cfg, MCP_CLERK_SECRET_KEY: undefined })).toThrow('MCP_NOT_CONFIGURED');
    expect(() => config({ ...cfg, MCP_OAUTH_ISSUER: 'https://other.clerk.accounts.dev' })).toThrow(
      'MCP_NOT_CONFIGURED'
    );
    expect(() => config({ ...cfg, MCP_CLERK_CLIENT_IDS: '[]' })).toThrow('MCP_NOT_CONFIGURED');
    expect(() =>
      config({ ...cfg, MCP_AUTH_MODE: 'clerk-jwt', MCP_CLERK_SECRET_KEY: undefined })
    ).not.toThrow();
  });
  it('never follows a verification redirect or accepts an oversized response', async () => {
    reply({}, 302);
    await expect(authenticate(bearer, cfg)).rejects.toThrow('UNAUTHORIZED');
    reply({ data: 'x'.repeat(33000) });
    await expect(authenticate(bearer, cfg)).rejects.toBeInstanceOf(AuthenticationUnavailable);
  });
});

describe('Clerk JWT compatibility without a backend secret', () => {
  const jwtConfig = {
    ...cfg,
    MCP_AUTH_MODE: 'clerk-jwt' as const,
    MCP_CLERK_SECRET_KEY: undefined,
  };
  async function signed(change: Record<string, unknown> = {}, type = 'at+jwt') {
    const pair = await generateKeyPair('RS256', { extractable: true });
    const jwt = await new SignJWT({
      sub: 'user_alice',
      client_id: 'client_fixture',
      scp: ['bookmarks:read'],
      ...change,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'fixture', typ: type })
      .setIssuer(cfg.MCP_OAUTH_ISSUER)
      .setAudience((change.aud as string) ?? cfg.MCP_RESOURCE)
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(pair.privateKey);
    const keySet = createLocalJWKSet({
      keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'fixture' }],
    });
    return { jwt, keySet };
  }
  it('accepts Clerk one-day access tokens with scp arrays and both RFC9068 type spellings', async () => {
    for (const type of ['at+jwt', 'application/at+jwt']) {
      const { jwt, keySet } = await signed({}, type);
      expect(await authenticate(`Bearer ${jwt}`, jwtConfig, keySet)).toEqual({
        userId: 'user_alice',
        scopes: ['bookmarks:read'],
      });
    }
  });
  it.each([
    { client_id: 'client_other' },
    { aud: 'https://other.example/mcp' },
    { scp: 'bookmarks:write' },
    { scope: 'bookmarks:write', scp: ['bookmarks:read'] },
    { act: { sub: 'client_delegate' } },
  ])('rejects incompatible claims %j', async (change) => {
    const { jwt, keySet } = await signed(change);
    await expect(authenticate(`Bearer ${jwt}`, jwtConfig, keySet)).rejects.toThrow();
  });
  it('rejects session/ID tokens even when signed by the same Clerk key', async () => {
    const { jwt, keySet } = await signed({}, 'JWT');
    await expect(authenticate(`Bearer ${jwt}`, jwtConfig, keySet)).rejects.toThrow();
  });
});
