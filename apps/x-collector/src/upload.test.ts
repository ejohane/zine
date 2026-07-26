import { describe, expect, it, vi } from 'vitest';
import { buildUploadChunks, uploadCapture, uploadDailySourceSnapshot } from './upload';

function capture(count = 26) {
  const posts = Array.from({ length: count }, (_, index) => ({
    tweetId: String(1000 + index),
    url: `https://x.com/example/status/${1000 + index}`,
    text: `Post ${index}`,
    kind: 'POST' as const,
    author: { username: 'example', name: 'Example' },
    media: [],
    links:
      index === 0
        ? [
            {
              url: 'https://example.com/story?utm_source=x',
              normalizedUrl: 'https://example.com/story',
              source: 'TEXT' as const,
            },
          ]
        : [],
    relationships: [],
    metrics: {},
    capturedAt: '2026-07-11T13:00:00.000Z',
  }));
  return {
    runId: 'run-collector-001',
    requestedCount: count,
    startedAt: '2026-07-11T13:00:00.000Z',
    completedAt: '2026-07-11T13:05:00.000Z',
    collectorVersion: 'test-v1',
    source: { type: 'FOLLOWING' as const, id: 'following', name: 'Following' },
    collectionPolicy: { mode: 'COUNT' as const },
    terminationReason: 'COUNT_REACHED' as const,
    excludedAds: 0,
    status: 'COMPLETE' as const,
    contextCoverage: {
      budget: 0,
      attempted: 0,
      completed: 0,
      truncated: 0,
      failed: 0,
      warnings: [],
    },
    windowCoverage: {
      outsideWindow: 0,
      missingPublishedAt: 0,
      boundaryEvidenceRequired: 0,
      boundaryReached: false,
    },
    structureCoverage: {
      primaryPosts: count,
      structuredPosts: count,
      replyPosts: 0,
      replyParentsKnown: 0,
      conversationIdsKnown: count,
      status: 'EXACT' as const,
      warnings: [],
    },
    posts,
    items: posts.map((post, position) => ({
      tweetId: post.tweetId,
      position,
      observedAt: '2026-07-11T13:00:00.000Z',
      presentation: 'POST' as const,
    })),
  };
}

describe('X collector uploader', () => {
  it('chunks primary timeline items without duplicating post payloads', () => {
    const chunks = buildUploadChunks(capture(), 25);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.items).toHaveLength(25);
    expect(chunks[1]?.items).toHaveLength(1);
    expect(chunks.flatMap((chunk) => chunk.posts)).toHaveLength(26);
    expect(chunks[0]?.posts[0]?.links).toMatchObject([
      { normalizedUrl: 'https://example.com/story' },
    ]);
  });

  it('uploads and verifies a complete capture', async () => {
    const requests: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, method: init?.method ?? 'GET' });
      if (url.endsWith('/api/v1/x-timeline/runs') && init?.method === 'POST') {
        return Response.json({ run: { id: 'run-collector-001' } }, { status: 201 });
      }
      if (url.includes('/chunks/')) return Response.json({ accepted: true });
      if (url.endsWith('/complete')) {
        return Response.json({ run: { id: 'run-collector-001', collectedCount: 26 } });
      }
      return Response.json({ run: { id: 'run-collector-001', collectedCount: 26 } });
    }) as unknown as typeof fetch;

    const result = await uploadCapture(capture(), {
      apiUrl: 'https://archive.example.com/',
      token: 'zine_pat_test',
      fetchImpl,
    });
    expect(result).toMatchObject({ chunksUploaded: 2, timelineItemsSubmitted: 26, verified: true });
    expect(requests.map((request) => request.method)).toEqual([
      'POST',
      'PUT',
      'PUT',
      'POST',
      'GET',
    ]);
  });

  it('links an immutable membership snapshot to its Favorites run', async () => {
    let requestBody: unknown;
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ source: { snapshotId: 'snapshot-1' }, created: true });
    }) as unknown as typeof fetch;

    await uploadDailySourceSnapshot(
      {
        runId: 'favorites-run',
        sourceId: 'x-list:123',
        sourceType: 'FAVORITES',
        name: 'Favorites',
        selected: true,
        capturedAt: '2026-07-25T10:15:00.000Z',
        status: 'COMPLETE',
        usernames: ['alice', 'bob'],
      },
      { apiUrl: 'https://archive.example.com', token: 'zine_pat_test', fetchImpl }
    );

    expect(requestBody).toMatchObject({
      runId: 'favorites-run',
      sourceType: 'FAVORITES',
      usernames: ['alice', 'bob'],
    });
  });
});
