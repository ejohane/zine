import { describe, expect, it } from 'vitest';

import {
  EditorialRunConflictError,
  completeEditorialRun,
  failEditorialRun,
  startEditorialRun,
  type EditorialRunRow,
} from './editorial-runs';

function fakeDb(
  hooks: {
    beforeFailureTransition?: () => Promise<void>;
    beforePublishTransition?: () => Promise<void>;
    beforeCandidateBackfill?: () => Promise<void>;
  } = {}
) {
  const rows = new Map<string, EditorialRunRow>();
  const db = {
    prepare(sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bindings = values;
          return this;
        },
        async first() {
          if (!sql.includes('SELECT * FROM editorial_runs')) {
            throw new Error(`Unexpected query: ${sql}`);
          }
          return rows.get(String(bindings[0])) ?? null;
        },
        async run() {
          if (sql.includes("VALUES (?, ?, ?, 'PREPARING'")) {
            const [
              id,
              userId,
              editionDate,
              workflow,
              prompt,
              model,
              startedAt,
              createdAt,
              updatedAt,
            ] = bindings;
            if (rows.has(String(id))) throw new Error('UNIQUE constraint failed');
            rows.set(String(id), {
              id: String(id),
              user_id: String(userId),
              edition_date: String(editionDate),
              status: 'PREPARING',
              edition_id: null,
              snapshot_key: null,
              candidate_artifact_key: null,
              validation_key: null,
              workflow_version: String(workflow),
              prompt_version: String(prompt),
              model: String(model),
              x_run_ids_json: '[]',
              failure_stage: null,
              error_message: null,
              started_at: Number(startedAt),
              completed_at: null,
              created_at: Number(createdAt),
              updated_at: Number(updatedAt),
            });
            return { success: true, meta: { changes: 1 } };
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
            if (rows.has(String(id))) throw new Error('UNIQUE constraint failed');
            rows.set(String(id), {
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
          if (sql.includes("SET status = 'FAILED'")) {
            const [stage, message, completedAt, updatedAt, id, userId] = bindings;
            await hooks.beforeFailureTransition?.();
            const row = rows.get(String(id));
            const changed = Boolean(row && row.user_id === userId && row.status === 'PREPARING');
            if (row && changed) {
              row.status = 'FAILED';
              row.failure_stage = String(stage);
              row.error_message = String(message);
              row.completed_at = Number(completedAt);
              row.updated_at = Number(updatedAt);
            }
            return { success: true, meta: { changes: changed ? 1 : 0 } };
          }
          if (sql.includes("SET status = 'PUBLISHED'")) {
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
            await hooks.beforePublishTransition?.();
            const row = rows.get(String(id));
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
          if (sql.includes('SET candidate_artifact_key = ?')) {
            const [candidateKey, updatedAt, id, userId, editionId, snapshotKey, validationKey] =
              bindings;
            await hooks.beforeCandidateBackfill?.();
            const row = rows.get(String(id));
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
  return { db, rows };
}

const startInput = {
  id: 'run-1',
  editionDate: '2026-07-19',
  workflowVersion: 'x-led-v1',
  promptVersion: 'daily-v1',
  model: 'gpt-5.6',
};

function edition(overrides: { id?: string } = {}) {
  return {
    id: overrides.id ?? 'edition-1',
    editionDate: startInput.editionDate,
    generatedAt: '2026-07-19T12:00:00.000Z',
    generation: {
      generatorRunId: startInput.id,
      workflowVersion: startInput.workflowVersion,
      promptVersion: startInput.promptVersion,
      model: startInput.model,
    },
    provenance: { xRunIds: ['x-run-1'] },
  } as never;
}

function twoPartyBarrier() {
  let arrivals = 0;
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    arrivals += 1;
    if (arrivals === 2) release();
    await ready;
  };
}

function artifactKeys(candidates: string | null = 'candidate-key') {
  return { snapshot: 'snapshot-key', validation: 'validation-key', candidates };
}

describe('editorial run lifecycle', () => {
  it('starts once and treats identical retries as idempotent', async () => {
    const { db, rows } = fakeDb();
    const first = await startEditorialRun(db, 'user-1', startInput, 1_000);
    const retry = await startEditorialRun(db, 'user-1', startInput, 2_000);

    expect(first).toMatchObject({ created: true, run: { status: 'PREPARING' } });
    expect(retry).toMatchObject({
      created: false,
      run: { startedAt: new Date(1_000).toISOString() },
    });
    expect(rows.size).toBe(1);
  });

  it('rejects reuse of a run ID with different metadata or ownership', async () => {
    const { db } = fakeDb();
    await startEditorialRun(db, 'user-1', startInput, 1_000);

    await expect(
      startEditorialRun(db, 'user-1', { ...startInput, model: 'different' }, 2_000)
    ).rejects.toBeInstanceOf(EditorialRunConflictError);
    await expect(startEditorialRun(db, 'user-2', startInput, 2_000)).rejects.toBeInstanceOf(
      EditorialRunConflictError
    );
  });

  it('records an idempotent failure and rejects a different terminal failure', async () => {
    const { db } = fakeDb();
    await startEditorialRun(db, 'user-1', startInput, 1_000);
    const failure = { stage: 'VALIDATE', message: 'Grounding threshold failed.' } as const;

    const first = await failEditorialRun(db, 'user-1', startInput.id, failure, 2_000);
    const retry = await failEditorialRun(db, 'user-1', startInput.id, failure, 3_000);
    expect(first).toMatchObject({ duplicate: false, run: { status: 'FAILED' } });
    expect(retry).toMatchObject({ duplicate: true, run: { failureStage: 'VALIDATE' } });
    await expect(
      failEditorialRun(
        db,
        'user-1',
        startInput.id,
        { stage: 'RENDER', message: 'Different failure.' },
        4_000
      )
    ).rejects.toBeInstanceOf(EditorialRunConflictError);
  });

  it('marks the loser of identical concurrent failures as a duplicate', async () => {
    const { db } = fakeDb({ beforeFailureTransition: twoPartyBarrier() });
    await startEditorialRun(db, 'user-1', startInput, 1_000);
    const failure = { stage: 'VALIDATE', message: 'Grounding threshold failed.' } as const;

    const results = await Promise.all([
      failEditorialRun(db, 'user-1', startInput.id, failure, 2_000),
      failEditorialRun(db, 'user-1', startInput.id, failure, 3_000),
    ]);

    expect(results.map((result) => result.duplicate).sort()).toEqual([false, true]);
  });

  it('promotes a recovered failed run to the published edition', async () => {
    const { db, rows } = fakeDb();
    await startEditorialRun(db, 'user-1', startInput, 1_000);
    await failEditorialRun(
      db,
      'user-1',
      startInput.id,
      { stage: 'VALIDATE', message: 'Initial draft failed.' },
      2_000
    );

    await completeEditorialRun(
      db,
      'user-1',
      edition(),
      { snapshot: 'snapshot-key', validation: 'validation-key', candidates: 'candidate-key' },
      3_000
    );

    expect(rows.get(startInput.id)).toMatchObject({
      status: 'PUBLISHED',
      edition_id: 'edition-1',
      failure_stage: null,
      error_message: null,
      x_run_ids_json: '["x-run-1"]',
    });
  });

  it('allows identical concurrent publication retries with one conditional transition', async () => {
    const { db, rows } = fakeDb({ beforePublishTransition: twoPartyBarrier() });
    await startEditorialRun(db, 'user-1', startInput, 1_000);

    const results = await Promise.allSettled([
      completeEditorialRun(db, 'user-1', edition(), artifactKeys(), 2_000),
      completeEditorialRun(db, 'user-1', edition(), artifactKeys(), 3_000),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(rows.get(startInput.id)).toMatchObject({
      status: 'PUBLISHED',
      edition_id: 'edition-1',
      snapshot_key: 'snapshot-key',
      candidate_artifact_key: 'candidate-key',
      validation_key: 'validation-key',
    });
  });

  it('prevents concurrent editions from attaching the same generator run', async () => {
    const { db, rows } = fakeDb({ beforePublishTransition: twoPartyBarrier() });
    await startEditorialRun(db, 'user-1', startInput, 1_000);

    const results = await Promise.allSettled([
      completeEditorialRun(db, 'user-1', edition(), artifactKeys(), 2_000),
      completeEditorialRun(db, 'user-1', edition({ id: 'edition-2' }), artifactKeys(), 3_000),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: expect.any(EditorialRunConflictError) });
    expect(['edition-1', 'edition-2']).toContain(rows.get(startInput.id)?.edition_id);
  });

  it('compare-and-sets explicit candidate backfills without overwriting a concurrent winner', async () => {
    const { db, rows } = fakeDb({ beforeCandidateBackfill: twoPartyBarrier() });
    await startEditorialRun(db, 'user-1', startInput, 1_000);
    await completeEditorialRun(db, 'user-1', edition(), artifactKeys(null), 2_000);

    const results = await Promise.allSettled([
      completeEditorialRun(db, 'user-1', edition(), artifactKeys('candidate-a'), 3_000, {
        allowCandidateBackfill: true,
      }),
      completeEditorialRun(db, 'user-1', edition(), artifactKeys('candidate-b'), 4_000, {
        allowCandidateBackfill: true,
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: expect.any(EditorialRunConflictError) });
    expect(['candidate-a', 'candidate-b']).toContain(
      rows.get(startInput.id)?.candidate_artifact_key
    );
  });
});
