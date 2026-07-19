import { describe, expect, it } from 'vitest';
import type { SourceReference } from '@zine/editorial-schema';

import { getEditorialToday } from './editorial-today';

const CURRENT_DATE = '2026-07-18';
const NOW = new Date('2026-07-18T14:00:00.000Z');

function edition(editionDate = CURRENT_DATE) {
  const through = `${editionDate}T12:00:00.000Z`;
  const cited = { text: 'Supported.', claimIds: ['claim-1'] };
  const source: SourceReference = {
    id: 'source-1',
    origin: 'ZINE',
    role: 'REPORTING',
    canonicalUrl: 'https://example.com/agents',
    title: 'Original title',
    creator: 'Original creator',
    publisher: 'Example',
    publishedAt: through,
    xTweetId: null,
    zineItemId: 'item-1',
    zineUserItemId: 'user-item-1',
    contentType: 'ARTICLE',
    userState: 'BOOKMARKED',
  };
  return {
    schemaVersion: 1,
    id: `edition-${editionDate}`,
    userId: 'user-1',
    editionDate,
    timezone: 'America/Chicago',
    revision: 1,
    status: 'PUBLISHED',
    generatedAt: through,
    window: {
      newContentAfter: '2026-07-17T12:00:00.000Z',
      through,
      comparisonAfter: '2026-07-11T12:00:00.000Z',
      previousEditionId: null,
      fallbackWindowUsed: true,
    },
    provenance: {
      xRunIds: ['run-1'],
      inputCounts: {
        xTimelineEntries: 1,
        xCanonicalPosts: 1,
        inboxItems: 0,
        recentBookmarks: 1,
        contextualBookmarks: 0,
        externalVerificationSources: 0,
      },
      sourceStatus: {
        xArchive: 'COMPLETE',
        zineInbox: 'COMPLETE',
        zineBookmarks: 'PARTIAL',
        externalVerification: 'NOT_RUN',
      },
      snapshotKey: 'snapshot.json',
      warnings: ['Bookmark context was partial.'],
    },
    headline: 'Today in agents',
    dek: 'The useful part of yesterday.',
    briefing: [cited],
    stories: [
      {
        id: 'story-1',
        rank: 1,
        type: 'CONVERSATION',
        lifecycle: 'DEVELOPING',
        title: 'Browser agents',
        lede: cited,
        whatHappened: cited,
        whyItMatters: cited,
        conversation: cited,
        editorialAnalysis: cited,
        importance: 4,
        momentum: 'HIGH',
        topics: ['agents'],
        entities: [],
        sourceIds: ['source-1'],
        claimIds: ['claim-1'],
      },
    ],
    recommendations: [],
    emergingSignals: [],
    bigPicture: cited,
    coverageNotes: [],
    sources: [source],
    claims: [
      {
        id: 'claim-1',
        text: 'Supported.',
        classification: 'OPINION',
        confidence: 'MEDIUM',
        sourceIds: ['source-1'],
        verification: 'SINGLE_SOURCE',
      },
    ],
    generation: {
      workflowVersion: '1',
      promptVersion: '1',
      model: 'test',
      generatorRunId: 'generator-1',
    },
    quality: {
      scores: {
        groundingAndTrust: 4,
        editorialJudgment: 4,
        synthesis: 4,
        personalUtility: 4,
        noveltyAndMomentum: 4,
        clarityAndEconomy: 4,
      },
      overallScore: 80,
      passed: true,
      notes: [],
    },
  };
}

function fakeResources(input: {
  issue?: ReturnType<typeof edition> | null;
  runStatus?: string | null;
  runError?: string | null;
  runStage?: string | null;
  sourceRows?: Array<Record<string, unknown>>;
}) {
  const issue = input.issue ?? null;
  const editionRow = issue
    ? {
        id: issue.id,
        user_id: issue.userId,
        edition_date: issue.editionDate,
        revision: 1,
        status: 'PUBLISHED',
        schema_version: 1,
        headline: issue.headline,
        window_start_at: Date.parse(issue.window.newContentAfter),
        window_end_at: Date.parse(issue.window.through),
        edition_key: 'edition.json',
        markdown_key: 'edition.md',
        snapshot_key: 'snapshot.json',
        validation_key: 'validation.json',
        content_hash: 'hash',
        quality_score: 80,
        created_at: Date.parse(issue.generatedAt),
        updated_at: Date.parse(issue.generatedAt),
      }
    : null;

  const db = {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bindings = values;
          return this;
        },
        async first() {
          if (sql.includes('FROM daily_editions')) return editionRow;
          if (sql.includes('FROM editorial_runs')) {
            return input.runStatus
              ? {
                  id: 'run-today',
                  status: input.runStatus,
                  edition_id: null,
                  edition_date: CURRENT_DATE,
                  failure_stage: input.runStage ?? null,
                  error_message: input.runError ?? null,
                  updated_at: NOW.getTime(),
                }
              : null;
          }
          throw new Error(`Unexpected first query: ${sql} ${bindings.join(',')}`);
        },
        async all() {
          if (sql.includes('FROM items i')) {
            const sourceRows = input.sourceRows ?? [
              {
                item_id: 'item-1',
                canonical_url: 'https://example.com/agents',
                title: 'Current item title',
                thumbnail_url: 'https://example.com/image.jpg',
                provider: 'WEB',
                summary: 'Current item summary.',
                creator_name: 'Current creator',
                publisher: 'Example',
                user_item_id: 'user-item-1',
                state: 'BOOKMARKED',
                is_finished: 1,
              },
            ];
            const identityBindings = new Set(bindings.slice(1));
            const identityField = sql.includes('i.canonical_url IN') ? 'canonical_url' : 'item_id';
            return {
              results: sourceRows.filter((row) => identityBindings.has(row[identityField])),
            };
          }
          throw new Error(`Unexpected all query: ${sql}`);
        },
      };
    },
  } as unknown as D1Database;
  const bucket = {
    async get() {
      return issue ? { json: async () => issue } : null;
    },
  } as unknown as R2Bucket;
  return { db, bucket };
}

