/**
 * Branch previews: one API Worker + one web Worker per branch on https://next-<slug>.myzine.app,
 * each with its own D1 database, R2 bucket and queue holding a slim, cleaned copy of production.
 *
 *   bun run preview deploy <branch>    create or update (data is loaded only on first create)
 *   bun run preview destroy <branch>   delete every resource of that preview
 *   bun run preview list               current previews
 *   bun run preview sweep              destroy previews older than 7 days
 *   bun run preview token <branch>     agent API token (needs ZINE_PREVIEW_SECRET)
 *
 * Production is only read, through the nightly backup. Previews have no AI, vector index, cron or
 * provider secrets. At most MAX_PREVIEWS exist at once; deploying another replaces the oldest.
 * Build apps/next-web first (`bun run --cwd apps/next-web build`).
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { downloadBackup, extractBackup, latestBackup, sha256 } from './backup-source';
import { accountId, cloudflare, cloudflareR2Object, environments } from './cloudflare-control';
import { quietCommand } from './quiet-command';

const MAX_PREVIEWS = 3;
const MAX_AGE_DAYS = 7;
const PREFIX = 'zine-api-next-pv-';
const WRANGLER = 'wrangler@4.158.0';
const ROOT = '.local-data/preview';
const SCOPES = [
  'events:read',
  'library:read',
  'library:write',
  'subscriptions:read',
  'subscriptions:write',
];

export function slugFor(branch: string) {
  const slug = branch
    .toLowerCase()
    .replace(/^refs\/heads\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
    .replace(/-+$/, '');
  assert.match(slug, /^[a-z0-9][a-z0-9-]{0,19}$/, 'Branch name gives no usable preview name');
  return slug;
}

function names(slug: string) {
  const host = `next-${slug}.myzine.app`;
  const result = {
    slug,
    host,
    origin: `https://${host}`,
    api: `${PREFIX}${slug}`,
    web: `zine-next-web-pv-${slug}`,
    database: `${PREFIX}${slug}`,
    bucket: `${PREFIX}${slug}`,
    queue: `${PREFIX}${slug}-jobs`,
    dir: `${ROOT}/${slug}`,
  };
  // Previews must never share a name with production or staging resources.
  for (const environment of Object.values(environments))
    for (const value of [result.api, result.database, result.bucket, result.host])
      assert.ok(
        ![environment.worker, environment.bucket, new URL(environment.origin).host].includes(value),
        'Preview name collides with a real environment'
      );
  return result;
}
type Names = ReturnType<typeof names>;

export function agentToken(slug: string, secret = process.env.ZINE_PREVIEW_SECRET) {
  if (!secret) return undefined;
  return 'zine2_' + createHmac('sha256', secret).update(`preview:${slug}`).digest('hex');
}

type Database = { uuid: string; name: string; created_at: string };
async function previews() {
  const databases = await cloudflare<Database[]>(`d1/database?name=${PREFIX}&per_page=100`);
  return databases
    .filter((database) => database.name.startsWith(PREFIX))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

const wrangler = (...args: string[]) => quietCommand('bunx', [WRANGLER, ...args]);

async function ensureDatabase(n: Names) {
  const existing = (await previews()).find((database) => database.name === n.database);
  if (existing) return { id: existing.uuid, created: false };
  const created = await cloudflare<{ uuid: string }>('d1/database', 'POST', { name: n.database });
  return { id: created.uuid, created: true };
}
async function ensureBucket(n: Names) {
  const buckets = await cloudflare<{ buckets: { name: string }[] }>(
    `r2/buckets?name_contains=${n.bucket}`
  );
  if (!buckets.buckets.some((bucket) => bucket.name === n.bucket))
    await cloudflare('r2/buckets', 'POST', { name: n.bucket });
}
async function queueId(n: Names) {
  const queues =
    await cloudflare<{ queue_id: string; queue_name: string }[]>('queues?per_page=100');
  return queues.find((queue) => queue.queue_name === n.queue)?.queue_id;
}
async function ensureQueue(n: Names) {
  if (!(await queueId(n))) await cloudflare('queues', 'POST', { queue_name: n.queue });
}

const objectUrl = (bucket: string, key: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

async function putObject(bucket: string, key: string, body: Uint8Array) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(objectUrl(bucket, key), {
      method: 'PUT',
      headers: { authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN },
      body: new Uint8Array(body) as unknown as BodyInit,
      signal: AbortSignal.timeout(60000),
    });
    if (response.ok) return;
    assert.ok(
      attempt < 8 && [429, 500, 502, 503].includes(response.status),
      `Object upload failed (HTTP ${response.status})`
    );
    // The control API rate-limits bursts; honour Retry-After, otherwise back off.
    const wait = Number(response.headers.get('retry-after')) || 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 60) * 1000));
  }
}

async function bucketKeys(bucket: string) {
  const keys = new Set<string>();
  let cursor = '';
  for (;;) {
    const page = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      { headers: { authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN } }
    ).then(
      (r) =>
        r.json() as Promise<{
          result: { key: string }[];
          result_info?: { cursor?: string; is_truncated?: boolean };
        }>
    );
    for (const object of page.result ?? []) keys.add(object.key);
    if (!page.result_info?.is_truncated || !page.result_info.cursor) return keys;
    cursor = page.result_info.cursor;
  }
}

async function writeConfigs(n: Names, databaseId: string) {
  await mkdir(n.dir, { recursive: true, mode: 0o700 });
  // Paths are relative to the generated config in apps/api/.local-data/preview/<slug>/.
  const api = {
    name: n.api,
    main: '../../../src/index.ts',
    account_id: accountId,
    compatibility_date: '2026-07-30',
    compatibility_flags: ['nodejs_compat'],
    workers_dev: false,
    preview_urls: false,
    version_metadata: { binding: 'DEPLOYMENT' },
    routes: [{ pattern: n.host, custom_domain: true }],
    observability: { enabled: true },
    vars: {
      ENVIRONMENT: 'preview',
      AUTH_ISSUER: 'https://clerk.myzine.app',
      CLERK_PUBLISHABLE_KEY: 'pk_live_Y2xlcmsubXl6aW5lLmFwcCQ',
      AUTH_AUDIENCE: '',
      AUTH_AUTHORIZED_PARTIES: n.origin,
      ALLOWED_ORIGINS: n.origin,
      EMBEDDING_MODEL: 'unconfigured',
    },
    d1_databases: [
      {
        binding: 'DB',
        database_name: n.database,
        database_id: databaseId,
        migrations_dir: '../../../migrations',
      },
    ],
    r2_buckets: [{ binding: 'ARTIFACTS', bucket_name: n.bucket }],
    queues: {
      producers: [{ binding: 'JOBS', queue: n.queue }],
      consumers: [{ queue: n.queue, max_batch_size: 5, max_batch_timeout: 1, max_retries: 2 }],
    },
  };
  const web = {
    name: n.web,
    main: '../../../../next-web/worker/index.ts',
    account_id: accountId,
    compatibility_date: '2026-07-30',
    workers_dev: false,
    preview_urls: false,
    routes: [{ pattern: `${n.host}/next*`, zone_name: 'myzine.app' }],
    assets: {
      directory: '../../../../next-web/dist',
      binding: 'ASSETS',
      run_worker_first: true,
      html_handling: 'none',
      not_found_handling: 'none',
    },
    observability: { enabled: true },
  };
  for (const environment of Object.values(environments))
    assert.ok(
      !JSON.stringify(api).includes(environment.databaseId),
      'Preview config names a real database'
    );
  await writeFile(`${n.dir}/wrangler.api.json`, JSON.stringify(api, null, 2));
  await writeFile(`${n.dir}/wrangler.web.json`, JSON.stringify(web, null, 2));
  return { api: `${n.dir}/wrangler.api.json`, web: `${n.dir}/wrangler.web.json` };
}

const LOADED = '.preview/loaded';
const BACKUP = '.preview/backup';

/** Rows load once into an empty database; stored files resume where a previous run stopped. */
async function loadData(n: Names, config: string) {
  const rows = JSON.parse(
    await wrangler(
      'd1',
      'execute',
      'DB',
      '--remote',
      '--json',
      '--config',
      config,
      '--command',
      'SELECT COUNT(*) AS n FROM personal_items'
    )
  )[0].results[0].n as number;
  const existing = await bucketKeys(n.bucket);
  if (rows > 0 && existing.has(LOADED)) return undefined;
  // A resumed load keeps using the backup its rows came from.
  const pinned = existing.has(BACKUP)
    ? await cloudflareR2Object(n.bucket, BACKUP).then((r) => r.text())
    : undefined;
  const key = rows > 0 && pinned ? pinned : await latestBackup();
  const manifest = await extractBackup(await downloadBackup(key, ROOT), `${ROOT}/snapshot`);
  if (rows === 0) {
    await putObject(n.bucket, BACKUP, new TextEncoder().encode(key));
    const sql = `${ROOT}/snapshot/preview.sql`;
    console.error(
      await quietCommand('python3', [
        'scripts/preview-sql.py',
        `${ROOT}/snapshot/database.sqlite`,
        sql,
      ])
    );
    await wrangler('d1', 'execute', 'DB', '--remote', '--yes', '--config', config, '--file', sql);
  }
  const missing = manifest.artifacts.filter((artifact) => !existing.has(artifact.key));
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < missing.length) {
        const artifact = missing[next++];
        const bytes = await readFile(`${ROOT}/snapshot/${artifact.file}`);
        assert.equal(sha256(bytes), artifact.sha256, 'Snapshot object is corrupt');
        await putObject(n.bucket, artifact.key, bytes);
      }
    })
  );
  await putObject(n.bucket, LOADED, new TextEncoder().encode(manifest.startedAt));
  await rm(`${ROOT}/snapshot`, { recursive: true, force: true });
  return {
    backupStartedAt: manifest.startedAt,
    objects: manifest.artifacts.length,
    uploaded: missing.length,
  };
}

