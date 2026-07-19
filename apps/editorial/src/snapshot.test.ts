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
      if (url.hostname === 'api.test' && url.pathname === '/api/v1/editorial/feedback/profile') {
        return json({
          profile: {
            schemaVersion: 1,
            generatedAt: '2026-07-11T11:59:00.000Z',
            lookbackDays: 180,
            halfLifeDays: 60,
            maxEvents: 500,
            eventCount: 1,
            truncated: false,
            topics: [
              {
                key: 'agent',
                affinity: 1,
                novelty: 0,
                signalCounts: {
                  moreLikeThis: 1,
                  lessLikeThis: 0,
                  dismissed: 0,
                  alreadyKnew: 0,
                },
                lastSignaledAt: '2026-07-10T12:00:00.000Z',
              },
            ],
            creators: [],
            canonicalUrls: [],
            sourceIds: [],
          },
        });
      }
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
            {
              id: 'ui-history',
              itemId: 'item-history',
              title: 'A finished favorite',
              canonicalUrl: 'https://example.com/history',
              contentType: 'ARTICLE',
              provider: 'WEB',
              creator: 'Trusted Creator',
              summary: "Older material that still represents the user's taste.",
              state: 'BOOKMARKED',
              ingestedAt: '2026-05-01T10:00:00.000Z',
              bookmarkedAt: '2026-05-02T11:30:00.000Z',
              lastOpenedAt: '2026-06-20T09:00:00.000Z',
              isFinished: true,
              tags: ['favorite'],
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
            {
              id: 'x-run-2',
              status: 'COMPLETE',
              startedAt: '2026-07-11T10:30:00.000Z',
              completedAt: '2026-07-11T11:30:00.000Z',
            },
          ],
        });
      }
      if (
        url.hostname === 'x.test' &&
        (url.pathname.endsWith('/x-run-1') || url.pathname.endsWith('/x-run-2'))
      ) {
        const isSecondRun = url.pathname.endsWith('/x-run-2');
        return json({
          items: [
            {
              position: 0,
              observedAt: isSecondRun ? '2026-07-11T11:15:00.000Z' : '2026-07-11T10:00:00.000Z',
              post: {
                tweetId: 'tweet-1',
                url: 'https://x.com/user/status/tweet-1',
                text: 'A post',
                publishedAt: '2026-07-11T09:00:00.000Z',
                firstSeenAt: '2026-07-11T10:00:00.000Z',
                author: { username: 'user', name: 'User' },
                metrics: { likes: isSecondRun ? 15 : 10 },
                links: [
                  {
                    url: 'https://example.com/story?utm_source=x',
                    normalizedUrl: 'https://example.com/story',
                    source: 'CARD',
                    card: {
                      title: 'Linked story',
                      description: 'A linked source.',
                      domain: 'example.com',
                      imageUrl: 'https://example.com/story.jpg',
                    },
                  },
                ],
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

    expect(snapshot.documents).toHaveLength(3);
    expect(
      snapshot.documents.find((document) => document.source.id === 'zine:item-1')
    ).toMatchObject({
      source: { userState: 'BOOKMARKED', title: 'Bookmark title' },
      signals: { tags: ['important'] },
    });
    expect(snapshot.provenance.inputCounts).toMatchObject({
      xTimelineEntries: 2,
      xCanonicalPosts: 1,
      inboxItems: 1,
      recentBookmarks: 1,
      contextualBookmarks: 1,
    });
    expect(snapshot.feedbackProfile).toMatchObject({
      eventCount: 1,
      topics: [{ key: 'agent', affinity: 1 }],
    });
    expect(
      snapshot.documents.find((document) => document.source.id === 'zine:item-history')
    ).toMatchObject({
      source: { userState: 'FINISHED', title: 'A finished favorite' },
      signals: { lastOpenedAt: '2026-06-20T09:00:00.000Z', isFinished: true },
    });
    expect(snapshot.documents.find((document) => document.source.id === 'x:tweet-1')).toMatchObject(
      {
        observedAt: '2026-07-11T11:15:00.000Z',
        engagement: { likes: 15 },
        signals: { tags: ['x-run:x-run-1', 'x-run:x-run-2'] },
        source: { provider: 'X', imageUrl: 'https://example.com/story.jpg' },
        links: [
          {
            normalizedUrl: 'https://example.com/story',
            source: 'CARD',
            card: { title: 'Linked story' },
          },
        ],
      }
    );
  });

  it('continues after one X run fails and only records successfully fetched run provenance', async () => {
    const fetchedRunDetails: string[] = [];
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v1/editorial/editions/latest') return json({}, 404);
      if (url.hostname === 'api.test' && url.pathname === '/api/v1/editorial/feedback/profile') {
        return json({
          profile: {
            schemaVersion: 1,
            generatedAt: '2026-07-11T11:59:00.000Z',
            lookbackDays: 180,
            halfLifeDays: 60,
            maxEvents: 500,
            eventCount: 0,
            truncated: false,
            topics: [],
            creators: [],
            canonicalUrls: [],
            sourceIds: [],
          },
        });
      }
      if (
        url.hostname === 'api.test' &&
        (url.pathname === '/api/v1/inbox' || url.pathname === '/api/v1/bookmarks')
      ) {
        return json({ items: [], nextCursor: null });
      }
      if (url.hostname === 'x.test' && url.pathname === '/api/v1/x-timeline/runs') {
        return json({
          runs: [
            {
              id: 'x-run-failed',
              status: 'COMPLETE',
              startedAt: '2026-07-11T09:00:00.000Z',
              completedAt: '2026-07-11T10:00:00.000Z',
            },
            {
              id: 'x-run-usable',
              status: 'COMPLETE',
              startedAt: '2026-07-11T10:00:00.000Z',
              completedAt: '2026-07-11T11:00:00.000Z',
            },
          ],
        });
      }
      if (url.hostname === 'x.test' && url.pathname.endsWith('/x-run-failed')) {
        fetchedRunDetails.push('x-run-failed');
        return json({ error: 'temporary failure' }, 503);
      }
      if (url.hostname === 'x.test' && url.pathname.endsWith('/x-run-usable')) {
        fetchedRunDetails.push('x-run-usable');
        return json({
          items: [
            {
              position: 0,
              observedAt: '2026-07-11T11:00:00.000Z',
              post: {
                tweetId: 'tweet-usable',
                url: 'https://x.com/user/status/tweet-usable',
                text: 'A usable post after an earlier run failed.',
                publishedAt: '2026-07-11T10:30:00.000Z',
                firstSeenAt: '2026-07-11T11:00:00.000Z',
                author: { username: 'user', name: 'User' },
                metrics: { likes: 4 },
                links: [],
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

    expect(fetchedRunDetails).toEqual(['x-run-failed', 'x-run-usable']);
    expect(snapshot.provenance.xRunIds).toEqual(['x-run-usable']);
    expect(snapshot.provenance.sourceStatus.xArchive).toBe('PARTIAL');
    expect(snapshot.provenance.inputCounts).toMatchObject({
      xTimelineEntries: 1,
      xCanonicalPosts: 1,
    });
    expect(snapshot.documents.map((document) => document.source.id)).toContain('x:tweet-usable');
    expect(snapshot.provenance.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('X archive run x-run-failed collection failed'),
      ])
    );
  });

  it('marks X unavailable when every selected run detail fails', async () => {
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v1/editorial/editions/latest') return json({}, 404);
      if (url.hostname === 'api.test' && url.pathname === '/api/v1/editorial/feedback/profile') {
        return json({
          profile: {
            schemaVersion: 1,
            generatedAt: '2026-07-11T11:59:00.000Z',
            lookbackDays: 180,
            halfLifeDays: 60,
            maxEvents: 500,
            eventCount: 0,
            truncated: false,
            topics: [],
            creators: [],
            canonicalUrls: [],
            sourceIds: [],
          },
        });
      }
      if (
        url.hostname === 'api.test' &&
        (url.pathname === '/api/v1/inbox' || url.pathname === '/api/v1/bookmarks')
      ) {
        return json({ items: [], nextCursor: null });
      }
      if (url.hostname === 'x.test' && url.pathname === '/api/v1/x-timeline/runs') {
        return json({
          runs: [
            {
              id: 'x-run-failed',
              status: 'COMPLETE',
              startedAt: '2026-07-11T10:00:00.000Z',
              completedAt: '2026-07-11T11:00:00.000Z',
            },
          ],
        });
      }
      if (url.hostname === 'x.test' && url.pathname.endsWith('/x-run-failed')) {
        return json({ error: 'temporary failure' }, 503);
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

    expect(snapshot.provenance.xRunIds).toEqual([]);
    expect(snapshot.provenance.sourceStatus.xArchive).toBe('UNAVAILABLE');
    expect(snapshot.provenance.inputCounts.xTimelineEntries).toBe(0);
  });

  it('does not report complete X coverage without a run from the edition window', async () => {
    const cases = [
      {
        runs: [],
        expectedStatus: 'UNAVAILABLE' as const,
        expectedRunIds: [],
        warning: 'No complete or partial X archive runs',
      },
      {
        runs: [
          {
            id: 'x-run-stale',
            status: 'COMPLETE',
            startedAt: '2026-07-09T10:00:00.000Z',
            completedAt: '2026-07-09T11:00:00.000Z',
          },
        ],
        expectedStatus: 'PARTIAL' as const,
        expectedRunIds: ['x-run-stale'],
        warning: 'partial fallback coverage',
      },
    ];

    for (const testCase of cases) {
      globalThis.fetch = (async (input) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/v1/editorial/editions/latest') return json({}, 404);
        if (url.hostname === 'api.test' && url.pathname === '/api/v1/editorial/feedback/profile') {
          return json({}, 404);
        }
        if (
          url.hostname === 'api.test' &&
          (url.pathname === '/api/v1/inbox' || url.pathname === '/api/v1/bookmarks')
        ) {
          return json({ items: [], nextCursor: null });
        }
        if (url.hostname === 'x.test' && url.pathname === '/api/v1/x-timeline/runs') {
          return json({ runs: testCase.runs });
        }
        if (url.hostname === 'x.test' && url.pathname.endsWith('/x-run-stale')) {
          return json({ items: [] });
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

      expect(snapshot.provenance.sourceStatus.xArchive).toBe(testCase.expectedStatus);
      expect(snapshot.provenance.xRunIds).toEqual(testCase.expectedRunIds);
      expect(snapshot.provenance.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining(testCase.warning)])
      );
    }
  });
});
