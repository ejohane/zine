import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEED_MAX_BYTES, feedAt } from '../src/subscriptions';

function serve(body: string) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'cloudflare-dns.com')
      return Response.json({
        Status: 0,
        Answer: url.searchParams.get('type') === 'AAAA' ? [] : [{ type: 1, data: '93.184.216.34' }],
      });
    return new Response(body, { headers: { 'content-type': 'application/rss+xml' } });
  });
}
// A podcast feed of `bytes` size: many episodes with long show notes.
function podcast(bytes: number) {
  const notes = 'Show notes. '.repeat(400);
  const items: string[] = [];
  let size = 0;
  for (let index = 0; size < bytes; index++) {
    const item = `<item><guid>episode-${index}</guid><title>Episode ${index}</title><link>https://example.com/${index}</link><description>${notes}</description><enclosure url="https://example.com/${index}.mp3" type="audio/mpeg"/></item>`;
    items.push(item);
    size += item.length;
  }
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Long podcast</title>${items.join('')}</channel></rss>`;
}

describe('feed size limit', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reads a long podcast back catalogue larger than the general page limit', async () => {
    const body = podcast(5 * 1024 * 1024);
    expect(body.length).toBeGreaterThan(4 * 1024 * 1024);
    serve(body);
    const feed = await feedAt('https://example.com/feed.xml');
    expect(feed.entries.length).toBeGreaterThan(900);
  });
  it('still rejects a feed beyond the feed limit', async () => {
    serve(podcast(FEED_MAX_BYTES + 1024));
    await expect(feedAt('https://example.com/feed.xml')).rejects.toMatchObject({
      code: 'source_too_large',
    });
  });
});
