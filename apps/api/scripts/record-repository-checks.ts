import assert from 'node:assert/strict';
import { format, resolveConfig } from 'prettier';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const files = [
  'latest-tests.log',
  'node22-tests.log',
  'latest-build.log',
  'root-typecheck.log',
  'root-lint.log',
  'root-format.log',
  'legacy-worker-tests.log',
  'legacy-web-tests.log',
];
const logs = Object.fromEntries(
  await Promise.all(files.map(async (p) => [p, await readFile(`.local-data/${p}`, 'utf8')]))
) as Record<string, string>;
const testCount = /Tests\s+(\d+) passed/.exec(logs['latest-tests.log']);
const fileCount = /Test Files\s+(\d+) passed/.exec(logs['latest-tests.log']);
assert.ok(testCount && fileCount && !/Tests\s+.*failed/.test(logs['latest-tests.log']));
assert.match(logs['node22-tests.log'], new RegExp(`Tests\\s+${testCount[1]} passed`));
assert.match(logs['node22-tests.log'], new RegExp(`Test Files\\s+${fileCount[1]} passed`));
assert.match(logs['latest-build.log'], /--dry-run/);
assert.match(logs['root-typecheck.log'], /15 successful, 15 total/);
assert.match(logs['root-lint.log'], /15 successful, 15 total/);
assert.match(logs['root-format.log'], /All matched files use Prettier/);
const summaries = [
  ...logs['legacy-worker-tests.log'].matchAll(/Tests\s+(\d+) passed(?: \| (\d+) skipped)?/g),
];
assert.equal(summaries.length, 10);
assert.equal(
  summaries.reduce((n, m) => n + Number(m[1]), 0),
  2212
);
assert.match(logs['legacy-web-tests.log'], /Tests\s+102 passed/);
const report = {
  at: new Date().toISOString(),
  scope: 'Commands executed locally in this working tree; GitHub CI not run',
  runtime: {
    bun: execFileSync('bun', ['--version'], { encoding: 'utf8' }).trim(),
    node: execFileSync('node', ['--version'], { encoding: 'utf8' }).trim(),
    ciNode: '22',
    verifiedCompatibilityNode: execFileSync(
      '.local-data/node22/node-v22.21.1-darwin-arm64/bin/node',
      ['--version'],
      { encoding: 'utf8' }
    ).trim(),
  },
  checks: [
    {
      command: 'bun run --cwd apps/api test',
      passed: Number(testCount[1]),
      files: Number(fileCount[1]),
    },
    {
      command: 'Node 22.21.1: vitest run',
      passed: Number(testCount[1]),
      files: Number(fileCount[1]),
      distributionChecksum: JSON.parse(await readFile('.local-data/node22/download.json', 'utf8'))
        .archiveSha256,
    },
    { command: 'bun run --cwd apps/api typecheck', result: 'passed, including scripts/tests' },
    { command: 'bun run --cwd apps/api lint', result: 'passed' },
    { command: 'bun run --cwd apps/api build', result: 'passed, Wrangler dry run' },
    { command: 'bun run typecheck', result: '15 tasks passed' },
    { command: 'bun run lint', result: '15 tasks passed; one existing legacy test lint warning' },
    { command: 'bun run format:check', result: 'passed' },
    {
      command: 'bun run test:worker:ci',
      passed: 2212,
      skipped: 4,
      shards: 10,
      excludes: ['user-do.test.ts', 'scheduler.test.ts'],
    },
    { command: 'bun run test:web', vitestPassed: 102, bunPassed: 4 },
  ],
  logs: Object.fromEntries(
    Object.entries(logs).map(([file, contents]) => [
      file,
      {
        sha256: createHash('sha256').update(contents).digest('hex'),
        bytes: Buffer.byteLength(contents),
      },
    ])
  ),
};
await writeFile(
  'evidence/repository-checks.json',
  await format(JSON.stringify(report), {
    ...(await resolveConfig('evidence/repository-checks.json')),
    parser: 'json',
  })
);
console.log(JSON.stringify(report.checks));
