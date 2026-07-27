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
  presentation?: string;
  conversationId?: string | null;
}) {
  const timestamp = Date.parse(input.publishedAt);
  return {
    tweet_id: input.id,
    url: `https://x.com/i/status/${input.id}`,
    text: input.text,
    published_at: timestamp,
    lang: 'en',
    kind: input.kind ?? 'POST',
    conversation_id: input.conversationId ?? null,
    structure_json: JSON.stringify(
      input.conversationId
        ? { status: 'EXACT', source: 'X_WEB_GRAPHQL_LIST', observedAt: input.publishedAt }
        : { status: 'PARTIAL', source: 'DOM_TIMELINE' }
    ),
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
    presentation: input.presentation ?? 'POST',
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
    favoritesRun?: boolean;
    sourceCapturedAt?: number;
    postRows?: ReturnType<typeof postRow>[];
    favoritePostRows?: ReturnType<typeof postRow>[];
    contextPostRows?: ReturnType<typeof postRow>[];
    relationshipRows?: Array<Record<string, unknown>>;
    relationshipBindingCounts?: number[];
    favoritesStatus?: 'COMPLETE' | 'PARTIAL';
    favoritesRequestedCount?: number;
    favoritesCollectedCount?: number;
    favoritesContextCoverage?: Record<string, unknown>;
    favoritesCollectionPolicy?: Record<string, unknown>;
    favoritesTerminationReason?: string;
    favoritesWindowCoverage?: Record<string, unknown>;
    sourceStatus?: 'COMPLETE' | 'PARTIAL';
    sourceFailureReason?: string | null;
    sourceUnresolvedUsernames?: string[];
  } = {}
): D1Database {
  const configuredSources = options.configuredSources ?? true;
  const favoritesRun = options.favoritesRun ?? configuredSources;
  const sourceCapturedAt = options.sourceCapturedAt ?? NOW.getTime();
  const rowsForRun = options.postRows ?? todayRows;
  const favoriteRowsForRun = options.favoritePostRows ?? rowsForRun.slice(0, 2);
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
                ...(favoritesRun
                  ? [
                      {
                        id: 'favorites-run',
                        requested_count: options.favoritesRequestedCount ?? 5_000,
                        collected_count: options.favoritesCollectedCount ?? 2,
                        status: options.favoritesStatus ?? 'COMPLETE',
                        started_at: Date.parse('2026-07-24T12:30:00.000Z'),
                        completed_at: Date.parse('2026-07-24T13:00:00.000Z'),
                        excluded_ads: 0,
                        failure_reason: null,
                        source_type: 'FAVORITES',
                        source_id: 'favorites',
                        source_name: 'Favorites',
                        source_url: 'https://x.com/i/lists/123',
                        context_coverage_json: JSON.stringify(
                          options.favoritesContextCoverage ?? {
                            budget: 40,
                            attempted: 0,
                            completed: 0,
                            truncated: 0,
                            failed: 0,
                            warnings: [],
                          }
                        ),
                        collection_policy_json: JSON.stringify(
                          options.favoritesCollectionPolicy ?? {
                            mode: 'ROLLING_WINDOW',
                            windowHours: 24,
                            cutoffAt: '2026-07-23T12:30:00.000Z',
                            boundaryEvidenceRequired: 3,
                          }
                        ),
                        termination_reason:
                          options.favoritesTerminationReason ?? 'WINDOW_BOUNDARY_REACHED',
                        window_coverage_json: JSON.stringify(
                          options.favoritesWindowCoverage ?? {
                            outsideWindow: 3,
                            missingPublishedAt: 0,
                            boundaryEvidenceRequired: 3,
                            boundaryReached: true,
                          }
                        ),
                      },
                    ]
                  : []),
                {
                  id: 'following-run',
                  requested_count: 3,
                  collected_count: 3,
                  status: 'COMPLETE',
                  started_at: Date.parse('2026-07-24T12:00:00.000Z'),
                  completed_at: Date.parse('2026-07-24T13:00:00.000Z'),
                  excluded_ads: 0,
                  failure_reason: null,
                  source_type: 'FOLLOWING',
                  source_id: 'following',
                  source_name: 'Following',
                  source_url: 'https://x.com/home',
                  context_coverage_json: JSON.stringify({
                    budget: 0,
                    attempted: 0,
                    completed: 0,
                    truncated: 0,
                    failed: 0,
                    warnings: [],
                  }),
                  collection_policy_json: JSON.stringify({ mode: 'COUNT' }),
                  termination_reason: 'COUNT_REACHED',
                  window_coverage_json: JSON.stringify({
                    outsideWindow: 0,
                    missingPublishedAt: 0,
                    boundaryEvidenceRequired: 0,
                    boundaryReached: false,
                  }),
                },
              ],
            };
          }
          if (sql.includes('FROM x_timeline_run_items i')) {
            return { results: bindings[1] === 'favorites-run' ? favoriteRowsForRun : rowsForRun };
          }
          if (sql.includes('FROM x_timeline_run_context_posts')) {
            return {
              results: bindings[1] === 'favorites-run' ? (options.contextPostRows ?? []) : [],
            };
          }
          if (sql.includes('FROM x_post_relationships r')) {
            options.relationshipBindingCounts?.push(bindings.length);
            const sourceIds = new Set(bindings.slice(1));
            return {
              results: options.relationshipRows
                ? options.relationshipRows.filter((row) =>
                    sourceIds.has(String(row.source_tweet_id))
                  )
                : sourceIds.has('100')
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
          if (sql.includes('FROM x_daily_source_snapshots')) {
            return {
              results: configuredSources
                ? [
                    {
                      source_id: 'favorites',
                      snapshot_id: 'snapshot-1',
                      run_id: 'favorites-run',
                      source_type: 'FAVORITES',
                      name: 'Favorites',
                      is_selected: 1,
                      captured_at: sourceCapturedAt,
                      status: options.sourceStatus ?? 'COMPLETE',
                      failure_reason: options.sourceFailureReason ?? null,
                      supplied_count: 2,
                      resolved_count: 2,
                      unresolved_usernames_json: JSON.stringify(
                        options.sourceUnresolvedUsernames ?? []
                      ),
                      author_key: 'id:alice',
                    },
                    {
                      source_id: 'favorites',
                      snapshot_id: 'snapshot-1',
                      run_id: 'favorites-run',
                      source_type: 'FAVORITES',
                      name: 'Favorites',
                      is_selected: 1,
                      captured_at: sourceCapturedAt,
                      status: options.sourceStatus ?? 'COMPLETE',
                      failure_reason: options.sourceFailureReason ?? null,
                      supplied_count: 2,
                      resolved_count: 2,
                      unresolved_usernames_json: JSON.stringify(
                        options.sourceUnresolvedUsernames ?? []
                      ),
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
  it('collapses exact same-conversation posts even when an intermediate parent is unavailable', async () => {
    const conversationRows = [
      postRow({
        id: '500',
        authorKey: 'id:one',
        username: 'one',
        name: 'One',
        text: 'Root',
        publishedAt: '2026-07-24T12:00:00.000Z',
        conversationId: '500',
        position: 0,
      }),
      postRow({
        id: '502',
        authorKey: 'id:two',
        username: 'two',
        name: 'Two',
        text: 'Nested reply whose direct parent was unavailable',
        publishedAt: '2026-07-24T12:10:00.000Z',
        conversationId: '500',
        position: 1,
        kind: 'REPLY',
      }),
    ];
    const result = await getDailyFeed(
      fakeArchiveDb({
        postRows: conversationRows,
        favoritePostRows: conversationRows,
        relationshipRows: [],
      }),
      USER_ID,
      { now: NOW }
    );

    expect(result.conversations).toEqual([]);
    expect(result.threadUnits).toEqual([
      expect.objectContaining({
        id: 'conversation:500',
        postIds: ['500', '502'],
        relationshipTypes: ['CONVERSATION_ID'],
      }),
    ]);
  });

  it('filters to explicit sources and keeps relationship-backed posts in one thread unit', async () => {
    const result = await getDailyFeed(fakeArchiveDb(), USER_ID, { now: NOW });

    expect(result).toMatchObject({
      schemaVersion: 3,
      variant: { id: 'people-first-v4-editorial-overview', mode: 'REVIEW' },
      clustering: {
        version: 'daily-topics-v1',
        method: 'THREAD_FIRST_EVIDENCE_CLUSTERING',
        maxTopics: 5,
        minimumFavoriteAuthors: 2,
      },
      overview: {
        version: 'daily-overview-v1',
        status: 'FALLBACK',
      },
    });
    expect(result.coverage).toMatchObject({
      status: 'COMPLETE',
      archiveStatus: 'COMPLETE',
      selectionStatus: 'COMPLETE',
      collectedCount: 2,
    });
    expect(result.posts.map((post) => post.id)).toEqual(['100', '101', '102']);
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
    expect(result.conversations).toEqual([]);
    expect(result.threadUnits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          postIds: ['101', '100'],
          authors: ['bob', 'alice'],
          favoriteAuthors: ['bob', 'reposter'],
        }),
      ])
    );
    expect(result.sections).toMatchObject({
      favoritePostIds: ['100', '101'],
      followingPostIds: ['102'],
    });
    expect(result.inputs).toMatchObject({
      favorites: { runId: 'favorites-run', sourceId: 'favorites' },
      following: { runId: 'following-run' },
      membership: { snapshotId: 'snapshot-1', runId: 'favorites-run', resolvedCount: 2 },
    });
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
      'No frozen Favorites list run is available'
    );
    expect(result.posts).toHaveLength(3);
  });

  it('collapses a Favorite reply with immutable run context without adding context to streams', async () => {
    const favoriteReply = postRow({
      id: '200',
      authorKey: 'id:alice',
      username: 'alice',
      name: 'Alice',
      text: 'Part two of my thread.',
      publishedAt: '2026-07-24T12:15:00.000Z',
      kind: 'REPLY',
    });
    const threadParent = postRow({
      id: '199',
      authorKey: 'id:alice',
      username: 'alice',
      name: 'Alice',
      text: 'Part one of my thread.',
      publishedAt: '2026-07-24T12:00:00.000Z',
    });
    const db = fakeArchiveDb({
      postRows: [],
      favoritePostRows: [favoriteReply],
      contextPostRows: [threadParent],
      relationshipRows: [
        {
          source_tweet_id: '200',
          relationship_type: 'REPLY_TO',
          target_tweet_id: '199',
          target_url: 'https://x.com/alice/status/199',
          target_text: 'Part one of my thread.',
          target_author_key: 'id:alice',
          target_username: 'alice',
          target_author_name: 'Alice',
          target_profile_image_url: null,
        },
      ],
    });

    const result = await getDailyFeed(db, USER_ID, { now: NOW });

    expect(result.conversations).toEqual([]);
    expect(result.threadUnits).toEqual([
      expect.objectContaining({
        favoritePostIds: ['200'],
        contextPostIds: ['199'],
        postIds: ['199', '200'],
      }),
    ]);
    expect(result.sections).toMatchObject({ favoritePostIds: ['200'], followingPostIds: [] });
    expect(result.posts.find((post) => post.id === '199')?.sourceIds).toEqual([]);
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
      'Favorites membership was captured on a different day than the frozen post run.'
    );
  });

  it('discloses a partial roster and unresolved member resolution', async () => {
    const result = await getDailyFeed(
      fakeArchiveDb({
        sourceStatus: 'PARTIAL',
        sourceFailureReason: 'membership_stalled',
        sourceUnresolvedUsernames: ['missing'],
      }),
      USER_ID,
      { now: NOW }
    );

    expect(result.coverage.selectionStatus).toBe('STALE');
    expect(result.coverage.status).toBe('PARTIAL');
    expect(result.freshness.warnings).toEqual(
      expect.arrayContaining([
        'Favorites membership capture is partial.',
        'membership_stalled',
        'Favorites membership has 1 unresolved username.',
      ])
    );
    expect(result.inputs.membership).toMatchObject({
      status: 'PARTIAL',
      unresolvedCount: 1,
      failureReason: 'membership_stalled',
    });
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

  it('keeps Favorites posts that are absent from the Following slice and groups strong topics', async () => {
    const favoriteOnly = [
      postRow({
        id: 'favorite-only-1',
        authorKey: 'id:alice',
        username: 'alice',
        name: 'Alice',
        text: '#SwiftData migration performance indexing',
        publishedAt: '2026-07-24T12:30:00.000Z',
        position: 0,
      }),
      postRow({
        id: 'favorite-only-2',
        authorKey: 'id:bob',
        username: 'bob',
        name: 'Bob',
        text: '#SwiftData migration performance benchmarks',
        publishedAt: '2026-07-24T12:20:00.000Z',
        position: 1,
      }),
    ];
    const result = await getDailyFeed(
      fakeArchiveDb({ favoritePostRows: favoriteOnly, postRows: [todayRows[2]] }),
      USER_ID,
      { now: NOW }
    );

    expect(result.posts.map((post) => post.id)).toEqual([
      'favorite-only-1',
      'favorite-only-2',
      '102',
    ]);
    expect(result.conversations).toEqual([
      expect.objectContaining({
        evidenceType: 'TOPIC_SIMILARITY',
        favoritePostIds: ['favorite-only-1', 'favorite-only-2'],
        contextPostIds: [],
      }),
    ]);
    expect(result.sections.followingPostIds).toEqual(['102']);
  });

  it('preserves Favorite quote context without treating a quote pair as a topic', async () => {
    const quote = postRow({
      id: 'quote-2',
      authorKey: 'id:alice',
      username: 'alice',
      name: 'Alice',
      text: 'Quoting this for context.',
      publishedAt: '2026-07-24T12:30:00.000Z',
      kind: 'QUOTE',
      position: 0,
    });
    const quoted = postRow({
      id: 'quote-1',
      authorKey: 'id:outside',
      username: 'outside',
      name: 'Outside',
      text: 'The quoted post.',
      publishedAt: '2026-07-24T12:00:00.000Z',
    });
    const result = await getDailyFeed(
      fakeArchiveDb({
        postRows: [],
        favoritePostRows: [quote],
        contextPostRows: [quoted],
        relationshipRows: [
          {
            source_tweet_id: 'quote-2',
            relationship_type: 'QUOTE_OF',
            target_tweet_id: 'quote-1',
            target_url: 'https://x.com/outside/status/quote-1',
            target_text: 'The quoted post.',
            target_author_key: 'id:outside',
            target_username: 'outside',
            target_author_name: 'Outside',
            target_profile_image_url: null,
          },
        ],
      }),
      USER_ID,
      { now: NOW }
    );

    expect(result.conversations).toEqual([]);
    expect(result.sections.favoritePostIds).toEqual(['quote-2']);
    expect(result.posts.find((post) => post.id === 'quote-2')?.relationships).toEqual([
      expect.objectContaining({ type: 'QUOTE_OF', tweetId: 'quote-1' }),
    ]);
  });

  it('groups a shared normalized link but leaves weak topic overlap ungrouped', async () => {
    const sharedLink = {
      url: 'https://example.com/report',
      normalizedUrl: 'https://example.com/report',
      source: 'TEXT',
    };
    const favorites = [
      postRow({
        id: 'link-1',
        authorKey: 'id:alice',
        username: 'alice',
        name: 'Alice',
        text: '#AI cats',
        publishedAt: '2026-07-24T12:30:00.000Z',
        position: 0,
        links: [sharedLink],
      }),
      postRow({
        id: 'link-2',
        authorKey: 'id:bob',
        username: 'bob',
        name: 'Bob',
        text: '#AI dogs',
        publishedAt: '2026-07-24T12:20:00.000Z',
        position: 1,
        links: [sharedLink],
      }),
      postRow({
        id: 'weak-1',
        authorKey: 'id:carol',
        username: 'carol',
        name: 'Carol',
        text: '#Robotics gardens',
        publishedAt: '2026-07-24T12:10:00.000Z',
        position: 2,
      }),
      postRow({
        id: 'weak-2',
        authorKey: 'id:dave',
        username: 'dave',
        name: 'Dave',
        text: '#Robotics kitchens',
        publishedAt: '2026-07-24T12:00:00.000Z',
        position: 3,
      }),
    ];
    const result = await getDailyFeed(
      fakeArchiveDb({ postRows: [], favoritePostRows: favorites, relationshipRows: [] }),
      USER_ID,
      { now: NOW }
    );

    expect(result.conversations).toEqual([
      expect.objectContaining({
        evidenceType: 'TOPIC_SIMILARITY',
        favoritePostIds: ['link-1', 'link-2'],
      }),
    ]);
    expect(result.sections.favoritePostIds).toEqual(['weak-1', 'weak-2']);
  });

  it('surfaces partial timeline and truncated context coverage', async () => {
    const result = await getDailyFeed(
      fakeArchiveDb({
        favoritesStatus: 'PARTIAL',
        favoritesRequestedCount: 5_000,
        favoritesCollectedCount: 120,
        favoritesTerminationReason: 'TIMELINE_STALLED',
        favoritesContextCoverage: {
          budget: 40,
          attempted: 40,
          completed: 38,
          truncated: 1,
          failed: 1,
          warnings: ['context_budget_reached', 'thread_unavailable'],
        },
      }),
      USER_ID,
      { now: NOW }
    );

    expect(result.coverage.status).toBe('PARTIAL');
    expect(result.freshness.warnings.join(' ')).toContain(
      'did not prove complete 24-hour coverage'
    );
    expect(result.freshness.warnings).toContain('1 Favorite thread expansion was truncated.');
    expect(result.threadUnits[0]?.coverageWarnings).not.toContain('context_budget_reached');
    expect(result.inputs.favorites?.contextCoverage).toMatchObject({ truncated: 1, failed: 1 });
  });

  it('shows an honest empty Favorites section without substituting Following', async () => {
    const result = await getDailyFeed(
      fakeArchiveDb({
        favoritePostRows: [],
        favoritesStatus: 'PARTIAL',
        favoritesRequestedCount: 5_000,
        favoritesCollectedCount: 0,
        favoritesTerminationReason: 'TIMELINE_STALLED',
      }),
      USER_ID,
      { now: NOW }
    );

    expect(result.sources[0]).toMatchObject({ type: 'FAVORITES' });
    expect(result.sections.favoritePostIds).toEqual([]);
    expect(result.sections.followingPostIds).toEqual(['100', '101', '102']);
    expect(result.coverage.selectionStatus).not.toBe('FALLBACK');
  });

  it('defensively excludes Favorites posts outside the rolling 24-hour window', async () => {
    const inside = postRow({
      id: 'inside-window',
      authorKey: 'id:alice',
      username: 'alice',
      name: 'Alice',
      text: 'Inside the window',
      publishedAt: '2026-07-24T12:00:00.000Z',
      position: 0,
    });
    const outside = postRow({
      id: 'outside-window',
      authorKey: 'id:bob',
      username: 'bob',
      name: 'Bob',
      text: 'Outside the window',
      publishedAt: '2026-07-23T12:00:00.000Z',
      position: 1,
    });
    const recentRepostOfOlderMaterial = postRow({
      id: 'recent-repost',
      authorKey: 'id:carol',
      username: 'carol',
      name: 'Carol',
      text: 'Older original, recently reposted by a Favorite',
      publishedAt: '2025-01-01T12:00:00.000Z',
      position: 1,
      presentation: 'REPOST',
    });
    const result = await getDailyFeed(
      fakeArchiveDb({
        favoritePostRows: [inside, recentRepostOfOlderMaterial, outside],
        postRows: [],
      }),
      USER_ID,
      { now: NOW }
    );

    expect(result.posts.map((post) => post.id)).toEqual(['inside-window', 'recent-repost']);
    expect(result.freshness.warnings.join(' ')).toContain(
      'outside the rolling 24-hour window and excluded'
    );
    expect(result.freshness.warnings.join(' ')).toContain(
      'rolling-window inclusion follows the verified list activity order'
    );
    expect(result.coverage).toMatchObject({
      collectionMode: 'ROLLING_WINDOW',
      windowHours: 24,
      safetyLimit: 5_000,
      terminationReason: 'WINDOW_BOUNDARY_REACHED',
    });
  });

  it('reports the high numeric guard as partial instead of treating it as the Favorites target', async () => {
    const result = await getDailyFeed(
      fakeArchiveDb({
        favoritesRequestedCount: 5_000,
        favoritesCollectedCount: 5_000,
        favoritesStatus: 'PARTIAL',
        favoritesTerminationReason: 'SAFETY_LIMIT_REACHED',
        favoritesWindowCoverage: {
          outsideWindow: 0,
          missingPublishedAt: 0,
          boundaryEvidenceRequired: 3,
          boundaryReached: false,
        },
      }),
      USER_ID,
      { now: NOW }
    );

    expect(result.coverage.status).toBe('PARTIAL');
    expect(result.freshness.warnings.join(' ')).toContain(
      '5000-post safety guard before reaching the 24-hour boundary'
    );
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
