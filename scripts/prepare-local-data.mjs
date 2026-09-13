#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Database } from 'bun:sqlite';
import { resolveLocalUserId } from './sync-prod-user-to-local.mjs';

export function inspectLocalData(stateDirectory, userId) {
  if (!existsSync(stateDirectory)) return 'provision';
  const manifestPath = resolve(stateDirectory, 'zine-sanitized-snapshot.json');
  if (!existsSync(manifestPath)) return 'refresh-required';
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.userId !== userId || !manifest.includeArticleBodies) return 'refresh-required';
  const dbPath = resolve(
    stateDirectory,
    'v3/d1/miniflare-D1DatabaseObject/2a13f10f1e768310d0250437a6253d204a8c839f02e306404fa5e52ca7ded965.sqlite'
  );
  if (!existsSync(dbPath)) return 'refresh-required';
  // SQLite may need to create WAL sidecars even for reads after Wrangler exits.
  // Open the existing file without creating a DB, then prohibit SQL writes.
  const db = new Database(dbPath, { readwrite: true, create: false });
  try {
    db.exec('PRAGMA query_only = ON');
    return db.query('SELECT id FROM users WHERE id = ?').get(userId) ? 'reuse' : 'refresh-required';
  } finally {
    db.close();
  }
}

if (import.meta.main) {
  const repoRoot = resolve(import.meta.dir, '..');
  try {
    const state = inspectLocalData(
      resolve(repoRoot, 'apps/worker/.wrangler/state'),
      resolveLocalUserId()
    );
    if (state === 'refresh-required') {
      throw new Error(
        'Existing local state needs an authenticated sanitized snapshot. It has been preserved. Stop this worktree’s Worker, then run bun run data:prod:local -- --yes --include-article-bodies (backs up existing state), and restart.'
      );
    }
    if (state === 'provision') {
      console.log('Provisioning sanitized local D1 and article bodies for real Clerk login.');
      execFileSync(
        'bun',
        ['run', './scripts/sync-prod-user-to-local.mjs', '--yes', '--include-article-bodies'],
        { cwd: repoRoot, stdio: 'inherit' }
      );
    } else {
      console.log('Reusing authenticated local snapshot and local edits; no production refresh.');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
