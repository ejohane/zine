import { describe, expect, it } from 'vitest';

import { getDailyAuthorActivity, getDailyFeed } from './daily-feed';

const USER_ID = 'daily-user';
const NOW = new Date('2026-07-24T16:00:00.000Z');

function postRow(input: {
  id: string;
  authorKey: string;
  username: string;
  name: string;
  text: string;
  publishedAt: string;
  position?: number | null;
  kind?: string;
  links?: unknown[];
  repostedBy?: unknown;
}) {
  const timestamp = Date.parse(input.publishedAt);
  return {
    tweet_id: input.id,
    url: `https://x.com/i/status/${input.id}`,
    text: input.text,
    published_at: timestamp,
    lang: 'en',
    kind: input.kind ?? 'POST',
    author_key: input.authorKey,
    username: input.username,
    author_name: input.name,
    profile_url: `https://x.com/${input.username}`,
    profile_image_url: `https://example.com/${input.username}.jpg`,
    verified: 0,
    media_json: '[]',
    links_json: JSON.stringify(input.links ?? []),
    metrics_json: '{}',
    first_seen_at: timestamp,
    last_seen_at: timestamp,
    position: input.position ?? null,
    observed_at: Date.parse('2026-07-24T13:00:00.000Z'),
    presentation: 'POST',
    reposted_by_json: input.repostedBy ? JSON.stringify(input.repostedBy) : null,
  };
}

const todayRows = [
  postRow({
    id: '100',
    authorKey: 'id:alice',
    username: 'alice',
    name: 'Alice',
    text: 'Alice replies with context.',
    publishedAt: '2026-07-24T12:15:00.000Z',
    position: 0,
    kind: 'REPLY',
    links: [
      {
        url: 'https://example.com/story',
        normalizedUrl: 'https://example.com/story',
        source: 'TEXT',
      },
    ],
    repostedBy: {
      username: 'reposter',
      name: 'Reposter',
      profileUrl: 'https://x.com/reposter',
      profileImageUrl: null,
    },
  }),
  postRow({
    id: '101',
    authorKey: 'id:bob',
    username: 'bob',
    name: 'Bob',
    text: 'Bob starts the thread.',
    publishedAt: '2026-07-24T12:00:00.000Z',
    position: 1,
  }),
  postRow({
    id: '102',
    authorKey: 'id:other',
    username: 'other',
    name: 'Other',
    text: 'An unrelated post.',
    publishedAt: '2026-07-24T11:00:00.000Z',
    position: 2,
  }),
];

const earlierAlice = postRow({
  id: '099',
  authorKey: 'id:alice',
  username: 'alice',
  name: 'Alice',
  text: 'Alice earlier in the week.',
  publishedAt: '2026-07-20T12:00:00.000Z',
  kind: 'QUOTE',
});

function fakeArchiveDb(
  options: {
    configuredSources?: boolean;
    sourceCapturedAt?: number;
    postRows?: ReturnType<typeof postRow>[];
    relationshipBindingCounts?: number[];
  } = {}
): D1Database {
  const configuredSources = options.configuredSources ?? true;
  const sourceCapturedAt = options.sourceCapturedAt ?? NOW.getTime();
  const rowsForRun = options.postRows ?? todayRows;
  return {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bindings = values;
          return this;
        },
        async all() {
          if (sql.includes('FROM x_timeline_runs')) {
            return {
              results: [
                {
                  id: 'run-1',
                  requested_count: 3,
                  collected_count: 3,
                  status: 'COMPLETE',
                  started_at: Date.parse('2026-07-24T12:00:00.000Z'),
                  completed_at: Date.parse('2026-07-24T13:00:00.000Z'),
                  excluded_ads: 0,
                  failure_reason: null,
                },
              ],
            };
          }
          if (sql.includes('FROM x_timeline_run_items i')) {
            return { results: rowsForRun };
          }
          if (sql.includes('FROM x_post_relationships r')) {
            options.relationshipBindingCounts?.push(bindings.length);
            const sourceIds = new Set(bindings.slice(1));
            return {
              results: sourceIds.has('100')
                ? [
                    {
                      source_tweet_id: '100',
                      relationship_type: 'REPLY_TO',
                      target_tweet_id: '101',
                      target_url: 'https://x.com/i/status/101',
                      target_text: 'Bob starts the thread.',
                      target_author_key: 'id:bob',
                      target_username: 'bob',
                      target_author_name: 'Bob',
                      target_profile_image_url: 'https://example.com/bob.jpg',
                    },
                  ]
                : [],
            };
          }
          if (sql.includes('FROM x_daily_sources s')) {
            return {
              results: configuredSources
                ? [
                    {
                      source_id: 'favorites',
                      source_type: 'FAVORITES',
                      name: 'Favorites',
                      is_selected: 1,
                      captured_at: sourceCapturedAt,
                      author_key: 'id:alice',
                    },
                    {
                      source_id: 'favorites',
                      source_type: 'FAVORITES',
                      name: 'Favorites',
                      is_selected: 1,
                      captured_at: sourceCapturedAt,
                      author_key: 'id:bob',
                    },
                  ]
                : [],
            };
          }
          if (sql.includes('FROM x_posts p') && sql.includes('p.author_key = ?')) {
            const authorKey = bindings[1];
            return {
              results: authorKey === 'id:alice' ? [todayRows[0], earlierAlice] : [todayRows[1]],
            };
          }
          throw new Error(`Unexpected all query: ${sql}`);
        },
      };
    },
  } as unknown as D1Database;
}

