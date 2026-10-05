import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The pinned workerd runner can exhaust macOS loopback connections when all
// files start together. Sequential shards retain per-file runtime and storage
// isolation while running the same complete test selection.
const args = process.argv.slice(2);
const hasShard = args.some((arg) => arg === '--shard' || arg.startsWith('--shard='));
const shardCount = process.platform === 'darwin' && !hasShard ? 10 : 1;
const root = fileURLToPath(new URL('../', import.meta.url));

for (let shard = 1; shard <= shardCount; shard += 1) {
  const shardArgs = shardCount > 1 ? [`--shard=${shard}/${shardCount}`] : [];
  const result = spawnSync('bun', ['run', '--cwd', 'apps/worker', 'test:run', ...args, ...shardArgs], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
