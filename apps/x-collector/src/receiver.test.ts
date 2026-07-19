import { afterEach, describe, expect, it } from 'vitest';
import { startReceiver, type ReceiverHandle } from './receiver';

let receiver: ReceiverHandle | null = null;
let apiServer: ReturnType<typeof Bun.serve> | null = null;

afterEach(() => {
  receiver?.stop();
  apiServer?.stop();
  receiver = null;
  apiServer = null;
});

describe('local browser receiver', () => {
  it('accumulates browser batches and performs a verified upload', async () => {
    apiServer = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname.endsWith('/runs') && request.method === 'POST') {
          return Response.json({ run: { id: 'receiver-run-001' } }, { status: 201 });
        }
        if (url.pathname.includes('/chunks/')) return Response.json({ accepted: true });
        if (url.pathname.endsWith('/complete')) {
          return Response.json({ run: { id: 'receiver-run-001', collectedCount: 2 } });
        }
        return Response.json({ run: { id: 'receiver-run-001', collectedCount: 2 } });
      },
    });
    receiver = startReceiver({
      requestedCount: 2,
      apiUrl: `http://${apiServer.hostname}:${apiServer.port}`,
      token: 'zine_pat_receiver-test',
      port: 0,
      runId: 'receiver-run-001',
      startedAt: '2026-07-11T13:00:00.000Z',
    });

    const batch = await fetch(`${receiver.url}/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        posts: [
          {
            tweetId: '100',
            url: 'https://x.com/example/status/100',
            text: 'Hello',
            kind: 'POST',
            author: { username: 'example', name: 'Example' },
            media: [],
            links: [
              {
                url: 'https://example.com/story?utm_source=x',
                normalizedUrl: 'https://example.com/story',
                displayUrl: 'example.com/story',
                redirectUrl: 'https://t.co/story',
                source: 'TEXT',
              },
            ],
            relationships: [],
            metrics: {},
            capturedAt: '2026-07-11T13:00:00.000Z',
          },
        ],
        items: [
          {
            tweetId: '100',
            position: 0,
            observedAt: '2026-07-11T13:00:00.000Z',
            presentation: 'POST',
          },
        ],
        adKeys: ['ad-100'],
        excludedAds: 1,
      }),
    });
    expect(await batch.json()).toMatchObject({
      timelineItems: 1,
      canonicalPosts: 1,
      excludedAds: 1,
    });

    const invalidLink = await fetch(`${receiver.url}/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        posts: [
          {
            tweetId: 'invalid-link',
            url: 'https://x.com/example/status/invalid-link',
            text: 'Invalid link',
            kind: 'POST',
            author: { username: 'example', name: 'Example' },
            links: [{ url: 'https://example.com', normalizedUrl: 'not-a-url' }],
            capturedAt: '2026-07-11T13:00:00.000Z',
          },
        ],
        items: [],
      }),
    });
    expect(invalidLink.status).toBe(400);

    const duplicateAd = await fetch(`${receiver.url}/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ posts: [], items: [], adKeys: ['ad-100'], excludedAds: 1 }),
    });
    expect(await duplicateAd.json()).toMatchObject({ timelineItems: 1, excludedAds: 1 });

    const checkpoint = await fetch(`${receiver.url}/checkpoint`);
    expect(await checkpoint.json()).toMatchObject({
      runId: 'receiver-run-001',
      requestedCount: 2,
      acceptedTweetIds: ['100'],
      acceptedAdKeys: ['ad-100'],
      nextPosition: 1,
      excludedAds: 1,
    });

    const resumedBatch = await fetch(`${receiver.url}/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        posts: [
          {
            tweetId: '200',
            url: 'https://x.com/example/status/200',
            text: 'Resumed',
            kind: 'POST',
            author: { username: 'example', name: 'Example' },
            media: [],
            relationships: [],
            metrics: {},
            capturedAt: '2026-07-11T13:01:00.000Z',
          },
        ],
        items: [
          {
            tweetId: '200',
            position: 1,
            observedAt: '2026-07-11T13:01:00.000Z',
            presentation: 'POST',
          },
        ],
        adKeys: ['ad-200'],
        excludedAds: 1,
      }),
    });
    expect(await resumedBatch.json()).toMatchObject({ timelineItems: 2, excludedAds: 2 });

    const complete = await fetch(`${receiver.url}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETE' }),
    });
    expect(complete.status).toBe(200);
    await expect(receiver.completed).resolves.toMatchObject({
      runId: 'receiver-run-001',
      timelineItemsSubmitted: 2,
      verified: true,
    });
  });
});
