import { afterEach, describe, expect, it } from 'vitest';
import { mergePost, startReceiver, type ReceiverHandle } from './receiver';

let receiver: ReceiverHandle | null = null;
let apiServer: ReturnType<typeof Bun.serve> | null = null;

afterEach(() => {
  receiver?.stop();
  apiServer?.stop();
  receiver = null;
  apiServer = null;
});

describe('local browser receiver', () => {
  it('does not let a later DOM observation erase exact thread structure', () => {
    const exact = {
      tweetId: '101',
      url: 'https://x.com/reply/status/101',
      text: 'Reply',
      kind: 'REPLY' as const,
      conversationId: '100',
      structure: {
        status: 'EXACT' as const,
        source: 'X_WEB_GRAPHQL_LIST' as const,
        observedAt: '2026-07-11T13:00:00.000Z',
      },
      author: { username: 'reply', name: 'Reply' },
      media: [],
      links: [],
      relationships: [
        {
          type: 'REPLY_TO' as const,
          tweetId: '100',
          evidenceSource: 'X_WEB_GRAPHQL_LIST' as const,
        },
      ],
      metrics: {},
      capturedAt: '2026-07-11T13:00:00.000Z',
    };
    const partial = {
      ...exact,
      conversationId: null,
      structure: {
        status: 'PARTIAL' as const,
        source: 'DOM_TIMELINE' as const,
        observedAt: '2026-07-11T14:00:00.000Z',
      },
      relationships: [],
      capturedAt: '2026-07-11T14:00:00.000Z',
    };

    expect(mergePost(exact, partial)).toMatchObject({
      conversationId: '100',
      structure: { status: 'EXACT', source: 'X_WEB_GRAPHQL_LIST' },
      relationships: [{ type: 'REPLY_TO', tweetId: '100' }],
    });
  });

  it('accumulates browser batches and performs a verified upload', async () => {
    let completionBody: Record<string, unknown> | null = null;
    let membershipBody: Record<string, unknown> | null = null;
    apiServer = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname.endsWith('/runs') && request.method === 'POST') {
          return Response.json({ run: { id: 'receiver-run-001' } }, { status: 201 });
        }
        if (url.pathname.includes('/chunks/')) return Response.json({ accepted: true });
        if (url.pathname.endsWith('/complete')) {
          completionBody = (await request.json()) as Record<string, unknown>;
          return Response.json({ run: { id: 'receiver-run-001', collectedCount: 2 } });
        }
        if (url.pathname.includes('/daily-sources/')) {
          membershipBody = (await request.json()) as Record<string, unknown>;
          return Response.json({ source: { snapshotId: 'snapshot-1' }, created: true });
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
      source: {
        type: 'FAVORITES',
        id: 'x-list:123',
        name: 'Favorites',
        url: 'https://x.com/i/lists/123',
      },
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

    const sourceMembers = await fetch(`${receiver.url}/source-members`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ usernames: ['example'], status: 'COMPLETE' }),
    });
    expect(await sourceMembers.json()).toMatchObject({
      sourceMemberCount: 1,
      sourceMembershipStatus: 'COMPLETE',
      sourceMembershipFailureReason: null,
    });

    const contextStatus = await fetch(`${receiver.url}/context-status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rootTweetId: '100',
        status: 'TRUNCATED',
        reason: 'context_budget_reached',
      }),
    });
    expect(await contextStatus.json()).toMatchObject({
      contextCoverage: {
        attempted: 1,
        truncated: 1,
        warnings: ['context_budget_reached'],
      },
    });

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
    expect(completionBody).toMatchObject({
      contextCoverage: {
        attempted: 1,
        completed: 0,
        truncated: 1,
        failed: 0,
        warnings: ['context_budget_reached'],
      },
    });
    expect(membershipBody).toMatchObject({
      runId: 'receiver-run-001',
      sourceType: 'FAVORITES',
      status: 'COMPLETE',
      failureReason: null,
      usernames: ['example'],
    });
  });

  it('requires persisted boundary evidence before completing a rolling-window run', async () => {
    let completionBody: Record<string, unknown> | null = null;
    apiServer = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname.endsWith('/runs') && request.method === 'POST') {
          return Response.json({ run: { id: 'receiver-window-001' } }, { status: 201 });
        }
        if (url.pathname.endsWith('/complete')) {
          completionBody = (await request.json()) as Record<string, unknown>;
          return Response.json({ run: { id: 'receiver-window-001', collectedCount: 0 } });
        }
        if (url.pathname.includes('/daily-sources/')) {
          return Response.json({ source: { snapshotId: 'snapshot-window' }, created: true });
        }
        return Response.json({ run: { id: 'receiver-window-001', collectedCount: 0 } });
      },
    });
    receiver = startReceiver({
      requestedCount: 5_000,
      apiUrl: `http://${apiServer.hostname}:${apiServer.port}`,
      token: 'zine_pat_receiver-test',
      port: 0,
      runId: 'receiver-window-001',
      startedAt: '2026-07-25T18:00:00.000Z',
      source: {
        type: 'FAVORITES',
        id: 'x-list:123',
        name: 'Favorites',
        url: 'https://x.com/i/lists/123',
      },
      collectionPolicy: {
        mode: 'ROLLING_WINDOW',
        windowHours: 24,
        cutoffAt: '2026-07-24T18:00:00.000Z',
        boundaryEvidenceRequired: 3,
      },
    });

    const missingReason = await fetch(`${receiver.url}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETE' }),
    });
    expect(missingReason.status).toBe(400);

    await fetch(`${receiver.url}/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        posts: [],
        items: [],
        windowEvidence: {
          outsideWindowTweetIds: ['old-1', 'old-2', 'old-3'],
          missingTimestampTweetIds: [],
        },
      }),
    });
    const checkpoint = await fetch(`${receiver.url}/checkpoint`).then((response) =>
      response.json()
    );
    expect(checkpoint).toMatchObject({
      collectionPolicy: { mode: 'ROLLING_WINDOW', windowHours: 24 },
      outsideWindowTweetIds: ['old-1', 'old-2', 'old-3'],
    });

    const complete = await fetch(`${receiver.url}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status: 'COMPLETE',
        terminationReason: 'WINDOW_BOUNDARY_REACHED',
      }),
    });
    expect(complete.status).toBe(200);
    await expect(receiver.completed).resolves.toMatchObject({ verified: true });
    expect(completionBody).toMatchObject({
      terminationReason: 'WINDOW_BOUNDARY_REACHED',
      windowCoverage: {
        outsideWindow: 3,
        missingPublishedAt: 0,
        boundaryEvidenceRequired: 3,
        boundaryReached: true,
      },
    });
  });
});
