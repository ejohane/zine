/**
 * Local development data: a cleaned copy of production for `bun run local:dev`.
 *
 *   bun run local:pull    download the newest nightly production backup (read-only) and load it
 *   bun run local:reset   put the pristine copy back, discarding local changes (about a second)
 *   bun run local:token   print the local API token
 *
 * Production is only ever read, through the private backup bucket. The copy is cleaned with the
 * same rules as an isolated restore (scripts/restore-sql.py): no API tokens, provider connections,
 * webhooks or queued work, and subscriptions paused. Everything lives under ignored .local-data/dev.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { chmod, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { cloudflare, cloudflareR2Object, environments } from './cloudflare-control';
import { quietCommand } from './quiet-command';

const CONFIG = 'wrangler.local.jsonc';
const ROOT = '.local-data/dev';
const STATE = `${ROOT}/state`;
const PRISTINE = `${ROOT}/pristine`;
const SNAPSHOT = `${ROOT}/snapshot`;
const TOKEN = `${ROOT}/token`;
const BACKUPS = 'zine-api-next-backups';
const WRANGLER = 'wrangler@4.158.0';
// Everything the local API may do with its own copy; nothing operational.
const SCOPES = [
  'events:read',
  'library:read',
  'library:write',
  'subscriptions:read',
  'subscriptions:write',
];

async function exists(path: string) {
  return stat(path).then(
    () => true,
    () => false
  );
}
const sha256 = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** The local config must never point at a real environment. */
async function assertLocalConfig() {
  const text = await readFile(CONFIG, 'utf8');
  for (const environment of Object.values(environments)) {
    assert.ok(!text.includes(environment.databaseId), 'Local config names a real database');
    assert.ok(!text.includes(`"${environment.bucket}"`), 'Local config names a real bucket');
  }
  assert.match(text, /"ENVIRONMENT": "local"/);
}

const wrangler = (...args: string[]) =>
  quietCommand('bunx', [WRANGLER, ...args, '--config', CONFIG, '--persist-to', STATE]);

async function latestBackup() {
  const objects = await cloudflare<{ key: string; size: number }[]>(
    `r2/buckets/${BACKUPS}/objects?prefix=backups/production/&per_page=1000`
  );
  const latest = objects
    .filter((object) => /^backups\/production\/[^/]+\/[a-f0-9]{64}\.tar\.gz$/.test(object.key))
    .sort((a, b) => a.key.localeCompare(b.key))
    .at(-1);
  assert.ok(latest, 'No production backup found; run the API private backup workflow first');
  return latest.key;
}

