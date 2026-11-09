import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const token = process.env.CLOUDFLARE_API_TOKEN;
assert.ok(token, 'Cloudflare credential missing');
const account = '887513bb1f71a8ef2029e2f9bd3086b2';
async function cf(path: string) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.ok(r.ok, `Cloudflare inspection: ${r.status}`);
  const v = (await r.json()) as { success: boolean; result: unknown };
  assert.ok(v.success);
  return v.result;
}
const settings = (await cf('workers/scripts/zine-api-next/settings')) as {
  bindings: {
    type: string;
    name: string;
    id?: string;
    bucket_name?: string;
    queue_name?: string;
    index_name?: string;
  }[];
};
const resourceTypes = ['d1', 'r2_bucket', 'queue', 'vectorize'];
const bindings = settings.bindings
  .filter((b) => resourceTypes.includes(b.type))
  .map((b) => ({
    type: b.type,
    name: b.name,
    resource: b.id ?? b.bucket_name ?? b.queue_name ?? b.index_name,
  }));
assert.ok(
  bindings.some((b) => b.name === 'DB' && b.resource === '0e55836b-07de-426b-9977-b783b0ea6652')
);
assert.ok(
  bindings.every(
    (b) =>
      b.resource === '0e55836b-07de-426b-9977-b783b0ea6652' ||
      b.resource?.startsWith('zine-api-next')
  ),
  'An unrelated infrastructure binding was found'
);
const deployments = (await cf('workers/scripts/zine-api-next/deployments')) as {
  deployments: { id: string; versions: { version_id: string; percentage: number }[] }[];
};
const serving = deployments.deployments[0];
const r = await fetch('https://api-next.myzine.app/health');
assert.equal(r.status, 200);
const health = (await r.json()) as { status: string; deploymentId: string };
assert.equal(health.status, 'ok');
assert.ok(
  serving.versions.some((v) => v.percentage === 100 && v.version_id === health.deploymentId)
);
const schema = await fetch('https://api-next.myzine.app/openapi.json');
const doc = (await schema.json()) as { paths: Record<string, unknown> };
assert.ok(doc.paths['/health']);
assert.ok(doc.paths['/v1/items']);
const sourceFiles: string[] = [];
async function walk(dir: string) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) await walk(p);
    else sourceFiles.push(p);
  }
}
await walk('src');
await walk('migrations');
sourceFiles.push('package.json', 'wrangler.jsonc', '../../bun.lock');
const hash = createHash('sha256');
for (const p of sourceFiles.sort()) {
  hash.update(p);
  hash.update(await readFile(p));
}
await writeFile(
  'evidence/deployment.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      origin: 'https://api-next.myzine.app',
      health,
      activeDeploymentId: serving.id,
      bindings,
      migrationFiles: sourceFiles.filter((p) => p.startsWith('migrations/')).length,
      sourceFiles: sourceFiles.length,
      sourceSha256: hash.digest('hex'),
      openApiPaths: Object.keys(doc.paths).length,
    },
    null,
    2
  ) + '\n'
);
console.log(JSON.stringify({ health, bindings, openApiPaths: Object.keys(doc.paths).length }));
