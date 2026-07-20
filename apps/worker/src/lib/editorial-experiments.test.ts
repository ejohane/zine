import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateDailyEdition } from '@zine/editorial-schema';

const { mockStartEditorialRun, mockStoreEditorialEdition, mockBuildEditorialPresentation } =
  vi.hoisted(() => ({
    mockStartEditorialRun: vi.fn(),
    mockStoreEditorialEdition: vi.fn(),
    mockBuildEditorialPresentation: vi.fn(),
  }));

vi.mock('./editorial-runs', () => ({ startEditorialRun: mockStartEditorialRun }));
vi.mock('./editorial-storage', () => ({ storeEditorialEdition: mockStoreEditorialEdition }));
vi.mock('./editorial-today', () => ({
  buildEditorialPresentation: mockBuildEditorialPresentation,
}));

import {
  abandonEditorialExperiment,
  createEditorialExperiment,
  failEditorialExperiment,
  getEditorialExperiment,
  getEditorialExperimentVariantPreview,
  lockEditorialExperiment,
  promoteEditorialExperiment,
  publishEditorialExperimentVariant,
  reviewEditorialExperiment,
} from './editorial-experiments';

const USER_ID = 'experiment-user-1';

type ExperimentRow = Record<string, unknown> & { id: string; user_id: string; status: string };
type VariantRow = Record<string, unknown> & {
  id: string;
  experiment_id: string;
  user_id: string;
  label: string;
};
type ReviewRow = Record<string, unknown> & {
  id: string;
  experiment_id: string;
  user_id: string;
  client_event_id: string;
  created_at: number;
};

