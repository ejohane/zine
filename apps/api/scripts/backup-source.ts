/**
 * Read-only access to the newest nightly production backup, for building local and preview
 * copies. This is the only path from production data to non-production environments.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { cloudflare, cloudflareR2Object } from './cloudflare-control';
import { quietCommand } from './quiet-command';

const BACKUPS = 'zine-api-next-backups';
export const sha256 = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

export type SnapshotManifest = {
  environment: string;
  startedAt: string;
  counts: Record<string, number>;
  artifacts: { key: string; file: string; sha256: string }[];
};

export async function latestBackup() {
  const objects = await cloudflare<{ key: string }[]>(
    `r2/buckets/${BACKUPS}/objects?prefix=backups/production/&per_page=1000`
  );
  const latest = objects
    .filter((object) => /^backups\/production\/[^/]+\/[a-f0-9]{64}\.tar\.gz$/.test(object.key))
    .sort((a, b) => a.key.localeCompare(b.key))
    .at(-1);
  assert.ok(latest, 'No production backup found; run the API private backup workflow first');
  return latest.key;
}

/** Downloads (or reuses) the archive into `directory`, verifying its content address. */
export async function downloadBackup(key: string, directory: string) {
  const name = key.split('/').at(-1)!;
  const archive = `${directory}/${name}`;
  if (
    await stat(archive).then(
      () => true,
      () => false
    )
  )
    return archive;
  const response = await cloudflareR2Object(BACKUPS, key);
  assert.equal(response.status, 200, `Backup download failed (HTTP ${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Archives are content-addressed: the file name is the archive's SHA-256.
  assert.equal(`${sha256(bytes)}.tar.gz`, name, 'Backup archive is corrupt');
  await writeFile(archive, bytes, { mode: 0o600 });
  // Keep only the newest archive.
  for (const other of await readdir(directory))
    if (other.endsWith('.tar.gz') && other !== name) await rm(`${directory}/${other}`);
  return archive;
}

/** Extracts an archive and returns its manifest, checking it is a production backup. */
export async function extractBackup(archive: string, directory: string) {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await quietCommand('tar', ['-xzf', archive, '-C', directory]);
  const manifest = JSON.parse(
    await readFile(`${directory}/manifest.json`, 'utf8')
  ) as SnapshotManifest;
  assert.equal(manifest.environment, 'production');
  return manifest;
}
