import { describe, expect, it } from 'vitest';
import { validateDailyEdition } from '@zine/editorial-schema';

import {
  EditorialConflictError,
  storeEditorialEdition,
  type EditorialEditionRow,
} from './editorial-storage';
import { EditorialRunConflictError, type EditorialRunRow } from './editorial-runs';

function fakeResources(
  options: {
    beforeEditionInsert?: (editions: Map<string, EditorialEditionRow>) => void;
    afterEditionInsert?: (runs: Map<string, EditorialRunRow>) => void;
  } = {}
) {
  const editions = new Map<string, EditorialEditionRow>();
  const runs = new Map<string, EditorialRunRow>();
  const objects = new Map<string, string>();

  const db = {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bindings = values;
          return this;
        },
        async first() {
          if (sql.includes('FROM daily_editions WHERE id = ?')) {
            const row = editions.get(String(bindings[0])) ?? null;
            if (sql.includes('AND user_id = ?') && row?.user_id !== bindings[1]) return null;
            return row;
          }
          if (
            sql.includes(
              'FROM daily_editions WHERE user_id = ? AND edition_date = ? AND revision = ?'
            )
          ) {
            return (
              [...editions.values()].find(
                (row) =>
                  row.user_id === bindings[0] &&
                  row.edition_date === bindings[1] &&
                  row.revision === bindings[2]
              ) ?? null
            );
          }
          if (sql.includes('SELECT * FROM editorial_runs WHERE id = ?')) {
            return runs.get(String(bindings[0])) ?? null;
          }
          if (sql.includes('SELECT candidate_artifact_key FROM editorial_runs')) {
            const row = [...runs.values()]
              .filter((run) => run.user_id === bindings[0] && run.edition_id === bindings[1])
              .sort((left, right) => right.updated_at - left.updated_at)[0];
            return row ? { candidate_artifact_key: row.candidate_artifact_key } : null;
          }
          throw new Error(`Unexpected query: ${sql}`);
        },
        async run() {
          if (sql.includes('INSERT INTO daily_editions')) {
            const [
              id,
              userId,
              editionDate,
              revision,
              schemaVersion,
              headline,
              windowStart,
              windowEnd,
              editionKey,
              markdownKey,
              snapshotKey,
              validationKey,
              contentHash,
              bundleHash,
              qualityScore,
              createdAt,
              updatedAt,
            ] = bindings;
            options.beforeEditionInsert?.(editions);
            if (
              editions.has(String(id)) ||
              [...editions.values()].some(
                (row) =>
                  row.user_id === userId &&
                  row.edition_date === editionDate &&
                  row.revision === revision
              )
            ) {
              throw new Error('UNIQUE constraint failed');
            }
            editions.set(String(id), {
              id: String(id),
              user_id: String(userId),
              edition_date: String(editionDate),
              revision: Number(revision),
              status: 'PUBLISHED',
              schema_version: Number(schemaVersion),
              headline: String(headline),
              window_start_at: Number(windowStart),
              window_end_at: Number(windowEnd),
              edition_key: String(editionKey),
              markdown_key: String(markdownKey),
              snapshot_key: String(snapshotKey),
              validation_key: String(validationKey),
              content_hash: String(contentHash),
              bundle_hash: String(bundleHash),
              quality_score: Number(qualityScore),
              created_at: Number(createdAt),
              updated_at: Number(updatedAt),
            });
            options.afterEditionInsert?.(runs);
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('DELETE FROM daily_editions')) {
            const [id, userId, contentHash, bundleHash, runUserId, editionId] = bindings;
            const row = editions.get(String(id));
            const referenced = [...runs.values()].some(
              (run) => run.user_id === runUserId && run.edition_id === editionId
            );
            const changed = Boolean(
              row &&
              row.user_id === userId &&
              row.content_hash === contentHash &&
              row.bundle_hash === bundleHash &&
              !referenced
            );
            if (changed) editions.delete(String(id));
            return { success: true, meta: { changes: changed ? 1 : 0 } };
          }
          if (sql.includes('UPDATE daily_editions SET bundle_hash')) {
            const [bundleHash, updatedAt, id, userId] = bindings;
            const row = editions.get(String(id));
            if (row && row.user_id === userId && row.bundle_hash === null) {
              row.bundle_hash = String(bundleHash);
              row.updated_at = Number(updatedAt);
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 0 } };
          }
          if (sql.includes("VALUES (?, ?, ?, 'PUBLISHED'")) {
            const [
              id,
              userId,
              editionDate,
              editionId,
              snapshotKey,
              candidateKey,
              validationKey,
              workflow,
              prompt,
              model,
              xRunIds,
              startedAt,
              completedAt,
              createdAt,
              updatedAt,
            ] = bindings;
            if (runs.has(String(id))) throw new Error('UNIQUE constraint failed');
            runs.set(String(id), {
              id: String(id),
              user_id: String(userId),
              edition_date: String(editionDate),
              status: 'PUBLISHED',
              edition_id: String(editionId),
              snapshot_key: String(snapshotKey),
              candidate_artifact_key: candidateKey === null ? null : String(candidateKey),
              validation_key: String(validationKey),
              workflow_version: String(workflow),
              prompt_version: String(prompt),
              model: String(model),
              x_run_ids_json: String(xRunIds),
              failure_stage: null,
              error_message: null,
              started_at: Number(startedAt),
              completed_at: Number(completedAt),
              created_at: Number(createdAt),
              updated_at: Number(updatedAt),
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("UPDATE editorial_runs SET status = 'PUBLISHED'")) {
            const [
              editionId,
              snapshotKey,
              candidateKey,
              validationKey,
              workflow,
              prompt,
              model,
              xRunIds,
              completedAt,
              updatedAt,
              id,
              userId,
            ] = bindings;
            const row = runs.get(String(id));
            const changed = Boolean(
              row &&
              row.user_id === userId &&
              (row.status === 'PREPARING' || row.status === 'FAILED')
            );
            if (row && changed) {
              row.status = 'PUBLISHED';
              row.edition_id = String(editionId);
              row.snapshot_key = String(snapshotKey);
              row.candidate_artifact_key = candidateKey === null ? null : String(candidateKey);
              row.validation_key = String(validationKey);
              row.workflow_version = String(workflow);
              row.prompt_version = String(prompt);
              row.model = String(model);
              row.x_run_ids_json = String(xRunIds);
              row.failure_stage = null;
              row.error_message = null;
              row.completed_at = Number(completedAt);
              row.updated_at = Number(updatedAt);
            }
            return { success: true, meta: { changes: changed ? 1 : 0 } };
          }
          if (sql.includes('UPDATE editorial_runs SET candidate_artifact_key = ?')) {
            const [candidateKey, updatedAt, id, userId, editionId, snapshotKey, validationKey] =
              bindings;
            const row = runs.get(String(id));
            const changed = Boolean(
              row &&
              row.user_id === userId &&
              row.status === 'PUBLISHED' &&
              row.edition_id === editionId &&
              row.snapshot_key === snapshotKey &&
              row.validation_key === validationKey &&
              row.candidate_artifact_key === null
            );
            if (row && changed) {
              row.candidate_artifact_key = String(candidateKey);
              row.updated_at = Number(updatedAt);
            }
            return { success: true, meta: { changes: changed ? 1 : 0 } };
          }
          throw new Error(`Unexpected mutation: ${sql}`);
        },
      };
    },
  } as unknown as D1Database;

  const bucket = {
    async put(key: string, value: string) {
      objects.set(key, value);
      return {};
    },
    async get(key: string) {
      const value = objects.get(key);
      if (value === undefined) return null;
      return {
        body: value,
        httpMetadata: { contentType: key.endsWith('.md') ? 'text/markdown' : 'application/json' },
        json: async () => JSON.parse(value),
        text: async () => value,
      };
    },
    async delete(keys: string | string[]) {
      for (const key of typeof keys === 'string' ? [keys] : keys) objects.delete(key);
    },
  } as unknown as R2Bucket;
  return { db, bucket, editions, runs, objects };
}

