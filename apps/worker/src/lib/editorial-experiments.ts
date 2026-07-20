import {
  AbandonEditorialExperimentSchema,
  CreateEditorialExperimentSchema,
  EditorialExperimentSchema,
  FailEditorialExperimentSchema,
  PublishEditorialEditionSchema,
  PublishEditorialExperimentVariantSchema,
  ReviewEditorialExperimentSchema,
  UpdateEditorialExperimentSchema,
  validateDailyEdition,
  type CreateEditorialExperiment,
  type EditorialExperiment,
  type EditorialExperimentPreference,
  type EditorialExperimentStatus,
  type PublishEditorialEdition,
  type PublishEditorialExperimentVariant,
  type ReviewEditorialExperiment,
  type UpdateEditorialExperiment,
} from '@zine/editorial-schema';
import { ulid } from 'ulid';

import { storeEditorialEdition } from './editorial-storage';
import { buildEditorialPresentation } from './editorial-today';
import { startEditorialRun } from './editorial-runs';

type ExperimentRow = {
  id: string;
  user_id: string;
  title: string;
  edition_date: string;
  status: EditorialExperimentStatus;
  hypothesis: string;
  change_summary: string;
  desired_outcomes_json: string;
  guardrails_json: string;
  winning_variant_id: string | null;
  promoted_edition_id: string | null;
  failure_message: string | null;
  abandonment_reason: string | null;
  locked_at: number | null;
  decided_at: number | null;
  promoted_at: number | null;
  created_at: number;
  updated_at: number;
};

type VariantRow = {
  id: string;
  experiment_id: string;
  user_id: string;
  label: 'A' | 'B';
  name: string;
  description: string;
  bundle_key: string;
  content_hash: string;
  snapshot_id: string;
  edition_id: string;
  headline: string;
  quality_score: number;
  created_at: number;
  updated_at: number;
};

type ReviewRow = {
  id: string;
  experiment_id: string;
  user_id: string;
  client_event_id: string;
  preference: EditorialExperimentPreference;
  notes: string;
  payload_hash: string;
  created_at: number;
};

export class EditorialExperimentNotFoundError extends Error {}
export class EditorialExperimentConflictError extends Error {}
export class EditorialExperimentTransitionError extends Error {}
export class EditorialExperimentValidationError extends Error {}

function safeSegment(value: string): string {
  return encodeURIComponent(value);
}