async function download(key: string) {
  const archive = `${ROOT}/${key.split('/').at(-1)}`;
  if (await exists(archive)) return archive;
  const response = await cloudflareR2Object(BACKUPS, key);
  assert.equal(response.status, 200, `Backup download failed (HTTP ${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Archives are content-addressed: the file name is the archive's SHA-256.
  assert.equal(`${sha256(bytes)}.tar.gz`, key.split('/').at(-1), 'Backup archive is corrupt');
  await writeFile(archive, bytes, { mode: 0o600 });
  return archive;
}

async function load(archive: string) {
  await assertLocalConfig();
  await rm(SNAPSHOT, { recursive: true, force: true });
  await mkdir(SNAPSHOT, { recursive: true, mode: 0o700 });
  await quietCommand('tar', ['-xzf', archive, '-C', SNAPSHOT]);
  const manifest = JSON.parse(await readFile(`${SNAPSHOT}/manifest.json`, 'utf8')) as {
    environment: string;
    startedAt: string;
    counts: Record<string, number>;
    artifacts: { key: string; file: string; sha256: string }[];
  };
  assert.equal(manifest.environment, 'production');

  // Fresh local database at the current branch's schema, then the cleaned rows on top.
  await rm(STATE, { recursive: true, force: true });
  await wrangler('d1', 'migrations', 'apply', 'DB', '--local');
  // Copy rows file-to-file: D1 statements can't carry the largest retained texts.
  const d1 = `${STATE}/v3/d1/miniflare-D1DatabaseObject`;
  const files = (await readdir(d1)).filter((name) => /^[a-f0-9]{64}\.sqlite$/.test(name));
  assert.equal(files.length, 1, 'Expected one local database file');
  console.error(
    await quietCommand('python3', [
      'scripts/local-restore.py',
      `${SNAPSHOT}/database.sqlite`,
      `${d1}/${files[0]}`,
    ])
  );

  // Same storage layout and binding ids as `wrangler dev --config wrangler.local.jsonc`.
  const local = new Miniflare({
    modules: true,
    script: 'export default { fetch: () => new Response(null, { status: 204 }) }',
    d1Databases: { DB: '00000000-0000-0000-0000-000000000000' },
    r2Buckets: { ARTIFACTS: 'zine-api-next-local-artifacts' },
    d1Persist: `${STATE}/v3/d1`,
    r2Persist: `${STATE}/v3/r2`,
  });
  try {
    const DB = await local.getD1Database('DB');
    const ARTIFACTS = await local.getR2Bucket('ARTIFACTS');
    for (const artifact of manifest.artifacts) {
      const bytes = await readFile(`${SNAPSHOT}/${artifact.file}`);
      assert.equal(sha256(bytes), artifact.sha256, 'Snapshot object is corrupt');
      await ARTIFACTS.put(artifact.key, bytes);
    }
    // Nothing that can sign in or act outside should survive the copy.
    for (const table of ['api_tokens', 'connections', 'webhooks', 'webhook_deliveries']) {
      const row = await DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
      assert.equal(row?.n, 0, `Unsafe local state: ${table}`);
    }
    const active = await DB.prepare(
      "SELECT COUNT(*) AS n FROM subscriptions WHERE status='active'"
    ).first<{ n: number }>();
    assert.equal(active?.n, 0, 'Unsafe local state: active subscriptions');
    const items = await DB.prepare('SELECT COUNT(*) AS n FROM personal_items').first<{
      n: number;
    }>();
    assert.equal(items?.n, manifest.counts.personal_items, 'Local copy is missing saves');

    // A local-only token for the account with the most saves.
    const owner = await DB.prepare(
      'SELECT owner_id FROM personal_items GROUP BY owner_id ORDER BY COUNT(*) DESC LIMIT 1'
    ).first<{ owner_id: string }>();
    assert.ok(owner, 'Snapshot has no saves');
    const token = `zine2_${randomBytes(32).toString('hex')}`;
    const now = new Date();
    await DB.prepare(
      'INSERT INTO api_tokens(id,owner_id,name,token_hash,expires_at,created_at,scopes_json) VALUES(?,?,?,?,?,?,?)'
    )
      .bind(
        'tok_local',
        owner.owner_id,
        'Local development',
        sha256(token),
        new Date(now.getTime() + 3650 * 86400000).toISOString(),
        now.toISOString(),
        JSON.stringify(SCOPES)
      )
      .run();
    await writeFile(TOKEN, token + '\n', { mode: 0o600 });
    await chmod(TOKEN, 0o600);
    console.log(
      JSON.stringify({
        loaded: true,
        backupStartedAt: manifest.startedAt,
        items: items?.n,
        artifacts: manifest.artifacts.length,
        tokenFile: `apps/api/${TOKEN}`,
      })
    );
  } finally {
    await local.dispose();
  }
  await rm(PRISTINE, { recursive: true, force: true });
  await cp(STATE, PRISTINE, { recursive: true });
}

async function reset() {
  assert.ok(await exists(PRISTINE), 'No local copy yet; run `bun run local:pull` first');
  await rm(STATE, { recursive: true, force: true });
  await cp(PRISTINE, STATE, { recursive: true });
  console.log(JSON.stringify({ reset: true }));
}

const command = process.argv[2];
await mkdir(ROOT, { recursive: true, mode: 0o700 });
if (command === 'pull') {
  const key = await latestBackup();
  await load(await download(key));
  // Keep only the archive just loaded.
  const current = key.split('/').at(-1)!;
  for (const name of await readdir(ROOT))
    if (name.endsWith('.tar.gz') && name !== current) await rm(`${ROOT}/${name}`);
} else if (command === 'reset') await reset();
else if (command === 'token') process.stdout.write(await readFile(TOKEN, 'utf8'));
else throw new Error('Use: bun run scripts/local-data.ts pull|reset|token');
