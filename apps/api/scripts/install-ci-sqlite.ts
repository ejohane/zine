import assert from 'node:assert/strict';
import { appendFile, chmod, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { quietCommand } from './quiet-command';
// Official pinned Linux tool archive and its published SHA3-256, not the runner's older apt SQLite.
assert.ok(
  process.platform === 'linux' && process.arch === 'x64',
  'This CI installer requires Linux x64'
);
assert.ok(process.env.GITHUB_PATH, 'Run in GitHub Actions; local operators need SQLite >=3.50');
const url = 'https://www.sqlite.org/2026/sqlite-tools-linux-x64-3540100.zip';
const expected = '555635de98534d87a67ee2e6e1b0d79f494b1b33b223477d3e7a8ea0c66e416f';
const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
assert.ok(response.ok, 'Official SQLite download failed');
const bytes = new Uint8Array(await response.arrayBuffer());
assert.equal(
  createHash('sha3-256').update(bytes).digest('hex'),
  expected,
  'SQLite archive integrity failed'
);
const directory = resolve('.local-data/sqlite-3.54.1');
await mkdir(directory, { recursive: true, mode: 0o700 });
const archive = directory + '/tools.zip';
await writeFile(archive, bytes, { mode: 0o600 });
await quietCommand('unzip', ['-o', archive, 'sqlite3', '-d', directory]);
await chmod(directory + '/sqlite3', 0o700);
const version = (await quietCommand(directory + '/sqlite3', ['--version'])).trim();
assert.ok(version.startsWith('3.54.1 '));
assert.equal(
  (await quietCommand(directory + '/sqlite3', [':memory:', "SELECT unistr('A')"])).trim(),
  'A'
);
await appendFile(process.env.GITHUB_PATH, directory + '\n');
console.log(
  JSON.stringify({
    sqliteVersion: '3.54.1',
    officialArchive: url,
    publishedChecksumVerified: true,
    unistrVerified: true,
  })
);
