import {
  FailEditorialRunSchema,
  StartEditorialRunSchema,
  type DailyEdition,
  type FailEditorialRun,
  type StartEditorialRun,
} from '@zine/editorial-schema';

export type EditorialRunRow = {
  id: string;
  user_id: string;
  edition_date: string;
  status: 'PREPARING' | 'PUBLISHED' | 'FAILED';
  edition_id: string | null;
  snapshot_key: string | null;
  candidate_artifact_key: string | null;
  validation_key: string | null;
  workflow_version: string;
  prompt_version: string;
  model: string;
  x_run_ids_json: string;
  failure_stage: string | null;
  error_message: string | null;
  started_at: number;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
};

export type EditorialArtifactKeys = {
  snapshot: string;
  validation: string;
  candidates: string | null;
};

export class EditorialRunConflictError extends Error {}
export class EditorialRunNotFoundError extends Error {}

function publicRun(row: EditorialRunRow) {
  return {
    id: row.id,
    editionDate: row.edition_date,
    status: row.status,
    editionId: row.edition_id,
    workflowVersion: row.workflow_version,
    promptVersion: row.prompt_version,
    model: row.model,
    xRunIds: JSON.parse(row.x_run_ids_json) as string[],
    failureStage: row.failure_stage,
    errorMessage: row.error_message,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at === null ? null : new Date(row.completed_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function findRun(db: D1Database, id: string): Promise<EditorialRunRow | null> {
  return db.prepare('SELECT * FROM editorial_runs WHERE id = ?').bind(id).first<EditorialRunRow>();
}

function startIdentityMatches(row: EditorialRunRow, input: StartEditorialRun): boolean {
  return (
    row.edition_date === input.editionDate &&
    row.workflow_version === input.workflowVersion &&
    row.prompt_version === input.promptVersion &&
    row.model === input.model
  );
}

function publicationIdentityMatches(row: EditorialRunRow, edition: DailyEdition): boolean {
  return (
    row.edition_date === edition.editionDate &&
    row.workflow_version === edition.generation.workflowVersion &&
    row.prompt_version === edition.generation.promptVersion &&
    row.model === edition.generation.model
  );
}

function assertOwnedRun(row: EditorialRunRow, userId: string): void {
  if (row.user_id !== userId) {
    throw new EditorialRunConflictError('Editorial run ID is already in use');
  }
}

export async function startEditorialRun(
  db: D1Database,
  userId: string,
  rawInput: unknown,
  now = Date.now()
) {
  const input = StartEditorialRunSchema.parse(rawInput);
  const existing = await findRun(db, input.id);
  if (existing) {
    assertOwnedRun(existing, userId);
    if (!startIdentityMatches(existing, input)) {
      throw new EditorialRunConflictError('Editorial run ID contains different metadata');
    }
    return { run: publicRun(existing), created: false };
  }

  const startedAt = now;
  try {
    await db
      .prepare(
        `INSERT INTO editorial_runs
         (id, user_id, edition_date, status, edition_id, snapshot_key, candidate_artifact_key,
          validation_key, workflow_version, prompt_version, model, x_run_ids_json, failure_stage,
          error_message, started_at, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, 'PREPARING', NULL, NULL, NULL, NULL, ?, ?, ?, '[]', NULL, NULL,
          ?, NULL, ?, ?)`
      )
      .bind(
        input.id,
        userId,
        input.editionDate,
        input.workflowVersion,
        input.promptVersion,
        input.model,
        startedAt,
        now,
        now
      )
      .run();
  } catch (error) {
    const raced = await findRun(db, input.id);
    if (!raced) throw error;
    assertOwnedRun(raced, userId);
    if (!startIdentityMatches(raced, input)) {
      throw new EditorialRunConflictError('Editorial run ID contains different metadata');
    }
    return { run: publicRun(raced), created: false };
  }

  const created = await findRun(db, input.id);
  if (!created) throw new Error('Editorial run insert did not produce a readable row');
  return { run: publicRun(created), created: true };
}

function failureIdentityMatches(row: EditorialRunRow, input: FailEditorialRun): boolean {
  return row.failure_stage === input.stage && row.error_message === input.message;
}

export async function failEditorialRun(
  db: D1Database,
  userId: string,
  id: string,
  rawInput: unknown,
  now = Date.now()
) {
  const input = FailEditorialRunSchema.parse(rawInput);
  const existing = await findRun(db, id);
  if (!existing || existing.user_id !== userId) {
    throw new EditorialRunNotFoundError('Editorial run not found');
  }
  if (existing.status === 'PUBLISHED') {
    throw new EditorialRunConflictError('A published editorial run cannot be marked failed');
  }
  if (existing.status === 'FAILED') {
    if (!failureIdentityMatches(existing, input)) {
      throw new EditorialRunConflictError('Editorial run already contains a different failure');
    }
    return { run: publicRun(existing), duplicate: true };
  }

  const completedAt = now;
  const transition = await db
    .prepare(
      `UPDATE editorial_runs SET status = 'FAILED', failure_stage = ?, error_message = ?,
       completed_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND status = 'PREPARING'`
    )
    .bind(input.stage, input.message, completedAt, now, id, userId)
    .run();

  const failed = await findRun(db, id);
  if (!failed || failed.user_id !== userId) {
    throw new EditorialRunNotFoundError('Editorial run not found');
  }
  if (failed.status === 'PUBLISHED') {
    throw new EditorialRunConflictError('A published editorial run cannot be marked failed');
  }
  if (!failureIdentityMatches(failed, input)) {
    throw new EditorialRunConflictError('Editorial run already contains a different failure');
  }
  return { run: publicRun(failed), duplicate: (transition.meta.changes ?? 0) === 0 };
}

export async function assertEditorialRunCanPublish(
  db: D1Database,
  userId: string,
  edition: DailyEdition
): Promise<void> {
  const existing = await findRun(db, edition.generation.generatorRunId);
  if (!existing) return;
  assertOwnedRun(existing, userId);
  if (!publicationIdentityMatches(existing, edition)) {
    throw new EditorialRunConflictError('Editorial run metadata does not match the edition');
  }
  if (existing.status === 'PUBLISHED' && existing.edition_id !== edition.id) {
    throw new EditorialRunConflictError('Editorial run is already attached to another edition');
  }
}

export async function completeEditorialRun(
  db: D1Database,
  userId: string,
  edition: DailyEdition,
  keys: EditorialArtifactKeys,
  now: number,
  options: { allowCandidateBackfill?: boolean } = {}
): Promise<void> {
  const id = edition.generation.generatorRunId;
  let existing = await findRun(db, id);
  if (!existing) {
    try {
      await db
        .prepare(
          `INSERT INTO editorial_runs
           (id, user_id, edition_date, status, edition_id, snapshot_key, candidate_artifact_key,
            validation_key, workflow_version, prompt_version, model, x_run_ids_json, failure_stage,
            error_message, started_at, completed_at, created_at, updated_at)
           VALUES (?, ?, ?, 'PUBLISHED', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`
        )
        .bind(
          id,
          userId,
          edition.editionDate,
          edition.id,
          keys.snapshot,
          keys.candidates,
          keys.validation,
          edition.generation.workflowVersion,
          edition.generation.promptVersion,
          edition.generation.model,
          JSON.stringify(edition.provenance.xRunIds),
          Date.parse(edition.generatedAt),
          now,
          now,
          now
        )
        .run();
      return;
    } catch (error) {
      existing = await findRun(db, id);
      if (!existing) throw error;
    }
  }

  assertOwnedRun(existing, userId);
  if (!publicationIdentityMatches(existing, edition)) {
    throw new EditorialRunConflictError('Editorial run metadata does not match the edition');
  }

  if (existing.status !== 'PUBLISHED') {
    const transition = await db
      .prepare(
        `UPDATE editorial_runs SET status = 'PUBLISHED', edition_id = ?, snapshot_key = ?,
         candidate_artifact_key = ?, validation_key = ?, workflow_version = ?,
         prompt_version = ?, model = ?, x_run_ids_json = ?, failure_stage = NULL,
         error_message = NULL, completed_at = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND status IN ('PREPARING', 'FAILED')`
      )
      .bind(
        edition.id,
        keys.snapshot,
        keys.candidates,
        keys.validation,
        edition.generation.workflowVersion,
        edition.generation.promptVersion,
        edition.generation.model,
        JSON.stringify(edition.provenance.xRunIds),
        now,
        now,
        id,
        userId
      )
      .run();
    if ((transition.meta.changes ?? 0) > 0) return;

    existing = await findRun(db, id);
    if (!existing || existing.user_id !== userId) {
      throw new EditorialRunNotFoundError('Editorial run not found');
    }
    if (!publicationIdentityMatches(existing, edition)) {
      throw new EditorialRunConflictError('Editorial run metadata does not match the edition');
    }
  }

  if (existing.status !== 'PUBLISHED') {
    throw new EditorialRunConflictError('Editorial run changed before it could be published');
  }
  if (existing.edition_id !== edition.id) {
    throw new EditorialRunConflictError('Editorial run is already attached to another edition');
  }
  if (existing.snapshot_key !== keys.snapshot || existing.validation_key !== keys.validation) {
    throw new EditorialRunConflictError('Editorial run already references different artifacts');
  }
  if (
    existing.candidate_artifact_key &&
    keys.candidates &&
    existing.candidate_artifact_key !== keys.candidates
  ) {
    throw new EditorialRunConflictError(
      'Editorial run already references another candidate artifact'
    );
  }
  if (!keys.candidates || existing.candidate_artifact_key === keys.candidates) return;
  if (!options.allowCandidateBackfill) {
    throw new EditorialRunConflictError('Editorial run candidate artifact is immutable');
  }

  const backfill = await db
    .prepare(
      `UPDATE editorial_runs SET candidate_artifact_key = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND status = 'PUBLISHED' AND edition_id = ?
       AND snapshot_key = ? AND validation_key = ? AND candidate_artifact_key IS NULL`
    )
    .bind(keys.candidates, now, id, userId, edition.id, keys.snapshot, keys.validation)
    .run();
  if ((backfill.meta.changes ?? 0) > 0) return;

  const afterBackfill = await findRun(db, id);
  if (!afterBackfill || afterBackfill.user_id !== userId) {
    throw new EditorialRunNotFoundError('Editorial run not found');
  }
  if (
    afterBackfill.status === 'PUBLISHED' &&
    publicationIdentityMatches(afterBackfill, edition) &&
    afterBackfill.edition_id === edition.id &&
    afterBackfill.snapshot_key === keys.snapshot &&
    afterBackfill.validation_key === keys.validation &&
    afterBackfill.candidate_artifact_key === keys.candidates
  ) {
    return;
  }
  throw new EditorialRunConflictError('Editorial run changed before candidate backfill completed');
}