async function seedToken(n: Names, config: string) {
  const token = agentToken(n.slug);
  if (!token) return false;
  const owner = JSON.parse(
    await wrangler(
      'd1',
      'execute',
      'DB',
      '--remote',
      '--json',
      '--config',
      config,
      '--command',
      'SELECT owner_id FROM personal_items GROUP BY owner_id ORDER BY COUNT(*) DESC LIMIT 1'
    )
  )[0].results[0]?.owner_id as string | undefined;
  if (!owner) return false;
  assert.match(owner, /^[A-Za-z0-9_]+$/);
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  await wrangler(
    'd1',
    'execute',
    'DB',
    '--remote',
    '--config',
    config,
    '--command',
    `DELETE FROM api_tokens WHERE id='tok_preview_agent'; INSERT INTO api_tokens(id,owner_id,name,token_hash,expires_at,created_at,scopes_json) VALUES('tok_preview_agent','${owner}','Preview agent','${sha256(token)}','${expires}','${now}','${JSON.stringify(SCOPES)}')`
  );
  return true;
}

async function waitForHealth(n: Names) {
  // A new custom domain needs a few minutes for DNS and its certificate.
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await fetch(`${n.origin}/health`, { signal: AbortSignal.timeout(10000) });
      if (response.ok) return true;
    } catch {
      // not reachable yet
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  return false;
}

