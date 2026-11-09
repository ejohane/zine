import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { format, resolveConfig } from 'prettier';
const logs = Object.fromEntries(
  await Promise.all(
    [
      'production-reviewed-tests',
      'checkpoint-typecheck',
      'checkpoint-lint',
      'checkpoint-build',
      'checkpoint-install',
    ].map(async (name) => [name, await readFile('.local-data/' + name + '.log', 'utf8')])
  )
);
const tests = /Tests\s+(\d+) passed/.exec(logs['production-reviewed-tests']),
  files = /Test Files\s+(\d+) passed/.exec(logs['production-reviewed-tests']);
assert.ok(tests && files);
assert.ok(!/Tests\s+[^\n]*failed/.test(logs['production-reviewed-tests']));
assert.match(logs['checkpoint-build'], /--dry-run/);
assert.ok(!/error TS\d/.test(logs['checkpoint-typecheck']));
assert.ok(!/\d+ problems?/.test(logs['checkpoint-lint']));
const sources: string[] = [];
async function walk(dir: string) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = dir + '/' + entry.name;
    if (entry.isDirectory()) await walk(path);
    else sources.push(path);
  }
}
for (const dir of ['src', 'client', 'migrations', 'test']) await walk(dir);
sources.sort();
const sourceHash = createHash('sha256');
for (const path of sources) {
  sourceHash.update(path + '\0');
  sourceHash.update(await readFile(path));
  sourceHash.update('\0');
}
const report = {
  at: new Date().toISOString(),
  scope:
    'Local isolated verification of the current API/runtime/client/migrations/tests; GitHub CI and deployment have separate receipts.',
  runtime: { testNode: '22.21.1', bun: '1.3.4' },
  testFiles: Number(files[1]),
  tests: Number(tests[1]),
  lint: true,
  typecheck: true,
  dryRunBuild: true,
  frozenInstall: true,
  sourceFiles: sources.length,
  sourceSha256: sourceHash.digest('hex'),
  logs: Object.fromEntries(
    Object.entries(logs).map(([name, text]) => [
      name,
      createHash('sha256').update(text).digest('hex'),
    ])
  ),
  limits:
    'Synthetic provider/issuer/AI fault cases are identified in tests and do not constitute live Clerk/provider proof. Live Cloudflare staging/recovery artifacts are separate.',
};
await writeFile(
  'evidence/production-checks.json',
  await format(JSON.stringify(report), {
    ...(await resolveConfig('evidence/production-checks.json')),
    parser: 'json',
  })
);
console.log(JSON.stringify(report));
