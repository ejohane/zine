import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

interface WorkerConfig {
  [key: string]: unknown;
  name: string;
  env: Record<string, WorkerConfig>;
  d1_databases: { binding: string; database_name: string; database_id: string }[];
  r2_buckets: { binding: string; bucket_name: string }[];
  observability: { enabled: boolean };
}
const read = (path: string) =>
  Bun.TOML.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as WorkerConfig;
const production = read('../integrations/mcp/wrangler.production.toml');
const api = read('../apps/worker/wrangler.toml').env.production;

describe('unapplied MCP production configuration', () => {
  it('uses a separate canonical domain with no alternate public Worker URL or logs', () => {
    expect(production.name).toBe('zine-mcp-production');
    expect(production.name).not.toBe(api.name);
    expect(production.routes).toEqual([{ pattern: 'mcp.myzine.app', custom_domain: true }]);
    expect(production.workers_dev).toBe(false);
    expect(production.preview_urls).toBe(false);
    expect(production.observability.enabled).toBe(false);
  });
  it('binds exactly the existing library database and article bucket', () => {
    expect(production.d1_databases).toEqual([
      {
        binding: 'DB',
        database_name: api.d1_databases.find((value) => value.binding === 'DB')?.database_name,
        database_id: api.d1_databases.find((value) => value.binding === 'DB')?.database_id,
      },
    ]);
    expect(production.r2_buckets).toEqual([
      api.r2_buckets.find((value) => value.binding === 'ARTICLE_CONTENT'),
    ]);
    for (const key of [
      'queues',
      'triggers',
      'kv_namespaces',
      'ai',
      'images',
      'vectorize',
      'services',
    ])
      expect(production[key]).toBeUndefined();
    expect(production.main).toBe('src/server.ts');
  });
  it('admits instance-verified clients and retains the rollback allowlist without credentials', () => {
    expect(production.vars).toEqual({
      ENVIRONMENT: 'production',
      MCP_AUTH_MODE: 'clerk-opaque',
      MCP_RESOURCE: 'https://mcp.myzine.app/mcp',
      MCP_OAUTH_ISSUER: 'https://clerk.myzine.app',
      MCP_OAUTH_JWKS_URL: 'https://clerk.myzine.app/.well-known/jwks.json',
      MCP_CLERK_CLIENT_IDS: '["5gNCO8oX8tGw0eA5"]',
      MCP_CLERK_CLIENT_POLICY: 'instance',
    });
  });
  it('declares an early verification limit instead of unbounded Clerk API traffic', () => {
    expect(production.ratelimits).toEqual([
      {
        name: 'MCP_VERIFICATION_LIMITER',
        namespace_id: '260101',
        simple: { limit: 60, period: 60 },
      },
    ]);
  });
});
