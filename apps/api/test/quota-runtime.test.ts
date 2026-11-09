import { afterEach, describe, expect, it } from 'vitest';
import { runtimeHarness } from '../scripts/runtime-harness';
import { stmt } from '../src/lib';
let runtime: Awaited<ReturnType<typeof runtimeHarness>> | undefined;
afterEach(async () => runtime?.close());
async function client(owner: string) {
  const running = runtime!;
  const token = await running.token(owner);
  return async (path: string, method = 'GET', body?: unknown) => {
    const response = await running.mf.dispatchFetch(`http://localhost/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = JSON.parse(await response.text());
    expect(response.status, JSON.stringify(value)).toBeLessThan(400);
    return value;
  };
}
async function until<T>(get: () => Promise<T>, ready: (value: T) => boolean) {
  for (let i = 0; i < 70; i++) {
    const value = await get();
    if (ready(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Controlled quota outcome not observed');
}
async function holdWatch() {
  const future = new Date(Date.now() + 3600000).toISOString();
  await runtime!.db
    .prepare(
      "INSERT INTO provider_budgets(scope,not_before,consecutive_limits) VALUES('provider:youtube:watch',?,3)"
    )
    .bind(future)
    .run();
  return future;
}
describe('separate YouTube resource quotas with durable feed metadata', () => {
  it('runs the authorized Data API while preserving a public watch-page cooldown and making no public-page requests', async () => {
    let publicRequests = 0,
      apiRequests = 0;
    runtime = await runtimeHarness({
      consumeJobs: true,
      bindings: { YOUTUBE_API_KEY: 'synthetic-youtube-key' },
      outbound: (request) => {
        const url = new URL(request.url);
        if (url.hostname === 'www.googleapis.com') {
          apiRequests++;
          expect(url.searchParams.get('key')).toBe('synthetic-youtube-key');
          return Response.json({
            items: [
              {
                id: 'abcdef12345',
                snippet: {
                  title: 'Authorized metadata',
                  description: 'Source information obtained through the official API',
                  channelId: 'UCsource',
                  channelTitle: 'Source channel',
                  publishedAt: '2026-11-01T00:00:00Z',
                },
                contentDetails: { duration: 'PT10M' },
                statistics: {},
              },
            ],
          });
        }
        publicRequests++;
        throw new Error('Public YouTube quota must not be bypassed');
      },
    });
    const future = await holdWatch();
    const request = await client('quota-authorized');
    const saved = await request('/saves', 'POST', { url: 'https://youtu.be/abcdef12345' });
    const item = await until(
      () => request(`/items/${saved.item.id}`),
      (v) =>
        v.content.title === 'Authorized metadata' &&
        v.enrichment.components.some(
          (c: { component: string; status: string }) =>
            c.component === 'transcript' && c.status === 'unavailable'
        )
    );
    expect(item.content.durationSeconds).toBe(600);
    expect(
      item.enrichment.components.find((c: { component: string }) => c.component === 'transcript')
        .reasonCode
    ).toBe('youtube_public_access_deferred');
    expect(apiRequests).toBe(1);
    expect(publicRequests).toBe(0);
    const held = await runtime.db
      .prepare("SELECT not_before FROM provider_budgets WHERE scope='provider:youtube:watch'")
      .first<{ not_before: string }>();
    expect(held!.not_before).toBe(future);
  });
  it('initializes a published channel feed and retains its supplied video title before a deferred optional watch-page fetch', async () => {
    let feedRequests = 0,
      watchRequests = 0;
    runtime = await runtimeHarness({
      consumeJobs: true,
      outbound: (request) => {
        const url = new URL(request.url);
        if (url.hostname === 'cloudflare-dns.com')
          return Response.json({
            Status: 0,
            Answer:
              url.searchParams.get('type') === 'AAAA' ? [] : [{ type: 1, data: '93.184.216.34' }],
          });
        if (url.hostname === 'www.youtube.com' && url.pathname === '/feeds/videos.xml') {
          feedRequests++;
          return new Response(
            `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015"><title>Published channel feed</title><link rel="alternate" href="https://www.youtube.com/channel/UCquota"/><entry><id>yt:video:abcdef12345</id><yt:videoId>abcdef12345</yt:videoId><title>Feed supplied video title</title><link rel="alternate" href="https://www.youtube.com/watch?v=abcdef12345"/><published>${new Date(Date.now() - 60000).toISOString()}</published><author><name>Feed creator</name></author></entry></feed>`,
            { headers: { 'content-type': 'application/atom+xml' } }
          );
        }
        if (url.hostname === 'www.youtube.com' && url.pathname.startsWith('/channel/'))
          return new Response(
            '<html><head><meta property="og:title" content="Published channel feed"></head><body><script>var ytInitialData={"metadata":{"channelMetadataRenderer":{"title":"Published channel feed","externalId":"UCquota"}}};</script></body></html>',
            { headers: { 'content-type': 'text/html' } }
          );
        watchRequests++;
        throw new Error('Watch requests remain under their own cooldown');
      },
    });
    const future = await holdWatch();
    const request = await client('quota-feed');
    const source = await request('/sources/resolve', 'POST', {
      url: 'https://www.youtube.com/channel/UCquota',
    });
    const directFeed = await request('/sources/resolve', 'POST', {
      url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCquota',
    });
    expect(directFeed.id).toBe(source.id);
    expect(directFeed.routes[0].id).toBe(source.routes[0].id);
    const capturedFeed = await request('/saves', 'POST', {
      url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCquota',
    });
    const feedItem = await until(
      () => request(`/items/${capturedFeed.item.id}`),
      (value) => value.content.type === 'feed' && value.content.title === 'Published channel feed'
    );
    expect(feedItem.content.title).toBe('Published channel feed');
    const subscription = await request('/subscriptions', 'POST', {
      sourceId: source.id,
      routeId: source.routes[0].id,
      autoSave: false,
    });
    const page = await until(
      () => request(`/items?subscriptionId=${subscription.id}&status=received`),
      (v) => v.items.length === 1 && v.items[0].content.title === 'Feed supplied video title'
    );
    expect(page.items[0].content.type).toBe('video');
    expect(page.items[0].enrichment.fields.title.provenance.method).toBe('feed-ingestion');
    expect(feedRequests).toBeGreaterThanOrEqual(1);
    expect(watchRequests).toBe(0);
    const jobs = await request(`/items/${page.items[0].id}/jobs`);
    const fetchJob = jobs.jobs.find((j: { kind: string }) => j.kind === 'enrich');
    expect(fetchJob.status).toBe('pending');
    expect(fetchJob.attempts).toBe(0);
    expect(
      (await stmt(
        runtime.db as unknown as D1Database,
        "SELECT not_before FROM provider_budgets WHERE scope='provider:youtube:watch'"
      ).first<{ not_before: string }>())!.not_before
    ).toBe(future);
  });
});
