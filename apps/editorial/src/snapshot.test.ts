import { afterEach, describe, expect, it } from 'bun:test';
import { buildEditorialSnapshot } from './snapshot';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buildEditorialSnapshot', () => {
  it('combines new X, inbox, and bookmark data with canonical deduplication', async () => {
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v1/editorial/editions/latest') return json({}, 404);
      if (url.hostname === 'api.test' && url.pathname === '/api/v1/inbox') {
        return json({
          items: [
            {
              id: 'ui-1',
              itemId: 'item-1',
              title: 'Inbox title',
              canonicalUrl: 'https://example.com/item',
              contentType: 'ARTICLE',
              provider: 'WEB',
              creator: 'Creator',
              summary: 'Summary',
              state: 'INBOX',
              ingestedAt: '2026-07-11T11:00:00.000Z',
              isFinished: false,
              tags: [],
            },
          ],
          nextCursor: null,
        });
      }
      if (url.hostname === 'api.test' && url.pathname === '/api/v1/bookmarks') {
        return json({
          items: [
            {
              id: 'ui-1',
              itemId: 'item-1',
              title: 'Bookmark title',
              canonicalUrl: 'https://example.com/item',
              contentType: 'ARTICLE',
              provider: 'WEB',
              creator: 'Creator',
              summary: 'Better summary',
              state: 'BOOKMARKED',
              ingestedAt: '2026-07-11T10:00:00.000Z',
              bookmarkedAt: '2026-07-11T11:30:00.000Z',
              isFinished: false,
              tags: ['important'],
            },
          ],
          nextCursor: null,
        });
      }
      if (url.hostname === 'x.test' && url.pathname === '/api/v1/x-timeline/runs') {
        return json({
          runs: [
            {
              id: 'x-run-1',
              status: 'COMPLETE',
              startedAt: '2026-07-11T10:00:00.000Z',
              completedAt: '2026-07-11T11:00:00.000Z',
            },
          ],
        });
      }
      if (url.hostname === 'x.test' && url.pathname.endsWith('/x-run-1')) {
        return json({
          items: [
            {
              position: 0,
              observedAt: '2026-07-11T10:00:00.000Z',
              post: {
                tweetId: 'tweet-1',
                url: 'https://x.com/user/status/tweet-1',
                text: 'A post',
                publishedAt: '2026-07-11T09:00:00.000Z',
                firstSeenAt: '2026-07-11T10:00:00.000Z',
                author: { username: 'user', name: 'User' },
                metrics: { likes: 10 },
              },
            },
          ],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    const snapshot = await buildEditorialSnapshot({
      token: 'token',
      archiveToken: 'token',
      apiUrl: 'https://api.test',
      xApiUrl: 'https://x.test',
      now: new Date('2026-07-11T12:00:00.000Z'),
      timezone: 'America/Chicago',
      editionDate: '2026-07-11',
      snapshotKey: 'snapshot.json',
    });

    expect(snapshot.documents).toHaveLength(2);
    expect(
      snapshot.documents.find((document) => document.source.id === 'zine:item-1')
    ).toMatchObject({
      source: { userState: 'BOOKMARKED', title: 'Bookmark title' },
      signals: { tags: ['important'] },
    });
    expect(snapshot.provenance.inputCounts).toMatchObject({
      xTimelineEntries: 1,
      inboxItems: 1,
      recentBookmarks: 1,
    });
  });
});