function fakeResources() {
  const experiments = new Map<string, ExperimentRow>();
  const variants = new Map<string, VariantRow>();
  const reviews = new Map<string, ReviewRow>();
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
          if (sql.includes('FROM editorial_experiments WHERE id = ? AND user_id = ?')) {
            const row = experiments.get(String(bindings[0]));
            return row?.user_id === bindings[1] ? row : null;
          }
          if (sql.includes('FROM editorial_experiments WHERE id = ?')) {
            return experiments.get(String(bindings[0])) ?? null;
          }
          if (sql.includes('FROM editorial_experiment_reviews')) {
            if (sql.includes('client_event_id = ?')) {
              return (
                [...reviews.values()].find(
                  (row) => row.user_id === bindings[0] && row.client_event_id === bindings[1]
                ) ?? null
              );
            }
            return (
              [...reviews.values()]
                .filter((row) => row.experiment_id === bindings[0] && row.user_id === bindings[1])
                .sort((left, right) => right.created_at - left.created_at)[0] ?? null
            );
          }
          if (sql.includes('FROM editorial_experiment_variants')) {
            if (sql.includes('label = ?')) {
              return (
                [...variants.values()].find(
                  (row) =>
                    row.experiment_id === bindings[0] &&
                    row.user_id === bindings[1] &&
                    row.label === bindings[2]
                ) ?? null
              );
            }
            const row = variants.get(String(bindings[0]));
            if (!row) return null;
            if (sql.includes('experiment_id = ?') && row.experiment_id !== bindings[1]) return null;
            const userBinding = sql.includes('experiment_id = ?') ? bindings[2] : bindings[1];
            return row.user_id === userBinding ? row : null;
          }
          throw new Error(`Unexpected query: ${sql}`);
        },
        async all() {
          if (sql.includes('FROM editorial_experiment_variants')) {
            return {
              results: [...variants.values()]
                .filter((row) => row.experiment_id === bindings[0] && row.user_id === bindings[1])
                .sort((left, right) => left.label.localeCompare(right.label)),
            };
          }
          if (sql.includes('FROM editorial_experiments')) {
            return {
              results: [...experiments.values()]
                .filter((row) => row.user_id === bindings[0])
                .slice(0, Number(bindings[1])),
            };
          }
          throw new Error(`Unexpected list query: ${sql}`);
        },
        async run() {
          if (sql.includes('INSERT INTO editorial_experiments')) {
            const [
              id,
              userId,
              title,
              editionDate,
              hypothesis,
              changeSummary,
              desiredOutcomes,
              guardrails,
              createdAt,
              updatedAt,
            ] = bindings;
            experiments.set(String(id), {
              id: String(id),
              user_id: String(userId),
              title,
              edition_date: editionDate,
              status: 'DRAFT',
              hypothesis,
              change_summary: changeSummary,
              desired_outcomes_json: desiredOutcomes,
              guardrails_json: guardrails,
              winning_variant_id: null,
              promoted_edition_id: null,
              failure_message: null,
              abandonment_reason: null,
              locked_at: null,
              decided_at: null,
              promoted_at: null,
              created_at: createdAt,
              updated_at: updatedAt,
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("status = 'LOCKED'")) {
            const [lockedAt, updatedAt, id, userId] = bindings;
            const row = experiments.get(String(id));
            if (row && row.user_id === userId && row.status === 'DRAFT') {
              row.status = 'LOCKED';
              row.locked_at = lockedAt;
              row.updated_at = updatedAt;
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO editorial_experiment_variants')) {
            const [
              id,
              experimentId,
              userId,
              label,
              name,
              description,
              bundleKey,
              contentHash,
              snapshotId,
              editionId,
              headline,
              qualityScore,
              createdAt,
              updatedAt,
            ] = bindings;
            variants.set(String(id), {
              id: String(id),
              experiment_id: String(experimentId),
              user_id: String(userId),
              label: String(label),
              name,
              description,
              bundle_key: bundleKey,
              content_hash: contentHash,
              snapshot_id: snapshotId,
              edition_id: editionId,
              headline,
              quality_score: qualityScore,
              created_at: createdAt,
              updated_at: updatedAt,
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('SET status = ?, updated_at = ?')) {
            const [status, updatedAt, id, userId] = bindings;
            const row = experiments.get(String(id));
            if (row && row.user_id === userId) {
              row.status = String(status);
              row.updated_at = updatedAt;
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO editorial_experiment_reviews')) {
            const [
              id,
              experimentId,
              userId,
              clientEventId,
              preference,
              notes,
              payloadHash,
              createdAt,
            ] = bindings;
            reviews.set(String(id), {
              id: String(id),
              experiment_id: String(experimentId),
              user_id: String(userId),
              client_event_id: String(clientEventId),
              preference,
              notes,
              payload_hash: payloadHash,
              created_at: Number(createdAt),
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("SET status = 'DECIDED'")) {
            const [winningVariantId, decidedAt, updatedAt, id, userId] = bindings;
            const row = experiments.get(String(id));
            if (row && row.user_id === userId) {
              row.status = 'DECIDED';
              row.winning_variant_id = winningVariantId;
              row.decided_at = decidedAt;
              row.updated_at = updatedAt;
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("SET status = 'PROMOTED'")) {
            const [editionId, promotedAt, updatedAt, id, userId] = bindings;
            const row = experiments.get(String(id));
            if (row && row.user_id === userId && row.status === 'DECIDED') {
              row.status = 'PROMOTED';
              row.promoted_edition_id = editionId;
              row.promoted_at = promotedAt;
              row.updated_at = updatedAt;
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("SET status = 'FAILED'")) {
            const [message, updatedAt, id, userId] = bindings;
            const row = experiments.get(String(id));
            if (row && row.user_id === userId) {
              row.status = 'FAILED';
              row.failure_message = message;
              row.updated_at = updatedAt;
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("SET status = 'ABANDONED'")) {
            const [reason, updatedAt, id, userId] = bindings;
            const row = experiments.get(String(id));
            if (row && row.user_id === userId) {
              row.status = 'ABANDONED';
              row.abandonment_reason = reason;
              row.updated_at = updatedAt;
            }
            return { success: true, meta: { changes: 1 } };
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
      if (!value) return null;
      return { json: async () => JSON.parse(value), text: async () => value, body: value };
    },
    async delete(key: string) {
      objects.delete(key);
    },
  } as unknown as R2Bucket;
  return { db, bucket };
}

function bundle(id: string, headline: string, snapshotId = 'snapshot-1') {
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
    snapshotKey: snapshotId,
    warnings: [],
  } as const;
  const window = {
    newContentAfter: '2026-07-18T12:00:00.000Z',
    through: generatedAt,
    comparisonAfter: '2026-07-12T12:00:00.000Z',
    previousEditionId: null,
    fallbackWindowUsed: false,
  };
  const edition = {
    schemaVersion: 1,
    id,
    userId: USER_ID,
    editionDate: '2026-07-19',
    timezone: 'America/Chicago',
    revision: 2,
    status: 'VALIDATED',
    generatedAt,
    window,
    provenance,
    headline,
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
        topics: ['culture'],
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
      workflowVersion: 'editorial-v2',
      promptVersion: 'daily-editorial-v2',
      model: 'gpt-5.6-sol',
      generatorRunId: `run-${id}`,
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
    id: snapshotId,
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
  return {
    edition,
    snapshot,
    validation: validateDailyEdition(edition, new Date(generatedAt)),
    markdown: `# ${headline}\n`,
  };
}

describe('editorial experiment lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildEditorialPresentation.mockResolvedValue({});
    mockStartEditorialRun.mockResolvedValue({ created: true });
    mockStoreEditorialEdition.mockImplementation(async (_db, _bucket, _user, input) => ({
      edition: { id: input.edition.id },
      created: true,
    }));
  });

  it('retains previews, records a decision, and promotes only the reviewed winner', async () => {
    const { db, bucket } = fakeResources();
    const experimentId = 'experiment-breadth-1';
    await createEditorialExperiment(db, USER_ID, {
      id: experimentId,
      title: 'Breadth versus engagement',
      editionDate: '2026-07-19',
      hypothesis: 'A broader portfolio will make Today more useful.',
      changeSummary: 'Reduce the influence of raw engagement.',
      desiredOutcomes: ['A non-technology story can lead.'],
      guardrails: ['Do not weaken source verification.'],
    });
    await lockEditorialExperiment(db, USER_ID, experimentId);
    await publishEditorialExperimentVariant(db, bucket, USER_ID, experimentId, {
      id: 'variant-a',
      label: 'A',
      name: 'Control',
      description: 'Engagement-led control.',
      bundle: bundle('edition-control', 'Control headline'),
    });
    await expect(
      publishEditorialExperimentVariant(db, bucket, USER_ID, experimentId, {
        id: 'variant-b-wrong-snapshot',
        label: 'B',
        name: 'Invalid treatment',
        description: 'Built from another input snapshot.',
        bundle: bundle('edition-invalid', 'Invalid treatment', 'snapshot-2'),
      })
    ).rejects.toThrow("does not match the experiment's frozen snapshot");
    await publishEditorialExperimentVariant(db, bucket, USER_ID, experimentId, {
      id: 'variant-b',
      label: 'B',
      name: 'Breadth treatment',
      description: 'Topic-neutral portfolio treatment.',
      bundle: bundle('edition-treatment', 'Treatment headline'),
    });
    expect((await getEditorialExperiment(db, USER_ID, experimentId)).status).toBe(
      'READY_FOR_REVIEW'
    );
    expect(
      (await getEditorialExperimentVariantPreview(db, bucket, USER_ID, experimentId, 'variant-b'))
        .preview.issue.headline
    ).toBe('Treatment headline');

    await reviewEditorialExperiment(db, USER_ID, experimentId, {
      clientEventId: 'review-1',
      preference: 'B',
      notes: 'The treatment has the stronger front page.',
    });
    const promotion = await promoteEditorialExperiment(
      db,
      bucket,
      USER_ID,
      experimentId,
      'variant-b'
    );
    expect(promotion.experiment.status).toBe('PROMOTED');
    expect(promotion.experiment.promotedEditionId).toBe('edition-treatment');
    expect(mockStoreEditorialEdition).toHaveBeenCalledWith(
      db,
      bucket,
      USER_ID,
      expect.objectContaining({
        edition: expect.objectContaining({ headline: 'Treatment headline' }),
      }),
      expect.any(Number)
    );
  });

  it('retains terminal failure and abandonment history', async () => {
    const failedResources = fakeResources();
    await createEditorialExperiment(failedResources.db, USER_ID, {
      id: 'experiment-failed',
      title: 'Failed experiment',
      editionDate: '2026-07-19',
      hypothesis: 'The treatment should work.',
      changeSummary: 'Test one treatment.',
      desiredOutcomes: ['A visible improvement.'],
      guardrails: [],
    });
    const failed = await failEditorialExperiment(failedResources.db, USER_ID, 'experiment-failed', {
      message: 'Validation did not meet the locked guardrail.',
    });
    expect(failed).toMatchObject({
      status: 'FAILED',
      failureMessage: 'Validation did not meet the locked guardrail.',
    });

    const abandonedResources = fakeResources();
    await createEditorialExperiment(abandonedResources.db, USER_ID, {
      id: 'experiment-abandoned',
      title: 'Abandoned experiment',
      editionDate: '2026-07-19',
      hypothesis: 'The treatment should work.',
      changeSummary: 'Test one treatment.',
      desiredOutcomes: ['A visible improvement.'],
      guardrails: [],
    });
    const abandoned = await abandonEditorialExperiment(
      abandonedResources.db,
      USER_ID,
      'experiment-abandoned',
      { reason: 'The product question changed before review.' }
    );
    expect(abandoned).toMatchObject({
      status: 'ABANDONED',
      abandonmentReason: 'The product question changed before review.',
    });
  });
});