function jsonBody(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function timestamp(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function nextAction(status: EditorialExperimentStatus, variants: VariantRow[]): string {
  switch (status) {
    case 'DRAFT':
      return 'Review the experiment brief, then lock it.';
    case 'LOCKED':
    case 'BUILDING': {
      const missing = ['A', 'B'].filter(
        (label) => !variants.some((variant) => variant.label === label)
      );
      return `Generate and publish variant${missing.length === 1 ? '' : 's'} ${missing.join(' and ')}.`;
    }
    case 'READY_FOR_REVIEW':
      return 'Review both variants on the native Today page and submit a decision.';
    case 'DECIDED':
      return 'Discuss the recorded decision and explicitly promote the chosen variant.';
    case 'PROMOTED':
      return 'Verify the promoted edition through production Today readback.';
    case 'FAILED':
      return 'Inspect the retained failure message before retrying or abandoning the experiment.';
    case 'ABANDONED':
      return 'No action is required.';
  }
}

function variantSummary(row: VariantRow) {
  return {
    id: row.id,
    label: row.label,
    name: row.name,
    description: row.description,
    editionId: row.edition_id,
    headline: row.headline,
    qualityScore: row.quality_score,
    contentHash: row.content_hash,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function reviewSummary(row: ReviewRow | null) {
  return row
    ? {
        id: row.id,
        preference: row.preference,
        notes: row.notes,
        createdAt: new Date(row.created_at).toISOString(),
      }
    : null;
}

async function findExperiment(
  db: D1Database,
  userId: string,
  id: string
): Promise<ExperimentRow | null> {
  return db
    .prepare('SELECT * FROM editorial_experiments WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<ExperimentRow>();
}

async function requiredExperiment(
  db: D1Database,
  userId: string,
  id: string
): Promise<ExperimentRow> {
  const row = await findExperiment(db, userId, id);
  if (!row) throw new EditorialExperimentNotFoundError('Editorial experiment not found');
  return row;
}

async function variantsForExperiment(
  db: D1Database,
  userId: string,
  experimentId: string
): Promise<VariantRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM editorial_experiment_variants
       WHERE experiment_id = ? AND user_id = ? ORDER BY label ASC`
    )
    .bind(experimentId, userId)
    .all<VariantRow>();
  return result.results;
}

async function latestReview(
  db: D1Database,
  userId: string,
  experimentId: string
): Promise<ReviewRow | null> {
  return db
    .prepare(
      `SELECT * FROM editorial_experiment_reviews
       WHERE experiment_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`
    )
    .bind(experimentId, userId)
    .first<ReviewRow>();
}

async function publicExperiment(db: D1Database, row: ExperimentRow): Promise<EditorialExperiment> {
  const [variants, review] = await Promise.all([
    variantsForExperiment(db, row.user_id, row.id),
    latestReview(db, row.user_id, row.id),
  ]);
  return EditorialExperimentSchema.parse({
    id: row.id,
    title: row.title,
    editionDate: row.edition_date,
    status: row.status,
    hypothesis: row.hypothesis,
    changeSummary: row.change_summary,
    desiredOutcomes: parseStringArray(row.desired_outcomes_json),
    guardrails: parseStringArray(row.guardrails_json),
    variants: variants.map(variantSummary),
    latestReview: reviewSummary(review),
    winningVariantId: row.winning_variant_id,
    promotedEditionId: row.promoted_edition_id,
    failureMessage: row.failure_message,
    abandonmentReason: row.abandonment_reason,
    lockedAt: timestamp(row.locked_at),
    decidedAt: timestamp(row.decided_at),
    promotedAt: timestamp(row.promoted_at),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    nextAction: nextAction(row.status, variants),
  });
}

function createIdentity(input: CreateEditorialExperiment) {
  return JSON.stringify({
    title: input.title,
    editionDate: input.editionDate,
    hypothesis: input.hypothesis,
    changeSummary: input.changeSummary,
    desiredOutcomes: input.desiredOutcomes,
    guardrails: input.guardrails,
  });
}

function rowIdentity(row: ExperimentRow) {
  return JSON.stringify({
    title: row.title,
    editionDate: row.edition_date,
    hypothesis: row.hypothesis,
    changeSummary: row.change_summary,
    desiredOutcomes: parseStringArray(row.desired_outcomes_json),
    guardrails: parseStringArray(row.guardrails_json),
  });
}

export async function createEditorialExperiment(
  db: D1Database,
  userId: string,
  rawInput: unknown,
  now = Date.now()
) {
  const input = CreateEditorialExperimentSchema.parse(rawInput);
  const existingById = await db
    .prepare('SELECT * FROM editorial_experiments WHERE id = ?')
    .bind(input.id)
    .first<ExperimentRow>();
  if (existingById) {
    if (existingById.user_id !== userId || rowIdentity(existingById) !== createIdentity(input)) {
      throw new EditorialExperimentConflictError('Experiment ID already contains another brief');
    }
    return { experiment: await publicExperiment(db, existingById), created: false };
  }
  await db
    .prepare(
      `INSERT INTO editorial_experiments
       (id, user_id, title, edition_date, status, hypothesis, change_summary,
        desired_outcomes_json, guardrails_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.id,
      userId,
      input.title,
      input.editionDate,
      input.hypothesis,
      input.changeSummary,
      JSON.stringify(input.desiredOutcomes),
      JSON.stringify(input.guardrails),
      now,
      now
    )
    .run();
  return {
    experiment: await publicExperiment(db, await requiredExperiment(db, userId, input.id)),
    created: true,
  };
}

export async function updateEditorialExperiment(
  db: D1Database,
  userId: string,
  id: string,
  rawInput: unknown,
  now = Date.now()
) {
  const input: UpdateEditorialExperiment = UpdateEditorialExperimentSchema.parse(rawInput);
  const row = await requiredExperiment(db, userId, id);
  if (row.status !== 'DRAFT') {
    throw new EditorialExperimentTransitionError('Only a draft experiment can be edited');
  }
  const title = input.title ?? row.title;
  const hypothesis = input.hypothesis ?? row.hypothesis;
  const changeSummary = input.changeSummary ?? row.change_summary;
  const desiredOutcomes = input.desiredOutcomes ?? parseStringArray(row.desired_outcomes_json);
  const guardrails = input.guardrails ?? parseStringArray(row.guardrails_json);
  await db
    .prepare(
      `UPDATE editorial_experiments SET title = ?, hypothesis = ?, change_summary = ?,
       desired_outcomes_json = ?, guardrails_json = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND status = 'DRAFT'`
    )
    .bind(
      title,
      hypothesis,
      changeSummary,
      JSON.stringify(desiredOutcomes),
      JSON.stringify(guardrails),
      now,
      id,
      userId
    )
    .run();
  return publicExperiment(db, await requiredExperiment(db, userId, id));
}

export async function lockEditorialExperiment(
  db: D1Database,
  userId: string,
  id: string,
  now = Date.now()
) {
  const row = await requiredExperiment(db, userId, id);
  if (row.status === 'DRAFT') {
    await db
      .prepare(
        `UPDATE editorial_experiments SET status = 'LOCKED', locked_at = ?, updated_at = ?
         WHERE id = ? AND user_id = ? AND status = 'DRAFT'`
      )
      .bind(now, now, id, userId)
      .run();
  } else if (!['LOCKED', 'BUILDING', 'READY_FOR_REVIEW'].includes(row.status)) {
    throw new EditorialExperimentTransitionError(`Cannot lock an experiment in ${row.status}`);
  }
  return publicExperiment(db, await requiredExperiment(db, userId, id));
}

function validateVariantBundle(
  userId: string,
  experiment: ExperimentRow,
  input: PublishEditorialExperimentVariant
) {
  const bundle = input.bundle;
  if (bundle.edition.editionDate !== experiment.edition_date) {
    throw new EditorialExperimentValidationError(
      'Variant edition date does not match the experiment'
    );
  }
  if (bundle.edition.userId !== userId) {
    throw new EditorialExperimentValidationError(
      'Variant edition user does not match the experiment owner'
    );
  }
  if (!bundle.validation.valid || bundle.edition.status !== 'VALIDATED') {
    throw new EditorialExperimentValidationError('Only validated edition bundles can be previewed');
  }
  if (
    JSON.stringify(bundle.edition.window) !== JSON.stringify(bundle.snapshot.window) ||
    JSON.stringify(bundle.edition.provenance) !== JSON.stringify(bundle.snapshot.provenance)
  ) {
    throw new EditorialExperimentValidationError('Variant provenance does not match its snapshot');
  }
  const validation = validateDailyEdition(
    { ...bundle.edition, status: 'PUBLISHED' },
    new Date(bundle.validation.validatedAt)
  );
  if (!validation.valid || validation.overallScore === null) {
    throw new EditorialExperimentValidationError('Variant failed server-side editorial validation');
  }
  if (Math.abs((bundle.validation.overallScore ?? -1) - validation.overallScore) > 0.01) {
    throw new EditorialExperimentValidationError('Variant quality score does not match validation');
  }
}

export async function publishEditorialExperimentVariant(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
  experimentId: string,
  rawInput: unknown,
  now = Date.now()
) {
  const input = PublishEditorialExperimentVariantSchema.parse(rawInput);
  const experiment = await requiredExperiment(db, userId, experimentId);
  if (!['LOCKED', 'BUILDING', 'READY_FOR_REVIEW'].includes(experiment.status)) {
    throw new EditorialExperimentTransitionError(
      `Cannot publish a variant while the experiment is ${experiment.status}`
    );
  }
  validateVariantBundle(userId, experiment, input);
  const existingVariants = await variantsForExperiment(db, userId, experimentId);
  const otherSnapshot = existingVariants.find(
    (variant) => variant.snapshot_id !== input.bundle.snapshot.id
  );
  if (otherSnapshot) {
    throw new EditorialExperimentValidationError(
      `Variant snapshot ${input.bundle.snapshot.id} does not match the experiment's frozen snapshot ${otherSnapshot.snapshot_id}`
    );
  }
  const body = jsonBody(input.bundle);
  const contentHash = await sha256(body);
  const [existingById, existingByLabel] = await Promise.all([
    db
      .prepare('SELECT * FROM editorial_experiment_variants WHERE id = ?')
      .bind(input.id)
      .first<VariantRow>(),
    db
      .prepare(
        `SELECT * FROM editorial_experiment_variants
         WHERE experiment_id = ? AND user_id = ? AND label = ?`
      )
      .bind(experimentId, userId, input.label)
      .first<VariantRow>(),
  ]);
  const existing = existingById ?? existingByLabel;
  if (existing) {
    if (
      existing.user_id !== userId ||
      existing.experiment_id !== experimentId ||
      existing.id !== input.id ||
      existing.label !== input.label ||
      existing.content_hash !== contentHash
    ) {
      throw new EditorialExperimentConflictError(
        'Variant identity already contains another bundle'
      );
    }
    return { variant: variantSummary(existing), created: false };
  }
  const key = `editorial-experiments/users/${safeSegment(userId)}/${safeSegment(experimentId)}/${input.label}/${safeSegment(input.id)}/${contentHash}/bundle.json`;
  await bucket.put(key, body, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: { userId, experimentId, variantId: input.id, label: input.label },
  });
  try {
    await db
      .prepare(
        `INSERT INTO editorial_experiment_variants
         (id, experiment_id, user_id, label, name, description, bundle_key, content_hash,
          snapshot_id, edition_id, headline, quality_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        experimentId,
        userId,
        input.label,
        input.name,
        input.description,
        key,
        contentHash,
        input.bundle.snapshot.id,
        input.bundle.edition.id,
        input.bundle.edition.headline,
        input.bundle.validation.overallScore ?? input.bundle.edition.quality.overallScore,
        now,
        now
      )
      .run();
  } catch (error) {
    await bucket.delete(key).catch(() => undefined);
    throw error;
  }
  const variants = await variantsForExperiment(db, userId, experimentId);
  const status =
    variants.some((variant) => variant.label === 'A') &&
    variants.some((variant) => variant.label === 'B')
      ? 'READY_FOR_REVIEW'
      : 'BUILDING';
  await db
    .prepare(
      `UPDATE editorial_experiments SET status = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND status IN ('LOCKED', 'BUILDING', 'READY_FOR_REVIEW')`
    )
    .bind(status, now, experimentId, userId)
    .run();
  const row = await db
    .prepare('SELECT * FROM editorial_experiment_variants WHERE id = ? AND user_id = ?')
    .bind(input.id, userId)
    .first<VariantRow>();
  return { variant: variantSummary(row!), created: true };
}

async function requiredVariant(
  db: D1Database,
  userId: string,
  experimentId: string,
  variantId: string
): Promise<VariantRow> {
  const row = await db
    .prepare(
      `SELECT * FROM editorial_experiment_variants
       WHERE id = ? AND experiment_id = ? AND user_id = ?`
    )
    .bind(variantId, experimentId, userId)
    .first<VariantRow>();
  if (!row) throw new EditorialExperimentNotFoundError('Editorial experiment variant not found');
  return row;
}

async function loadVariantBundle(
  bucket: R2Bucket,
  row: VariantRow
): Promise<PublishEditorialEdition> {
  const object = await bucket.get(row.bundle_key);
  if (!object) throw new Error('Editorial experiment variant points to a missing bundle');
  return PublishEditorialEditionSchema.parse(await object.json());
}

export async function getEditorialExperimentVariantPreview(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
  experimentId: string,
  variantId: string
) {
  const [experiment, variant] = await Promise.all([
    requiredExperiment(db, userId, experimentId),
    requiredVariant(db, userId, experimentId, variantId),
  ]);
  const bundle = await loadVariantBundle(bucket, variant);
  const issue = bundle.edition;
  return {
    experiment: await publicExperiment(db, experiment),
    variant: variantSummary(variant),
    preview: {
      issue,
      expectedEditionDate: experiment.edition_date,
      generation: { status: 'PUBLISHED' as const, latestEditionId: issue.id, message: null },
      freshness: {
        isCurrent: true,
        sourceStatus: issue.provenance.sourceStatus,
        warnings: issue.provenance.warnings,
      },
      presentation: {
        sources: await buildEditorialPresentation(db, userId, issue),
      },
    },
  };
}

export async function reviewEditorialExperiment(
  db: D1Database,
  userId: string,
  experimentId: string,
  rawInput: unknown,
  now = Date.now()
) {
  const input: ReviewEditorialExperiment = ReviewEditorialExperimentSchema.parse(rawInput);
  const experiment = await requiredExperiment(db, userId, experimentId);
  if (!['READY_FOR_REVIEW', 'DECIDED'].includes(experiment.status)) {
    throw new EditorialExperimentTransitionError(
      `Cannot review an experiment while it is ${experiment.status}`
    );
  }
  const payloadHash = await sha256(JSON.stringify(input));
  const existing = await db
    .prepare(
      `SELECT * FROM editorial_experiment_reviews
       WHERE user_id = ? AND client_event_id = ?`
    )
    .bind(userId, input.clientEventId)
    .first<ReviewRow>();
  if (existing) {
    if (existing.experiment_id !== experimentId || existing.payload_hash !== payloadHash) {
      throw new EditorialExperimentConflictError(
        'Review event ID already contains another decision'
      );
    }
    return {
      experiment: await publicExperiment(db, experiment),
      review: reviewSummary(existing),
      duplicate: true,
    };
  }
  const variants = await variantsForExperiment(db, userId, experimentId);
  const winningVariant =
    input.preference === 'NEITHER'
      ? null
      : (variants.find((variant) => variant.label === input.preference) ?? null);
  if (input.preference !== 'NEITHER' && !winningVariant) {
    throw new EditorialExperimentValidationError(`Variant ${input.preference} is not available`);
  }
  const reviewId = ulid(now);
  await db
    .prepare(
      `INSERT INTO editorial_experiment_reviews
       (id, experiment_id, user_id, client_event_id, preference, notes, payload_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      reviewId,
      experimentId,
      userId,
      input.clientEventId,
      input.preference,
      input.notes,
      payloadHash,
      now
    )
    .run();
  await db
    .prepare(
      `UPDATE editorial_experiments SET status = 'DECIDED', winning_variant_id = ?,
       decided_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    )
    .bind(winningVariant?.id ?? null, now, now, experimentId, userId)
    .run();
  const updated = await requiredExperiment(db, userId, experimentId);
  return {
    experiment: await publicExperiment(db, updated),
    review: reviewSummary(await latestReview(db, userId, experimentId)),
    duplicate: false,
  };
}

export async function promoteEditorialExperiment(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
  experimentId: string,
  variantId: string,
  now = Date.now()
) {
  const experiment = await requiredExperiment(db, userId, experimentId);
  if (experiment.status === 'PROMOTED') {
    if (experiment.winning_variant_id !== variantId) {
      throw new EditorialExperimentConflictError('Another variant has already been promoted');
    }
    return { experiment: await publicExperiment(db, experiment), created: false };
  }
  if (experiment.status !== 'DECIDED' || experiment.winning_variant_id !== variantId) {
    throw new EditorialExperimentTransitionError(
      'Only the explicitly chosen variant can be promoted'
    );
  }
  const variant = await requiredVariant(db, userId, experimentId, variantId);
  const bundle = await loadVariantBundle(bucket, variant);
  await startEditorialRun(
    db,
    userId,
    {
      id: bundle.edition.generation.generatorRunId,
      editionDate: bundle.edition.editionDate,
      workflowVersion: bundle.edition.generation.workflowVersion,
      promptVersion: bundle.edition.generation.promptVersion,
      model: bundle.edition.generation.model,
    },
    now
  );
  const publication = await storeEditorialEdition(db, bucket, userId, bundle, now);
  await db
    .prepare(
      `UPDATE editorial_experiments SET status = 'PROMOTED', promoted_edition_id = ?,
       promoted_at = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'DECIDED'`
    )
    .bind(publication.edition.id, now, now, experimentId, userId)
    .run();
  return {
    experiment: await publicExperiment(db, await requiredExperiment(db, userId, experimentId)),
    edition: publication.edition,
    created: publication.created,
  };
}

export async function failEditorialExperiment(
  db: D1Database,
  userId: string,
  experimentId: string,
  rawInput: unknown,
  now = Date.now()
) {
  const input = FailEditorialExperimentSchema.parse(rawInput);
  const experiment = await requiredExperiment(db, userId, experimentId);
  if (experiment.status === 'FAILED' && experiment.failure_message === input.message) {
    return publicExperiment(db, experiment);
  }
  if (['PROMOTED', 'ABANDONED'].includes(experiment.status)) {
    throw new EditorialExperimentTransitionError(
      `Cannot fail an experiment while it is ${experiment.status}`
    );
  }
  await db
    .prepare(
      `UPDATE editorial_experiments SET status = 'FAILED', failure_message = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .bind(input.message, now, experimentId, userId)
    .run();
  return publicExperiment(db, await requiredExperiment(db, userId, experimentId));
}

export async function abandonEditorialExperiment(
  db: D1Database,
  userId: string,
  experimentId: string,
  rawInput: unknown,
  now = Date.now()
) {
  const input = AbandonEditorialExperimentSchema.parse(rawInput);
  const experiment = await requiredExperiment(db, userId, experimentId);
  if (experiment.status === 'ABANDONED' && experiment.abandonment_reason === input.reason) {
    return publicExperiment(db, experiment);
  }
  if (experiment.status === 'PROMOTED') {
    throw new EditorialExperimentTransitionError('A promoted experiment cannot be abandoned');
  }
  await db
    .prepare(
      `UPDATE editorial_experiments SET status = 'ABANDONED', abandonment_reason = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
    .bind(input.reason, now, experimentId, userId)
    .run();
  return publicExperiment(db, await requiredExperiment(db, userId, experimentId));
}

export async function getEditorialExperiment(db: D1Database, userId: string, id: string) {
  return publicExperiment(db, await requiredExperiment(db, userId, id));
}

export async function listEditorialExperiments(db: D1Database, userId: string, limit = 20) {
  const rows = await db
    .prepare(
      `SELECT * FROM editorial_experiments WHERE user_id = ?
       ORDER BY updated_at DESC LIMIT ?`
    )
    .bind(userId, Math.max(1, Math.min(50, limit)))
    .all<ExperimentRow>();
  return Promise.all(rows.results.map((row) => publicExperiment(db, row)));
}
