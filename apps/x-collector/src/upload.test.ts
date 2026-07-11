import { describe, expect, it, vi } from 'vitest';
import { buildUploadChunks, uploadCapture } from './upload';

function capture(count = 26) {
  const posts = Array.from({ length: count }, (_, index) => ({
    tweetId: String(1000 + index),
    url: `https://x.com/example/status/${1000 + index}`,
    text: `Post ${index}`,
    kind: 'POST' as const,
    author: { username: 'example', name: 'Example' },
    media: [],
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
    excludedAds: 0,
    status: 'COMPLETE' as const,
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
});
