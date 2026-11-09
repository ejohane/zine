/**
 * Read-only, bounded production snapshot for isolated rewrite verification.
 * No legacy code imports, no tokens/OAuth rows, no writes to the existing service.
 * Output is ignored, permission-restricted local data, never publishable proof.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.ZINE_LEGACY_API_URL ?? 'https://api.myzine.app/api/v1';
const token = process.env.ZINE_ACCESS_TOKEN;
if (!token)
  throw new Error('ZINE_ACCESS_TOKEN is required through the existing protected environment');
if (new URL(base).origin !== 'https://api.myzine.app')
  throw new Error('Snapshot source must be the existing production API');
const output = resolve(import.meta.dirname, '../.local-data/library-snapshot.json');
const items: unknown[] = [];
const cursors = new Set<string>();
let cursor: string | null = null;
let pages = 0;
do {
  const url = new URL(`${base}/bookmarks`);
  url.searchParams.set('limit', '50');
  if (cursor) url.searchParams.set('cursor', cursor);
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok)
    throw new Error(`Read-only library snapshot failed with HTTP ${response.status}`);
  const page = (await response.json()) as { items: unknown[]; nextCursor: string | null };
  if (!Array.isArray(page.items)) throw new Error('Unexpected library response');
  items.push(...page.items);
  pages++;
  cursor = page.nextCursor;
  if (cursor && cursors.has(cursor)) throw new Error('Repeated cursor; snapshot is incomplete');
  if (cursor) cursors.add(cursor);
  if (pages >= 1000 && cursor) throw new Error('Safety page bound reached; snapshot is incomplete');
} while (cursor);
await mkdir(resolve(import.meta.dirname, '../.local-data'), { recursive: true, mode: 0o700 });
await writeFile(
  output,
  JSON.stringify(
    { capturedAt: new Date().toISOString(), source: base, items, pages, complete: true },
    null,
    2
  ),
  { mode: 0o600 }
);
// Shape and counts only. Never log raw library content or auth headers.
console.log(
  JSON.stringify({
    snapshotWritten: true,
    scope: 'all-accessible-bookmarks',
    pages,
    itemCount: items.length,
    complete: true,
  })
);