describe('getEditorialToday', () => {
  it('returns a current issue with live source presentation state', async () => {
    const { db, bucket } = fakeResources({ issue: edition() });
    const result = await getEditorialToday(db, bucket, 'user-1', NOW);

    expect(result.expectedEditionDate).toBe(CURRENT_DATE);
    expect(result.generation).toEqual({
      status: 'PUBLISHED',
      latestEditionId: `edition-${CURRENT_DATE}`,
      message: null,
    });
    expect(result.freshness).toMatchObject({
      isCurrent: true,
      warnings: ['Bookmark context was partial.'],
    });
    expect(result.presentation.sources['source-1']).toEqual({
      title: 'Current item title',
      subtitle: 'Current creator',
      imageUrl: 'https://example.com/image.jpg',
      provider: 'WEB',
      excerpt: 'Current item summary.',
      zineUserItemId: 'user-item-1',
      zineItemId: 'item-1',
      isSaved: true,
      isFinished: true,
    });
  });

  it('returns the latest issue as stale when today has not published', async () => {
    const { db, bucket } = fakeResources({ issue: edition('2026-07-17'), runStatus: 'PREPARING' });
    const result = await getEditorialToday(db, bucket, 'user-1', NOW);

    expect(result.issue?.editionDate).toBe('2026-07-17');
    expect(result.generation.status).toBe('STALE');
    expect(result.freshness.isCurrent).toBe(false);
  });

  it('hydrates a saved X source by canonical URL when the edition has no Zine item ID', async () => {
    const issue = edition();
    issue.sources[0] = {
      ...issue.sources[0],
      origin: 'X',
      canonicalUrl: 'https://twitter.com/example/status/123?ref_src=twsrc%5Etfw',
      xTweetId: '123',
      zineItemId: null,
      zineUserItemId: null,
      userState: null,
    };
    const { db, bucket } = fakeResources({
      issue,
      sourceRows: [
        {
          item_id: 'saved-x-item',
          canonical_url: 'https://x.com/example/status/123',
          title: 'Live saved post title',
          thumbnail_url: 'https://example.com/x-image.jpg',
          provider: 'X',
          summary: 'Live saved post summary.',
          creator_name: 'Example',
          publisher: 'X',
          user_item_id: 'saved-x-user-item',
          state: 'BOOKMARKED',
          is_finished: 0,
        },
      ],
    });

    const result = await getEditorialToday(db, bucket, 'user-1', NOW);

    expect(result.presentation.sources['source-1']).toEqual({
      title: 'Live saved post title',
      subtitle: 'Example',
      imageUrl: 'https://example.com/x-image.jpg',
      provider: 'X',
      excerpt: 'Live saved post summary.',
      zineUserItemId: 'saved-x-user-item',
      zineItemId: 'saved-x-item',
      isSaved: true,
      isFinished: false,
    });
  });

  it('clears stale saved navigation state when a Zine user item was removed', async () => {
    const { db, bucket } = fakeResources({
      issue: edition(),
      sourceRows: [
        {
          item_id: 'item-1',
          canonical_url: 'https://example.com/agents',
          title: 'Current item title',
          thumbnail_url: null,
          provider: 'WEB',
          summary: null,
          creator_name: null,
          publisher: 'Example',
          user_item_id: null,
          state: null,
          is_finished: null,
        },
      ],
    });

    const result = await getEditorialToday(db, bucket, 'user-1', NOW);

    expect(result.presentation.sources['source-1']).toMatchObject({
      zineItemId: 'item-1',
      zineUserItemId: null,
      isSaved: false,
      isFinished: false,
    });
  });

  it('returns a nullable preparing state before the first edition', async () => {
    const { db, bucket } = fakeResources({ issue: null, runStatus: 'PREPARING' });
    const result = await getEditorialToday(db, bucket, 'user-1', NOW);

    expect(result).toMatchObject({
      issue: null,
      expectedEditionDate: CURRENT_DATE,
      generation: { status: 'PREPARING', latestEditionId: null },
      freshness: { isCurrent: false, sourceStatus: null, warnings: [] },
      presentation: { sources: {} },
    });
  });

  it('reports a failed current run accurately while serving the stale issue', async () => {
    const { db, bucket } = fakeResources({
      issue: edition('2026-07-17'),
      runStatus: 'FAILED',
      runStage: 'VALIDATE',
      runError: 'Grounding threshold failed.',
    });
    const result = await getEditorialToday(db, bucket, 'user-1', NOW);

    expect(result.generation.status).toBe('STALE');
    expect(result.generation.message).toContain('failed during validate');
    expect(result.generation.message).toContain('Grounding threshold failed.');
  });

  it('falls back safely when a legacy edition contains an invalid timezone', async () => {
    const issue = edition();
    issue.timezone = 'Chicago';
    const { db, bucket } = fakeResources({ issue });
    const result = await getEditorialToday(db, bucket, 'user-1', NOW);

    expect(result.expectedEditionDate).toBe(CURRENT_DATE);
    expect(result.freshness.warnings).toContain(
      'Edition timezone Chicago is invalid; freshness uses America/Chicago.'
    );
  });
});
