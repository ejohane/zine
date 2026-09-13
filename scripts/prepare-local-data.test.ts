import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { inspectLocalData } from './prepare-local-data.mjs';
import { resolveLocalUserId } from './sync-prod-user-to-local.mjs';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function state() {
  const root = mkdtempSync(join(tmpdir(), 'zine-local-'));
  roots.push(root);
  return root;
}
test('absent state provisions; existing unrecognized state is preserved for explicit refresh', () => {
  const root = state();
  expect(inspectLocalData(join(root, 'absent'), 'user_test')).toBe('provision');
  expect(inspectLocalData(root, 'user_test')).toBe('refresh-required');
});
test('reuses compatible authenticated data, rejects wrong identity and missing reader bodies', () => {
  const root = state();
  const dir = join(root, 'v3/d1/miniflare-D1DatabaseObject');
  mkdirSync(dir, { recursive: true });
  const db = new Database(
    join(dir, '2a13f10f1e768310d0250437a6253d204a8c839f02e306404fa5e52ca7ded965.sqlite')
  );
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE users(id TEXT); INSERT INTO users VALUES ('user_test')"
  );
  db.close();
  const manifest = join(root, 'zine-sanitized-snapshot.json');
  writeFileSync(manifest, JSON.stringify({ userId: 'user_test', includeArticleBodies: true }));
  expect(inspectLocalData(root, 'user_test')).toBe('reuse');
  expect(inspectLocalData(root, 'user_other')).toBe('refresh-required');
  writeFileSync(manifest, JSON.stringify({ userId: 'user_test', includeArticleBodies: false }));
  expect(inspectLocalData(root, 'user_test')).toBe('refresh-required');
});
test('snapshot identity must be a Clerk subject, never a bypass identity or SQL fragment', () => {
  expect(resolveLocalUserId('user_alternate')).toBe('user_alternate');
  expect(() => resolveLocalUserId('dev-user-001')).toThrow();
  expect(() => resolveLocalUserId("user_a'; DELETE FROM users;")).toThrow();
});

test('installs into a fresh worktree and backs up existing local edits on refresh', async () => {
  const { replaceLocalState } = await import('./local-state.mjs');
  const root = state();
  const first = join(root, 'stage-one');
  mkdirSync(first);
  writeFileSync(join(first, 'local-edit'), 'preserve me');
  const active = join(root, 'missing-parent', 'state');
  const backups = join(root, 'backups');
  expect(replaceLocalState(first, active, backups)).toBeUndefined();
  const second = join(root, 'stage-two');
  mkdirSync(second);
  const backup = replaceLocalState(second, active, backups);
  const { readFileSync } = await import('node:fs');
  expect(readFileSync(join(backup!, 'local-edit'), 'utf8')).toBe('preserve me');
  expect(() => replaceLocalState(join(root, 'missing-stage'), active, backups)).toThrow();
});
