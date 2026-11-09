import { Miniflare } from 'miniflare';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { AddressInfo } from 'node:net';

/** Isolated real Worker runtime. Synthetic issuer is explicitly NOT Clerk proof. */
export async function runtimeHarness(
  options: {
    outbound?: (request: Request) => Response | Promise<Response>;
    consumeJobs?: boolean;
    bindings?: Record<string, string>;
  } = {}
) {
  const keys = await generateKeyPair('RS256', { extractable: true });
  const jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: 'verification',
    alg: 'RS256',
    use: 'sig',
  };
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const bundle = await build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    external: ['node:*'],
  });
  const mf = new Miniflare({
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-30',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB: 'isolated-library-verification' },
    r2Buckets: ['ARTIFACTS'],
    queueProducers: { JOBS: 'isolated-library-jobs' },
    queueConsumers: options.consumeJobs
      ? { 'isolated-library-jobs': { maxBatchSize: 1, maxBatchTimeout: 0 } }
      : undefined,
    outboundService: options.outbound
      ? (request: Request) =>
          new URL(request.url).origin === issuer
            ? Response.json({ keys: [jwk] })
            : options.outbound!(request)
      : undefined,
    bindings: {
      ENVIRONMENT: 'verification',
      AUTH_ISSUER: issuer,
      AUTH_JWKS_URL: `${issuer}/jwks`,
      AUTH_AUDIENCE: 'zine-api',
      ALLOWED_ORIGINS: 'http://localhost',
      EMBEDDING_MODEL: 'unconfigured',
      ...options.bindings,
    },
  });
  const db = await mf.getD1Database('DB');
  for (const file of (await readdir('migrations')).filter((file) => file.endsWith('.sql')).sort()) {
    const [tables, ...triggers] = (await readFile(`migrations/${file}`, 'utf8')).split(
      /(?=CREATE TRIGGER)/
    );
    await db.batch(
      [
        ...tables
          .replace(/^\s*--.*$/gm, '')
          .split(';')
          .map((sql) => sql.trim())
          .filter(Boolean),
        ...triggers,
      ].map((sql) => db.prepare(sql))
    );
  }
  async function token(sub: string) {
    return new SignJWT({ azp: 'library-verification' })
      .setProtectedHeader({ alg: 'RS256', kid: 'verification' })
      .setSubject(sub)
      .setIssuer(issuer)
      .setAudience('zine-api')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(keys.privateKey);
  }
  return {
    mf,
    db,
    token,
    async close() {
      await mf.dispose();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