describe('people-first daily feed', () => {
  it('filters to explicit sources and groups only relationship-backed conversations', async () => {
    const result = await getDailyFeed(fakeArchiveDb(), USER_ID, { now: NOW });

    expect(result.coverage).toMatchObject({
      status: 'COMPLETE',
      archiveStatus: 'COMPLETE',
      selectionStatus: 'COMPLETE',
      collectedCount: 3,
    });
    expect(result.posts.map((post) => post.id)).toEqual(['100', '101']);
    expect(result.posts[0]).toMatchObject({
      author: { username: 'alice' },
      repostedBy: {
        key: 'username:reposter',
        username: 'reposter',
        name: 'Reposter',
        profileUrl: 'https://x.com/reposter',
        profileImageUrl: null,
        verified: null,
      },
      sourceIds: ['favorites'],
      relationships: [
        {
          type: 'REPLY_TO',
          target: { tweetId: '101', text: 'Bob starts the thread.' },
        },
      ],
    });
    expect(result.conversations).toEqual([
      expect.objectContaining({
        evidenceType: 'DIRECT_RELATIONSHIP',
        postIds: ['100', '101'],
        authors: ['alice', 'bob'],
      }),
    ]);
  });

  it('labels Following as a partial fallback instead of claiming favorites', async () => {
    const result = await getDailyFeed(fakeArchiveDb({ configuredSources: false }), USER_ID, {
      now: NOW,
    });

    expect(result.coverage.selectionStatus).toBe('FALLBACK');
    expect(result.coverage.status).toBe('PARTIAL');
    expect(result.sources).toEqual([
      expect.objectContaining({ id: 'following-fallback', type: 'FOLLOWING_FALLBACK' }),
    ]);
    expect(result.freshness.warnings.join(' ')).toContain(
      'Favorite and selected-list membership has not been captured'
    );
    expect(result.posts).toHaveLength(3);
  });

  it('marks source membership captured on another day as stale', async () => {
    const result = await getDailyFeed(
      fakeArchiveDb({ sourceCapturedAt: Date.parse('2026-07-23T16:00:00.000Z') }),
      USER_ID,
      { now: NOW }
    );

    expect(result.coverage.selectionStatus).toBe('STALE');
    expect(result.coverage.status).toBe('PARTIAL');
    expect(result.freshness.warnings).toContain(
      'Favorite/list membership was captured on a different day than the frozen post run.'
    );
  });

  it('batches relationship lookups below the production D1 bind-variable limit', async () => {
    const relationshipBindingCounts: number[] = [];
    const postRows = Array.from({ length: 205 }, (_, index) =>
      postRow({
        id: `bulk-${index}`,
        authorKey: `id:bulk-${index}`,
        username: `bulk${index}`,
        name: `Bulk ${index}`,
        text: `Bulk post ${index}`,
        publishedAt: '2026-07-24T12:00:00.000Z',
        position: index,
      })
    );

    const result = await getDailyFeed(
      fakeArchiveDb({
        configuredSources: false,
        postRows,
        relationshipBindingCounts,
      }),
      USER_ID,
      { now: NOW }
    );

    expect(result.posts).toHaveLength(205);
    expect(relationshipBindingCounts).toEqual([91, 91, 26]);
  });

  it('returns all available author posts for today and the past week with context', async () => {
    const db = fakeArchiveDb();
    const today = await getDailyAuthorActivity(db, USER_ID, 'id:alice', {
      date: '2026-07-24',
      range: 'TODAY',
      now: NOW,
    });
    expect(today.posts.map((post) => post.id)).toEqual(['100']);

    const week = await getDailyAuthorActivity(db, USER_ID, 'id:alice', {
      date: '2026-07-24',
      range: 'WEEK',
      now: NOW,
    });
    expect(week.posts.map((post) => post.id)).toEqual(['100', '099']);
    expect(week.posts[0].relationships[0].target?.author.username).toBe('bob');
    expect(week.coverage.warnings[0]).toContain('every post available');
  });
});
