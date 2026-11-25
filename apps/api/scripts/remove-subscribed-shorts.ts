/** Removes YouTube Shorts that arrived through subscriptions before they were excluded.
 *
 * Dry run by default: prints what would be removed and changes nothing. Pass --apply to
 * delete through the public API, which keeps the deletion decision so a later poll does
 * not bring the item back.
 *
 *   secretsctl run zine.test -- bun run scripts/remove-subscribed-shorts.ts [--apply]
 *
 * Only items whose every occurrence came from a subscription and that carry no tags,
 * collections, notes or progress are removed. Anything else that is a Short is listed
 * as kept. A Short is identified by YouTube itself: `/shorts/<id>` answers 200 for a
 * Short and redirects to `/watch` for a regular video. */
import { realSession } from './clerk-session';

const apply = process.argv.includes('--apply');
const origin = process.env.ZINE_API_BASE_URL ?? 'https://api-next.myzine.app';
const base = new URL(origin);
if (
  base.protocol !== 'https:' &&
  !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))
)
  throw new Error('Use HTTPS or a loopback development API');

interface Item {
  id: string;
  status: string;
  savedAt: string | null;
  content: { url: string; title?: unknown };
  context: unknown[];
  tags: string[];
  collectionIds: string[];
  progress: { position: number | null; completedAt: string | null };
  occurrences: { subscriptionId: string | null }[];
}

async function isShort(videoId: string) {
  const response = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
    method: 'HEAD',
    redirect: 'manual',
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 200) return true;
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = new URL(response.headers.get('location') ?? '', 'https://www.youtube.com');
    // Only a redirect to the regular player is a verdict; a consent or sign-in wall is not.
    if (location.hostname === 'www.youtube.com' && location.pathname === '/watch') return false;
  }
  throw new Error(`YouTube gave no verdict for ${videoId} (HTTP ${response.status})`);
}

const session = !process.env.ZINE_API_TOKEN ? await realSession() : null;
try {
  const api = async (method: string, path: string) => {
    const token = process.env.ZINE_API_TOKEN ?? (await session!.getToken());
    const response = await fetch(new URL(path, origin), {
      method,
      headers: { authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`${method} ${path.split('?')[0]}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
  const remove: Item[] = [];
  const kept: Item[] = [];
  let checked = 0;
  for (const status of ['saved', 'received']) {
    let cursor: string | null = null;
    do {
      const query = new URLSearchParams({ platform: 'youtube', type: 'video', status });
      query.set('limit', '100');
      if (cursor) query.set('cursor', cursor);
      const page = (await api('GET', `/v1/items?${query}`)) as {
        items: Item[];
        nextCursor: string | null;
      };
      for (const item of page.items) {
        // Only subscription arrivals can be the unwanted ones; skip the probe for the rest.
        if (!item.occurrences.some((occurrence) => occurrence.subscriptionId)) continue;
        const videoId = new URL(item.content.url).searchParams.get('v');
        if (!videoId) continue;
        checked++;
        if (!(await isShort(videoId))) continue;
        const untouched =
          item.occurrences.every((occurrence) => occurrence.subscriptionId) &&
          !item.tags.length &&
          !item.collectionIds.length &&
          !item.context.length &&
          item.progress.position === null &&
          !item.progress.completedAt;
        (untouched ? remove : kept).push(item);
      }
      cursor = page.nextCursor;
    } while (cursor);
  }
  const line = (item: Item) =>
    `  ${item.id}  ${item.status}  ${item.content.url}  ${String(item.content.title ?? '')}`;
  console.log(`Checked ${checked} subscribed YouTube videos on ${base.host}.`);
  console.log(`Shorts ${apply ? 'being removed' : 'that would be removed'}: ${remove.length}`);
  for (const item of remove) console.log(line(item));
  console.log(`Shorts kept because you saved or organized them yourself: ${kept.length}`);
  for (const item of kept) console.log(line(item));
  if (apply) {
    for (const item of remove) await api('DELETE', `/v1/items/${item.id}`);
    console.log(`Removed ${remove.length}.`);
  } else console.log('Dry run: nothing changed. Run again with --apply to remove them.');
} finally {
  await session?.close();
}