async function deploy(branch: string) {
  const n = names(slugFor(branch));
  assert.ok(
    await stat('../next-web/dist/index.html').then(
      () => true,
      () => false
    ),
    'Build apps/next-web first'
  );
  const existing = await previews();
  if (!existing.some((database) => database.name === n.database))
    for (const old of existing.slice(0, Math.max(0, existing.length - (MAX_PREVIEWS - 1))))
      await destroy(old.name.slice(PREFIX.length));
  const database = await ensureDatabase(n);
  await ensureBucket(n);
  await ensureQueue(n);
  const configs = await writeConfigs(n, database.id);
  await wrangler('d1', 'migrations', 'apply', 'DB', '--remote', '--config', configs.api);
  const data = await loadData(n, configs.api);
  const agent = await seedToken(n, configs.api);
  await wrangler('deploy', '--config', configs.api);
  await wrangler('deploy', '--config', configs.web);
  const healthy = await waitForHealth(n);
  const result = {
    url: `${n.origin}/next/`,
    api: n.origin,
    freshData: !!data,
    ...data,
    agentToken: agent,
    healthy,
  };
  console.log(JSON.stringify(result));
  assert.ok(healthy, 'Preview deployed but /health did not answer in time');
  return result;
}

/** Retries rate limits, treats "already gone" as done, and fails loudly on anything else. */
async function removal<T>(label: string, action: () => Promise<T>): Promise<T | undefined> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      const message = String(error);
      if (/\((404)[;)]/.test(message)) return undefined;
      if (/\(429[;)]/.test(message) && attempt < 8) {
        await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
        continue;
      }
      throw new Error(`Preview teardown failed at ${label}: ${message}`);
    }
  }
}

