import { describe, expect, it, vi } from 'vitest';

import { buildDailyOverview } from './daily-overview';
import type { DailyThreadUnit, DailyTopicCluster, DailyTopicPost } from './daily-topic-clustering';

function post(id: string, username: string, text: string): DailyTopicPost {
  return {
    id,
    text,
    publishedAt: '2026-07-26T12:00:00.000Z',
    observedAt: '2026-07-26T12:01:00.000Z',
    kind: 'POST',
    conversationId: id,
    structure: { status: 'EXACT', source: 'X_WEB_GRAPHQL_LIST' },
    author: { key: `id:${username}`, username, name: username.toLocaleUpperCase() },
    relationships: [],
    links: [],
    sourcePosition: 0,
  };
}

function unit(postValue: DailyTopicPost): DailyThreadUnit {
  return {
    id: `conversation:${postValue.id}`,
    conversationId: postValue.id,
    rootPostId: postValue.id,
    postIds: [postValue.id],
    favoritePostIds: [postValue.id],
    followingPostIds: [],
    contextPostIds: [],
    authorKeys: [postValue.author.key],
    favoriteAuthorKeys: [postValue.author.key],
    authors: [postValue.author.username],
    favoriteAuthors: [postValue.author.username],
    relationshipTypes: [],
    structureStatus: 'EXACT',
    latestActivityAt: postValue.publishedAt,
    firstSourcePosition: 0,
    coverageWarnings: [],
  };
}

const posts = [
  post('one', 'alice', 'Open-weight models should remain widely available.'),
  post('two', 'bob', 'The new open-weight letter focuses on distribution and research access.'),
];
const units = posts.map(unit);
const cluster: DailyTopicCluster = {
  id: 'topic:open-weight',
  label: 'open weight · models',
  labelSource: 'EXTRACTED_PHRASE',
  labelTerms: ['open weight', 'models'],
  evidence: 'Two conversations share explicit evidence.',
  evidenceSignals: [],
  threadUnitIds: units.map((value) => value.id),
  favoriteThreadUnitIds: units.map((value) => value.id),
  supportingThreadUnitIds: [],
  postIds: posts.map((value) => value.id),
  favoritePostIds: posts.map((value) => value.id),
  contextPostIds: [],
  favoriteAuthors: ['alice', 'bob'],
  supportingAuthors: [],
  score: 250,
  latestActivityAt: '2026-07-26T12:00:00.000Z',
  coverageWarnings: [],
};

function cacheDb() {
  let stored: { sections_json: string; model: string | null } | null = null;
  const db = {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bindings = values;
          return this;
        },
        async first() {
          return sql.includes('SELECT sections_json') ? stored : null;
        },
        async run() {
          if (sql.includes('INSERT OR IGNORE')) {
            stored ??= {
              model: String(bindings[6]),
              sections_json: String(bindings[7]),
            };
          }
          return { success: true };
        },
      };
    },
  } as unknown as D1Database;
  return { db, getStored: () => stored };
}

