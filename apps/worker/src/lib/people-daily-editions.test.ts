import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetDailyFeed = vi.hoisted(() => vi.fn());

vi.mock('./daily-feed', () => ({ getDailyFeed: mockGetDailyFeed }));

import {
  activatePeopleDailyEdition,
  getPeopleDailyOverview,
  listPeopleDailyEditions,
  publishPeopleDailyBuild,
  startPeopleDailyBuild,
} from './people-daily-editions';

type Row = Record<string, unknown>;

function fakeResources(options: { failUpload?: boolean } = {}) {
  const builds = new Map<string, Row>();
  const editions = new Map<string, Row>();
  const active = new Map<string, string>();
  const objects = new Map<string, string>();

  const statement = (sql: string) => {
    let bindings: unknown[] = [];
    return {
      bind(...values: unknown[]) {
        bindings = values;
        return this;
      },
      async first() {
        if (sql.includes('FROM people_daily_builds WHERE id = ?')) {
          const row = builds.get(String(bindings[0]));
          return row?.user_id === bindings[1] ? row : null;
        }
        if (sql.includes('FROM people_daily_editions WHERE id = ?')) {
          const row = editions.get(String(bindings[0]));
          return row?.user_id === bindings[1] ? row : null;
        }
        if (sql.includes('WHERE user_id = ? AND content_hash = ?')) {
          return (
            [...editions.values()].find(
              (row) => row.user_id === bindings[0] && row.content_hash === bindings[1]
            ) ?? null
          );
        }
        if (sql.includes('COALESCE(MAX(revision)')) {
          const revisions = [...editions.values()]
            .filter((row) => row.user_id === bindings[0] && row.edition_date === bindings[1])
            .map((row) => Number(row.revision));
          return { revision: revisions.length > 0 ? Math.max(...revisions) : 0 };
        }
        if (sql.includes('FROM people_daily_active_editions')) {
          const editionId = active.get(String(bindings[0]));
          const row = editionId ? editions.get(editionId) : null;
          return row?.user_id === bindings[1] ? row : null;
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
      async all() {
        if (sql.includes('FROM people_daily_editions WHERE user_id = ?')) {
          return {
            results: [...editions.values()]
              .filter((row) => row.user_id === bindings[0] && row.status === 'PUBLISHED')
              .sort(
                (left, right) =>
                  String(right.edition_date).localeCompare(String(left.edition_date)) ||
                  Number(right.revision) - Number(left.revision)
              )
              .slice(0, Number(bindings[1])),
          };
        }
        throw new Error(`Unexpected query: ${sql}`);
      },
      async run() {
        if (sql.includes('INSERT INTO people_daily_builds')) {
          const [
            id,
            userId,
            editionDate,
            algorithm,
            prompt,
            model,
            startedAt,
            createdAt,
            updatedAt,
          ] = bindings;
          builds.set(String(id), {
            id,
            user_id: userId,
            edition_date: editionDate,
            status: 'COLLECTING',
            edition_id: null,
            favorites_run_id: null,
            following_run_id: null,
            algorithm_version: algorithm,
            prompt_version: prompt,
            model,
            input_hash: null,
            failure_stage: null,
            error_message: null,
            timings_json: '{}',
            started_at: startedAt,
            completed_at: null,
            created_at: createdAt,
            updated_at: updatedAt,
          });
          return { success: true };
        }
        if (sql.includes("SET status = 'BUILDING'")) {
          const [favorites, following, inputHash, updatedAt, id, userId] = bindings;
          const row = builds.get(String(id));
          if (row && row.user_id === userId)
            Object.assign(row, {
              status: 'BUILDING',
              favorites_run_id: favorites,
              following_run_id: following,
              input_hash: inputHash,
              failure_stage: null,
              error_message: null,
              completed_at: null,
              updated_at: updatedAt,
            });
          return { success: true };
        }
        if (sql.includes("SET status = 'VALIDATING'")) {
          const [timings, updatedAt, id] = bindings;
          Object.assign(builds.get(String(id))!, {
            status: 'VALIDATING',
            timings_json: timings,
            updated_at: updatedAt,
          });
          return { success: true };
        }
        if (sql.includes('INSERT INTO people_daily_editions')) {
          const [
            id,
            userId,
            editionDate,
            revision,
            schemaVersion,
            artifactKey,
            contentHash,
            favoritesRunId,
            followingRunId,
            membershipSnapshotId,
            algorithmVersion,
            promptVersion,
            model,
            coverageStatus,
            warningsJson,
            countsJson,
            timingsJson,
            builtAt,
            publishedAt,
            createdAt,
          ] = bindings;
          editions.set(String(id), {
            id,
            user_id: userId,
            edition_date: editionDate,
            revision,
            status: 'PUBLISHED',
            schema_version: schemaVersion,
            artifact_key: artifactKey,
            content_hash: contentHash,
            favorites_run_id: favoritesRunId,
            following_run_id: followingRunId,
            membership_snapshot_id: membershipSnapshotId,
            algorithm_version: algorithmVersion,
            prompt_version: promptVersion,
            model,
            coverage_status: coverageStatus,
            warnings_json: warningsJson,
            counts_json: countsJson,
            timings_json: timingsJson,
            built_at: builtAt,
            published_at: publishedAt,
            created_at: createdAt,
          });
          return { success: true };
        }
        if (sql.includes('INSERT INTO people_daily_active_editions')) {
          active.set(String(bindings[0]), String(bindings[1]));
          return { success: true };
        }
        if (sql.includes("SET status = 'PUBLISHED'")) {
          const [editionId, timings, completedAt, updatedAt, id] =
            bindings.length === 6
              ? bindings
              : [
                  bindings[0],
                  builds.get(String(bindings[3]))?.timings_json,
                  bindings[1],
                  bindings[2],
                  bindings[3],
                ];
          Object.assign(builds.get(String(id))!, {
            status: 'PUBLISHED',
            edition_id: editionId,
            timings_json: timings,
            completed_at: completedAt,
            updated_at: updatedAt,
          });
          return { success: true };
        }
        if (sql.includes("SET status = 'FAILED'")) {
          const [failureStage, errorMessage, completedAt, updatedAt, id] = bindings;
          Object.assign(builds.get(String(id))!, {
            status: 'FAILED',
            failure_stage: failureStage,
            error_message: errorMessage,
            completed_at: completedAt,
            updated_at: updatedAt,
          });
          return { success: true };
        }
        throw new Error(`Unexpected mutation: ${sql}`);
      },
    };
  };

  const db = {
    prepare: statement,
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      return Promise.all(statements.map((value) => value.run()));
    },
  } as unknown as D1Database;
  const bucket = {
    async put(key: string, value: string) {
      if (options.failUpload) throw new Error('R2 unavailable');
      objects.set(key, value);
      return {};
    },
    async get(key: string) {
      const value = objects.get(key);
      if (!value) return null;
      return { json: async () => JSON.parse(value), text: async () => value };
    },
  } as unknown as R2Bucket;
  return { db, bucket, builds, editions, active, objects };
}

function feed() {
  return {
    schemaVersion: 3,
    variant: { id: 'people-first-v4-editorial-overview', mode: 'REVIEW' },
    date: '2026-07-26',
    timezone: 'America/Chicago',
    frozenAt: '2026-07-26T12:00:00.000Z',
    freshness: { isCurrent: true, status: 'COMPLETE', warnings: [] },
    coverage: {
      status: 'COMPLETE',
      archiveStatus: 'COMPLETE',
      selectionStatus: 'COMPLETE',
      runId: 'favorites-1',
      requestedCount: 5000,
      collectedCount: 2,
      message: 'Complete.',
    },
    sources: [],
    conversations: [],
    topicClusters: [],
    threadUnits: [
      {
        id: 'conversation:1',
        conversationId: '1',
        rootPostId: '1',
        postIds: ['1'],
        favoritePostIds: ['1'],
        followingPostIds: [],
        contextPostIds: [],
        authorKeys: ['id:a'],
        favoriteAuthorKeys: ['id:a'],
        authors: ['alice'],
        favoriteAuthors: ['alice'],
        relationshipTypes: [],
        structureStatus: 'EXACT',
        latestActivityAt: null,
        firstSourcePosition: 0,
        coverageWarnings: [],
      },
    ],
    overview: {
      version: 'daily-overview-v1',
      status: 'COMPLETE',
      model: 'model',
      frozen: true,
      inputFingerprint: 'fingerprint',
      warnings: [],
    },
    overviewSections: [
      {
        id: 'topic:1',
        title: 'A conversation',
        summary: 'People are comparing one topic.',
        source: 'GENERATED',
        representativePostIds: ['1'],
        favoriteThreadUnitIds: ['conversation:1'],
        supportingThreadUnitIds: [],
        authorKeys: ['id:a'],
        favoriteConversationCount: 1,
        supportingConversationCount: 0,
        latestActivityAt: null,
        coverageWarnings: [],
      },
    ],
    clustering: null,
    posts: [
      {
        id: '1',
        url: 'https://x.com/alice/status/1',
        text: 'Hello',
        publishedAt: null,
        observedAt: '2026-07-26T12:00:00.000Z',
        kind: 'POST',
        conversationId: '1',
        structure: null,
        author: {
          key: 'id:a',
          username: 'alice',
          name: 'Alice',
          profileUrl: null,
          profileImageUrl: null,
          verified: false,
        },
        media: [],
        links: [],
        metrics: {},
        relationships: [],
        presentation: 'POST',
        repostedBy: null,
        sourceIds: ['favorites'],
        sourcePosition: 0,
      },
    ],
    sections: {
      favoritePostIds: [],
      followingPostIds: [],
      favoriteThreadUnitIds: [],
      followingThreadUnitIds: [],
    },
    inputs: {
      favorites: { runId: 'favorites-1' },
      following: { runId: 'following-1' },
      membership: { snapshotId: 'members-1' },
    },
    generationTimingsMs: { clusteringAndEmbeddings: 800, overviewCopy: 200, total: 1200 },
  };
}

describe('People Daily editions', () => {
  beforeEach(() => mockGetDailyFeed.mockReset().mockResolvedValue(feed()));

  it('publishes an immutable artifact, atomically activates it, and makes retries idempotent', async () => {
    const { db, bucket, active, objects } = fakeResources();
    await startPeopleDailyBuild(db, 'user-1', {
      id: 'build-1',
      editionDate: '2026-07-26',
      model: 'model',
    });
    const first = await publishPeopleDailyBuild(
      db,
      {} as D1Database,
      bucket,
      'user-1',
      'build-1',
      { favoritesRunId: 'favorites-1', followingRunId: 'following-1' },
      { now: new Date('2026-07-26T13:00:00.000Z') }
    );
    expect(first.created).toBe(true);
    expect(active.get('user-1')).toBe(first.edition.id);
    expect(objects.size).toBe(1);

    const overview = await getPeopleDailyOverview(db, bucket, 'user-1');
    expect(overview).toMatchObject({ id: first.edition.id, date: '2026-07-26' });
    expect(overview?.authors).toEqual([expect.objectContaining({ username: 'alice' })]);

    const retry = await publishPeopleDailyBuild(db, {} as D1Database, bucket, 'user-1', 'build-1', {
      favoritesRunId: 'favorites-1',
      followingRunId: 'following-1',
    });
    expect(retry.created).toBe(false);
    expect(retry.edition.id).toBe(first.edition.id);
    expect(mockGetDailyFeed).toHaveBeenCalledTimes(1);
  });

  it('does not create or activate an edition when artifact upload fails', async () => {
    const { db, bucket, builds, editions, active } = fakeResources({ failUpload: true });
    await startPeopleDailyBuild(db, 'user-1', {
      id: 'build-failed',
      editionDate: '2026-07-26',
      model: 'model',
    });
    await expect(
      publishPeopleDailyBuild(db, {} as D1Database, bucket, 'user-1', 'build-failed', {
        favoritesRunId: 'favorites-1',
        followingRunId: 'following-1',
      })
    ).rejects.toThrow('R2 unavailable');
    expect(builds.get('build-failed')).toMatchObject({ status: 'FAILED', failure_stage: 'UPLOAD' });
    expect(editions.size).toBe(0);
    expect(active.size).toBe(0);
  });

  it('rejects an edition that repeats a conversation across categories', async () => {
    const { db, bucket, editions, active } = fakeResources();
    const repeated = feed();
    repeated.overviewSections.push({
      ...repeated.overviewSections[0],
      id: 'topic:2',
      title: 'A repeated conversation',
    });
    mockGetDailyFeed.mockResolvedValueOnce(repeated);

    await startPeopleDailyBuild(db, 'user-1', {
      id: 'build-repeated',
      editionDate: '2026-07-26',
    });
    await expect(
      publishPeopleDailyBuild(db, {} as D1Database, bucket, 'user-1', 'build-repeated', {
        favoritesRunId: 'favorites-1',
        followingRunId: 'following-1',
      })
    ).rejects.toThrow('Thread unit conversation:1 is repeated in sections topic:1 and topic:2');
    expect(editions.size).toBe(0);
    expect(active.size).toBe(0);
  });

  it('lists immutable history and reactivates a validated prior artifact', async () => {
    const { db, bucket, active } = fakeResources();
    await startPeopleDailyBuild(db, 'user-1', {
      id: 'build-rollback',
      editionDate: '2026-07-26',
    });
    const published = await publishPeopleDailyBuild(
      db,
      {} as D1Database,
      bucket,
      'user-1',
      'build-rollback',
      { favoritesRunId: 'favorites-1', followingRunId: 'following-1' }
    );

    const history = await listPeopleDailyEditions(db, 'user-1');
    expect(history.activeEditionId).toBe(published.edition.id);
    expect(history.editions).toHaveLength(1);

    active.set('user-1', 'different-edition');
    const activated = await activatePeopleDailyEdition(
      db,
      bucket,
      'user-1',
      published.edition.id,
      Date.parse('2026-07-26T15:00:00.000Z')
    );
    expect(activated.edition.id).toBe(published.edition.id);
    expect(active.get('user-1')).toBe(published.edition.id);
  });
});