async function destroy(slug: string) {
  const n = names(slug);
  // Order matters: a queue consumer Worker can't be deleted, and a queue with consumers can't be
  // deleted. So: web Worker, the queue's consumer, the API Worker (its producer), then the queue.
  await removal('web worker', () => cloudflare(`workers/scripts/${n.web}?force=true`, 'DELETE'));
  const queue = await queueId(n);
  if (queue) {
    const details = await cloudflare<{ consumers?: { consumer_id: string }[] }>(`queues/${queue}`);
    for (const consumer of details.consumers ?? [])
      await removal('queue consumer', () =>
        cloudflare(`queues/${queue}/consumers/${consumer.consumer_id}`, 'DELETE')
      );
  }
  await removal('api worker', () => cloudflare(`workers/scripts/${n.api}?force=true`, 'DELETE'));
  if (queue) await removal('queue', () => cloudflare(`queues/${queue}`, 'DELETE'));
  // Empty, then delete the bucket.
  for (;;) {
    const page =
      (await removal('bucket listing', () =>
        cloudflare<{ key: string }[]>(`r2/buckets/${n.bucket}/objects?per_page=1000`)
      )) ?? [];
    if (!page.length) break;
    let next = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (next < page.length) {
          const key = page[next++].key.split('/').map(encodeURIComponent).join('/');
          await removal('object', () =>
            cloudflare(`r2/buckets/${n.bucket}/objects/${key}`, 'DELETE')
          );
        }
      })
    );
  }
  await removal('bucket', () => cloudflare(`r2/buckets/${n.bucket}`, 'DELETE'));
  const database = (await previews()).find((d) => d.name === n.database);
  if (database)
    await removal('database', () => cloudflare(`d1/database/${database.uuid}`, 'DELETE'));
  await rm(n.dir, { recursive: true, force: true });
  console.log(JSON.stringify({ destroyed: n.slug }));
}

const [command, branch] = process.argv.slice(2);
if (import.meta.main) {
  if (command === 'deploy' && branch) await deploy(branch);
  else if (command === 'destroy' && branch) await destroy(slugFor(branch));
  else if (command === 'token' && branch) {
    const token = agentToken(slugFor(branch));
    assert.ok(token, 'Set ZINE_PREVIEW_SECRET to derive preview agent tokens');
    process.stdout.write(token + '\n');
  } else if (command === 'list')
    for (const database of await previews())
      console.log(
        `${database.name.slice(PREFIX.length)}\t${names(database.name.slice(PREFIX.length)).origin}/next/\tcreated ${database.created_at}`
      );
  else if (command === 'sweep') {
    const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
    for (const database of await previews())
      if (Date.parse(database.created_at) < cutoff)
        await destroy(database.name.slice(PREFIX.length));
  } else throw new Error('Use: bun run preview deploy|destroy|token <branch>, or list|sweep');
}