describe('daily editorial overview', () => {
  it('lets generated copy describe a cluster without changing its evidence membership', async () => {
    const cache = cacheDb();
    const ai = {
      run: vi.fn(async (_model: string, _input: unknown) => ({
        response: JSON.stringify({
          sections: [
            {
              id: cluster.id,
              title: 'The open-weight access debate',
              summary:
                'Two voices focus on how open-weight models should be distributed and kept available for research.',
            },
          ],
        }),
      })),
    };

    const result = await buildDailyOverview({
      db: cache.db,
      userId: 'user-1',
      date: '2026-07-26',
      favoritesRunId: 'favorites-run',
      followingRunId: 'following-run',
      clusters: [cluster],
      threadUnits: units,
      posts,
      ai,
      model: 'overview-model',
    });

    expect(result.overview).toMatchObject({
      status: 'COMPLETE',
      model: 'overview-model',
      frozen: true,
    });
    expect(result.overviewSections).toEqual([
      expect.objectContaining({
        id: cluster.id,
        title: 'The open-weight access debate',
        source: 'GENERATED',
        representativePostIds: ['one', 'two'],
        favoriteThreadUnitIds: units.map((value) => value.id),
        supportingThreadUnitIds: [],
      }),
    ]);
    expect(cache.getStored()).not.toBeNull();
    expect(ai.run.mock.calls[0]?.[1]).toMatchObject({
      response_format: { type: 'json_object' },
    });
  });

  it('reads the immutable generated copy for the same input fingerprint', async () => {
    const cache = cacheDb();
    const firstAi = {
      run: vi.fn(async () => ({
        response: JSON.stringify({
          sections: [
            {
              id: cluster.id,
              title: 'Open weights and access',
              summary: 'The conversation centers on distribution and research access.',
            },
          ],
        }),
      })),
    };
    const input = {
      db: cache.db,
      userId: 'user-1',
      date: '2026-07-26',
      favoritesRunId: 'favorites-run',
      followingRunId: 'following-run',
      clusters: [cluster],
      threadUnits: units,
      posts,
    };
    const first = await buildDailyOverview({ ...input, ai: firstAi, model: 'overview-model' });
    const secondAi = { run: vi.fn(async () => Promise.reject(new Error('must not run'))) };
    const second = await buildDailyOverview({ ...input, ai: secondAi, model: 'new-model' });

    expect(secondAi.run).not.toHaveBeenCalled();
    expect(second.overview.model).toBe('overview-model');
    expect(second.overviewSections).toEqual(first.overviewSections);
  });

  it('accepts Workers AI JSON mode object responses', async () => {
    const cache = cacheDb();
    const result = await buildDailyOverview({
      db: cache.db,
      userId: 'user-1',
      date: '2026-07-26',
      favoritesRunId: 'favorites-run',
      followingRunId: 'following-run',
      clusters: [cluster],
      threadUnits: units,
      posts,
      ai: {
        run: vi.fn(async () => ({
          response: {
            sections: [
              {
                id: cluster.id,
                title: 'Open weights and access',
                summary: 'The conversation centers on distribution and research access.',
              },
            ],
          },
        })),
      },
    });

    expect(result.overview.status).toBe('COMPLETE');
    expect(result.overviewSections[0].source).toBe('GENERATED');
  });

  it('falls back to conservative evidence-derived copy without losing the section', async () => {
    const cache = cacheDb();
    const result = await buildDailyOverview({
      db: cache.db,
      userId: 'user-1',
      date: '2026-07-26',
      favoritesRunId: 'favorites-run',
      followingRunId: 'following-run',
      clusters: [cluster],
      threadUnits: units,
      posts,
      ai: null,
    });

    expect(result.overview.status).toBe('FALLBACK');
    expect(result.overviewSections[0]).toMatchObject({
      title: 'Open Weight · Models',
      source: 'EXTRACTIVE_FALLBACK',
      favoriteConversationCount: 2,
    });
    expect(result.overviewSections[0].summary).toContain('ALICE and BOB');
  });

  it('does not claim generated copy is frozen when cache retention is unavailable', async () => {
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return this;
          },
          async first() {
            return null;
          },
          async run() {
            throw new Error(`missing table for ${sql}`);
          },
        };
      },
    } as unknown as D1Database;
    const result = await buildDailyOverview({
      db,
      userId: 'user-1',
      date: '2026-07-26',
      favoritesRunId: 'favorites-run',
      followingRunId: 'following-run',
      clusters: [cluster],
      threadUnits: units,
      posts,
      ai: {
        run: vi.fn(async () => ({
          response: JSON.stringify({
            sections: [
              {
                id: cluster.id,
                title: 'Open weights and access',
                summary: 'The conversation centers on distribution and research access.',
              },
            ],
          }),
        })),
      },
    });

    expect(result.overview).toMatchObject({ status: 'PARTIAL', frozen: false });
    expect(result.overview.warnings).toEqual([
      'Editorial overview could not be retained for stable replay.',
    ]);
  });
});
