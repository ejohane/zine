import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertLocalDevStackStopped } from './sync-prod-user-to-local.mjs';

assertLocalDevStackStopped();
const repoRoot = resolve(import.meta.dir, '..');
const state = resolve(repoRoot, 'apps/worker/.wrangler/state');
if (existsSync(state)) {
  const backup = resolve(repoRoot, '.local-data/local-d1-backups', `reset-${Date.now()}`);
  mkdirSync(resolve(backup, '..'), { recursive: true });
  renameSync(state, backup);
  console.log(`Backed up local state to ${backup}`);
}
console.log('Run bun run dev:worktree to provision a fresh sanitized snapshot.');