function bundle(overrides: { id?: string; markdown?: string; candidates?: boolean } = {}) {
  const generatedAt = '2026-07-19T12:00:00.000Z';
  const source = {
    id: 'source-1',
    origin: 'EXTERNAL',
    role: 'PRIMARY',
    canonicalUrl: 'https://example.com/source',
    title: 'Source',
    creator: null,
    publisher: 'Example',
    publishedAt: generatedAt,
    xTweetId: null,
    zineItemId: null,
    zineUserItemId: null,
    contentType: 'ARTICLE',
    userState: null,
  } as const;
  const cited = { text: 'Supported.', claimIds: ['claim-1'] };
  const provenance = {
    xRunIds: ['x-run-1'],
    inputCounts: {
      xTimelineEntries: 1,
      xCanonicalPosts: 1,
      inboxItems: 0,
      recentBookmarks: 0,
      contextualBookmarks: 0,
      externalVerificationSources: 1,
    },
    sourceStatus: {
      xArchive: 'COMPLETE',
      zineInbox: 'COMPLETE',
      zineBookmarks: 'COMPLETE',
      externalVerification: 'COMPLETE',
    },
    snapshotKey: 'snapshot-1',
    warnings: [],
  } as const;
  const window = {
    newContentAfter: '2026-07-18T12:00:00.000Z',
    through: generatedAt,
    comparisonAfter: '2026-07-12T12:00:00.000Z',
    previousEditionId: null,
    fallbackWindowUsed: true,
  };
  const edition = {
    schemaVersion: 1,
    id: overrides.id ?? 'edition-1',
    userId: 'user-1',
    editionDate: '2026-07-19',
    timezone: 'America/Chicago',
    revision: 1,
    status: 'VALIDATED',
    generatedAt,
    window,
    provenance,
    headline: 'Daily edition',
    dek: 'What matters today.',
    briefing: [cited],
    stories: [
      {
        id: 'story-1',
        rank: 1,
        type: 'NEWS',
        lifecycle: 'DEVELOPING',
        title: 'A story',
        lede: cited,
        whatHappened: cited,
        whyItMatters: cited,
        conversation: cited,
        editorialAnalysis: cited,
        importance: 4,
        momentum: 'HIGH',
        topics: ['technology'],
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
        classification: 'FACT',
        confidence: 'HIGH',
        sourceIds: ['source-1'],
        verification: 'PRIMARY_SOURCE',
      },
    ],
    generation: {
      workflowVersion: 'x-led-v1',
      promptVersion: 'daily-v1',
      model: 'gpt-5.6',
      generatorRunId: `run-${overrides.id ?? 'edition-1'}`,
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
  } as const;
  const snapshot = {
    schemaVersion: 1,
    id: 'snapshot-1',
    generatedAt,
    editionDate: edition.editionDate,
    timezone: edition.timezone,
    window,
    provenance,
    documents: [
      {
        source,
        observedAt: generatedAt,
        firstSeenAt: generatedAt,
        text: null,
        summary: null,
        timelinePosition: null,
        engagement: null,
        links: [],
        signals: {
          ingestedAt: null,
          bookmarkedAt: null,
          lastOpenedAt: null,
          isFinished: false,
          tags: [],
        },
      },
    ],
  } as const;
  const validation = validateDailyEdition(edition, new Date(generatedAt));
  return {
    edition,
    snapshot,
    validation,
    markdown: overrides.markdown ?? '# Daily edition\n',
    candidateArtifact: overrides.candidates
      ? {
          schemaVersion: 1,
          id: 'candidates-1',
          snapshotId: snapshot.id,
          editionDate: snapshot.editionDate,
          generatedAt,
          strategy: 'X_LED_V1',
          weights: {
            xConversation: 0.24,
            attention: 0.2,
            endorsement: 0.15,
            momentum: 0.1,
            novelty: 0.08,
            zineResonance: 0.15,
            sourceQuality: 0.08,
          },
          provenance,
          clusters: [],
          candidates: [],
          coverageNotes: [],
        }
      : undefined,
  };
}

describe('editorial edition storage identity', () => {
  it('uses edition- and bundle-addressed keys and rejects changed bundle content', async () => {
    const resources = fakeResources();
    const first = await storeEditorialEdition(
      resources.db,
      resources.bucket,
      'user-1',
      bundle(),
      1_000
    );
    expect(first.created).toBe(true);
    const row = resources.editions.get('edition-1')!;
    expect(row.edition_key).toMatch(
      /editorial\/users\/user-1\/2026-07-19\/r1\/edition-1\/[a-f0-9]{64}\/edition\.json$/
    );

    await expect(
      storeEditorialEdition(
        resources.db,
        resources.bucket,
        'user-1',
        bundle({ markdown: '# Changed\n' }),
        2_000
      )
    ).rejects.toBeInstanceOf(EditorialConflictError);
  });

  it('rejects another ID for the same date/revision without overwriting retained objects', async () => {
    const resources = fakeResources();
    await storeEditorialEdition(resources.db, resources.bucket, 'user-1', bundle(), 1_000);
    const before = new Map(resources.objects);

    await expect(
      storeEditorialEdition(
        resources.db,
        resources.bucket,
        'user-1',
        bundle({ id: 'edition-other' }),
        2_000
      )
    ).rejects.toBeInstanceOf(EditorialConflictError);
    expect(resources.objects).toEqual(before);
  });

  it('allows one guarded candidate backfill for a legacy core bundle', async () => {
    const resources = fakeResources();
    await storeEditorialEdition(resources.db, resources.bucket, 'user-1', bundle(), 1_000);
    resources.editions.get('edition-1')!.bundle_hash = null;

    const result = await storeEditorialEdition(
      resources.db,
      resources.bucket,
      'user-1',
      bundle({ candidates: true }),
      2_000
    );
    const run = resources.runs.get('run-edition-1')!;
    expect(result.created).toBe(false);
    expect(resources.editions.get('edition-1')!.bundle_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(run.candidate_artifact_key).toMatch(/\/[a-f0-9]{64}\/candidates\.json$/);
    expect(resources.objects.has(run.candidate_artifact_key!)).toBe(true);
  });

  it('removes its unclaimed edition bundle when another edition wins the run race', async () => {
    const resources = fakeResources({
      afterEditionInsert(runs) {
        runs.set('run-edition-1', {
          id: 'run-edition-1',
          user_id: 'user-1',
          edition_date: '2026-07-19',
          status: 'PUBLISHED',
          edition_id: 'edition-race-winner',
          snapshot_key: 'winner-snapshot',
          candidate_artifact_key: null,
          validation_key: 'winner-validation',
          workflow_version: 'x-led-v1',
          prompt_version: 'daily-v1',
          model: 'gpt-5.6',
          x_run_ids_json: '["x-run-1"]',
          failure_stage: null,
          error_message: null,
          started_at: 500,
          completed_at: 900,
          created_at: 500,
          updated_at: 900,
        });
      },
    });

    await expect(
      storeEditorialEdition(resources.db, resources.bucket, 'user-1', bundle(), 1_000)
    ).rejects.toBeInstanceOf(EditorialRunConflictError);

    expect(resources.editions.has('edition-1')).toBe(false);
    expect(resources.objects.size).toBe(0);
    expect(resources.runs.get('run-edition-1')?.edition_id).toBe('edition-race-winner');
  });

  it('removes its unindexed bundle when another edition wins the revision insert race', async () => {
    const resources = fakeResources({
      beforeEditionInsert(editions) {
        editions.set('edition-race-winner', {
          id: 'edition-race-winner',
          user_id: 'user-1',
          edition_date: '2026-07-19',
          revision: 1,
          status: 'PUBLISHED',
          schema_version: 1,
          headline: 'Winning edition',
          window_start_at: 500,
          window_end_at: 900,
          edition_key: 'winner-edition',
          markdown_key: 'winner-markdown',
          snapshot_key: 'winner-snapshot',
          validation_key: 'winner-validation',
          content_hash: 'winner-content',
          bundle_hash: 'winner-bundle',
          quality_score: 80,
          created_at: 900,
          updated_at: 900,
        });
      },
    });

    await expect(
      storeEditorialEdition(resources.db, resources.bucket, 'user-1', bundle(), 1_000)
    ).rejects.toBeInstanceOf(EditorialConflictError);

    expect(resources.editions.has('edition-1')).toBe(false);
    expect(resources.editions.has('edition-race-winner')).toBe(true);
    expect(resources.objects.size).toBe(0);
  });
});
