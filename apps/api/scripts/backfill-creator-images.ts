// Consume a private legacy export containing only {url, imageUrl} records.
import { readFile } from 'node:fs/promises';
import { z } from 'zod4';
import { ZineClient } from '../client';
import { creatorImageReference, identify } from '../src/identity';
import { realSession } from './clerk-session';

const [file, mode, batch, ...extra] = process.argv.slice(2);
const limit = Number(batch);
if (
  !file ||
  (mode && (mode !== '--apply' || !Number.isSafeInteger(limit) || limit < 1)) ||
  extra.length
)
  throw Error(
    'Usage: bun run scripts/backfill-creator-images.ts <private-image-export.json> [--apply <max-writes>]'
  );

const origin = 'https://api-next.myzine.app';
const rows = z
  .array(z.object({ url: z.string(), imageUrl: z.string() }))
  .parse(JSON.parse(await readFile(file, 'utf8')));
const images = new Map<string, Set<string>>();
for (const row of rows) {
  const image = creatorImageReference(row.imageUrl);
  if (!image) continue;
  let key: string;
  try {
    key = identify(row.url).key;
  } catch {
    continue;
  }
  const candidates = images.get(key) ?? new Set<string>();
  candidates.add(image);
  images.set(key, candidates);
}

if (mode === '--apply') {
  const response = await fetch(origin + '/openapi.json');
  const schema = (await response.json()) as {
    components?: {
      schemas?: { Item?: { properties?: { content?: { properties?: Record<string, unknown> } } } };
    };
  };
  if (
    !response.ok ||
    !schema.components?.schemas?.Item?.properties?.content?.properties?.creatorImageUrl
  )
    throw Error('The deployed API does not advertise creatorImageUrl. Deploy the contract first.');
}

const session = await realSession();
try {
  const api = new ZineClient({ baseUrl: origin, token: session.getToken });
  const counts: Record<
    string,
    { scanned: number; alreadyPresent: number; matched: number; ambiguous: number; written: number }
  > = {};
  const planned: { itemId: string; key: string; image: string; counts: (typeof counts)[string] }[] =
    [];
  for await (const item of api.items({}, 50)) {
    const group = (counts[item.content.platform] ??= {
      scanned: 0,
      alreadyPresent: 0,
      matched: 0,
      ambiguous: 0,
      written: 0,
    });
    group.scanned++;
    if (item.content.creatorImageUrl) {
      group.alreadyPresent++;
      continue;
    }
    const key = identify(item.content.url).key;
    const matches = images.get(key);
    if (!matches?.size) continue;
    if (matches.size > 1) {
      group.ambiguous++;
      continue;
    }
    group.matched++;
    planned.push({ itemId: item.id, key, image: [...matches][0], counts: group });
  }
  console.log(JSON.stringify({ phase: 'plan', mode: mode ? 'apply' : 'dry-run', counts }, null, 2));
  if (mode === '--apply') {
    // Run a single writer. Recheck eligibility before each write so reruns
    // continue after interruption and preserve existing creator artwork.
    let written = 0;
    for (const row of planned) {
      if (written >= limit) break;
      const current = await api.item(row.itemId);
      if (current.content.creatorImageUrl || identify(current.content.url).key !== row.key)
        continue;
      await api.request('POST', '/v1/items/' + encodeURIComponent(row.itemId) + '/enrichment', {
        field: 'creatorImageUrl',
        value: row.image,
        provenance: { method: 'legacy-creator-image-import', sourceUrl: current.content.url },
      });
      const verified = await api.item(row.itemId);
      if (verified.content.creatorImageUrl !== row.image)
        throw Error(
          'Creator artwork did not match after writing. Rerun the dry run before continuing.'
        );
      row.counts.written++;
      written++;
    }
    console.log(JSON.stringify({ phase: 'written', counts }, null, 2));
  }
} finally {
  await session.close();
}
