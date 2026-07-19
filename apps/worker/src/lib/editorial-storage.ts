import {
  DailyEditionSchema,
  EditorialCandidateArtifactSchema,
  EditorialSnapshotSchema,
  EditorialValidationReportSchema,
  PublishEditorialEditionSchema,
  type DailyEdition,
  type EditorialCandidateArtifact,
  type EditorialSnapshot,
  type EditorialValidationReport,
  type PublishEditorialEdition,
  validateDailyEdition,
} from '@zine/editorial-schema';
import {
  EditorialRunConflictError,
  assertEditorialRunCanPublish,
  completeEditorialRun,
} from './editorial-runs';

export type EditorialEditionRow = {
  id: string;
  user_id: string;
  edition_date: string;
  revision: number;
  status: string;
  schema_version: number;
  headline: string;
  window_start_at: number;
  window_end_at: number;
  edition_key: string;
  markdown_key: string;
  snapshot_key: string;
  validation_key: string;
  content_hash: string;
  bundle_hash: string | null;
  quality_score: number;
  created_at: number;
  updated_at: number;
};

export class EditorialConflictError extends Error {}
export class EditorialValidationError extends Error {}

function safeSegment(value: string): string {
  return encodeURIComponent(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function jsonBody(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function validationIdentity(report: EditorialValidationReport) {
  return {
    valid: report.valid,
    overallScore: report.overallScore,
    errors: report.errors,
    warnings: report.warnings,
    validatorVersion: report.validatorVersion,
  };
}

async function bundleHash(input: {
  edition: DailyEdition;
  snapshot: EditorialSnapshot;
  validation: EditorialValidationReport;
  markdown: string;
  candidateArtifact?: EditorialCandidateArtifact;
}): Promise<string> {
  return sha256(
    JSON.stringify({
      edition: input.edition,
      snapshot: input.snapshot,
      validation: validationIdentity(input.validation),
      markdown: input.markdown,
      candidateArtifact: input.candidateArtifact ?? null,
    })
  );
}

async function findEditionById(db: D1Database, id: string): Promise<EditorialEditionRow | null> {
  return db
    .prepare('SELECT * FROM daily_editions WHERE id = ?')
    .bind(id)
    .first<EditorialEditionRow>();
}

async function findEditionByRevision(
  db: D1Database,
  userId: string,
  editionDate: string,
  revision: number
): Promise<EditorialEditionRow | null> {
  return db
    .prepare('SELECT * FROM daily_editions WHERE user_id = ? AND edition_date = ? AND revision = ?')
    .bind(userId, editionDate, revision)
    .first<EditorialEditionRow>();
}

async function candidateKeyForEdition(
  db: D1Database,
  userId: string,
  editionId: string
): Promise<string | null> {
  const run = await db
    .prepare(
      `SELECT candidate_artifact_key FROM editorial_runs
       WHERE user_id = ? AND edition_id = ? ORDER BY updated_at DESC LIMIT 1`
    )
    .bind(userId, editionId)
    .first<{ candidate_artifact_key: string | null }>();
  return run?.candidate_artifact_key ?? null;
}

async function requiredObject(bucket: R2Bucket, key: string): Promise<R2ObjectBody> {
  const object = await bucket.get(key);
  if (!object) throw new Error(`Editorial index points to a missing object: ${key}`);
  return object;
}

async function assertLegacyCoreBundleMatches(
  bucket: R2Bucket,
  row: EditorialEditionRow,
  edition: DailyEdition,
  snapshot: EditorialSnapshot,
  validation: EditorialValidationReport,
  markdown: string
): Promise<void> {
  const [storedEditionObject, storedSnapshotObject, storedValidationObject, storedMarkdownObject] =
    await Promise.all([
      requiredObject(bucket, row.edition_key),
      requiredObject(bucket, row.snapshot_key),
      requiredObject(bucket, row.validation_key),
      requiredObject(bucket, row.markdown_key),
    ]);
  const [storedEdition, storedSnapshot, storedValidation, storedMarkdown] = await Promise.all([
    storedEditionObject.json().then((value) => DailyEditionSchema.parse(value)),
    storedSnapshotObject.json().then((value) => EditorialSnapshotSchema.parse(value)),
    storedValidationObject.json().then((value) => EditorialValidationReportSchema.parse(value)),
    storedMarkdownObject.text(),
  ]);
  if (
    JSON.stringify(storedEdition) !== JSON.stringify(edition) ||
    JSON.stringify(storedSnapshot) !== JSON.stringify(snapshot) ||
    JSON.stringify(validationIdentity(storedValidation)) !==
      JSON.stringify(validationIdentity(validation)) ||
    storedMarkdown !== markdown
  ) {
    throw new EditorialConflictError('Edition ID already contains a different artifact bundle');
  }
}

function artifactKeys(
  userId: string,
  edition: DailyEdition,
  identityHash: string,
  hasCandidates: boolean
) {
  const prefix = `editorial/users/${safeSegment(userId)}/${edition.editionDate}/r${edition.revision}/${safeSegment(edition.id)}/${identityHash}`;
  return {
    edition: `${prefix}/edition.json`,
    markdown: `${prefix}/edition.md`,
    snapshot: `${prefix}/snapshot.json`,
    validation: `${prefix}/validation.json`,
    candidates: hasCandidates ? `${prefix}/candidates.json` : null,
  };
}

function artifactObjectKeys(keys: ReturnType<typeof artifactKeys>): string[] {
  const objectKeys = [keys.edition, keys.markdown, keys.snapshot, keys.validation];
  if (keys.candidates) objectKeys.push(keys.candidates);
  return objectKeys;
}

function publicSummary(row: EditorialEditionRow) {
  return {
    id: row.id,
    editionDate: row.edition_date,
    revision: row.revision,
    status: row.status,
    schemaVersion: row.schema_version,
    headline: row.headline,
    windowStartAt: new Date(row.window_start_at).toISOString(),
    windowEndAt: new Date(row.window_end_at).toISOString(),
    qualityScore: row.quality_score,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function storeEditorialEdition(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
  rawInput: unknown,
  now = Date.now()
) {
  const parsed = PublishEditorialEditionSchema.parse(rawInput);
  if (!parsed.validation.valid || parsed.edition.status !== 'VALIDATED') {
    throw new EditorialValidationError('Only validated editions can be published');
  }
  if (
    JSON.stringify(parsed.edition.window) !== JSON.stringify(parsed.snapshot.window) ||
    JSON.stringify(parsed.edition.provenance) !== JSON.stringify(parsed.snapshot.provenance)
  ) {
    throw new EditorialValidationError('Edition provenance does not match the supplied snapshot');
  }
  const snapshotSourceIds = new Set(
    parsed.snapshot.documents.map((document) => document.source.id)
  );
  const sourceOutsideSnapshot = parsed.edition.sources.find(
    (source) => !snapshotSourceIds.has(source.id)
  );
  if (sourceOutsideSnapshot) {
    throw new EditorialValidationError(
      `Edition source is missing from the supplied snapshot: ${sourceOutsideSnapshot.id}`
    );
  }

  const edition: DailyEdition = DailyEditionSchema.parse({
    ...parsed.edition,
    userId,
    status: 'PUBLISHED',
  });
  const serverValidation = validateDailyEdition(edition, new Date(now));
  if (!serverValidation.valid || serverValidation.overallScore === null) {
    throw new EditorialValidationError('Edition failed server-side editorial validation');
  }
  if (
    Math.abs((parsed.validation.overallScore ?? -1) - serverValidation.overallScore) > 0.01 ||
    Math.abs(edition.quality.overallScore - serverValidation.overallScore) > 0.01 ||
    !edition.quality.passed
  ) {
    throw new EditorialValidationError(
      'Edition quality assessment does not match server validation'
    );
  }
  const normalized: PublishEditorialEdition = {
    ...parsed,
    edition,
    validation: serverValidation,
  };
  const editionJson = jsonBody(edition);
  const contentHash = await sha256(editionJson);
  const identityHash = await bundleHash(normalized);
  const keys = artifactKeys(userId, edition, identityHash, Boolean(normalized.candidateArtifact));
  const metadata = { userId, editionId: edition.id, editionDate: edition.editionDate };
  await assertEditorialRunCanPublish(db, userId, edition);
  const existing = await findEditionById(db, edition.id);
  if (existing) {
    if (existing.user_id !== userId) {
      throw new EditorialConflictError('Edition ID is already in use');
    }
    if (existing.content_hash !== contentHash) {
      throw new EditorialConflictError('Edition ID already contains different content');
    }
    if (existing.bundle_hash) {
      if (existing.bundle_hash !== identityHash) {
        throw new EditorialConflictError('Edition ID already contains a different artifact bundle');
      }
      if (keys.candidates && normalized.candidateArtifact) {
        await bucket.put(keys.candidates, jsonBody(normalized.candidateArtifact), {
          httpMetadata: { contentType: 'application/json; charset=utf-8' },
          customMetadata: metadata,
        });
      }
      await completeEditorialRun(
        db,
        userId,
        edition,
        {
          snapshot: existing.snapshot_key,
          validation: existing.validation_key,
          candidates: keys.candidates,
        },
        now,
        { allowCandidateBackfill: true }
      );
      return { edition: publicSummary(existing), created: false };
    }

    await assertLegacyCoreBundleMatches(
      bucket,
      existing,
      edition,
      normalized.snapshot,
      normalized.validation,
      normalized.markdown
    );
    const existingCandidateKey = await candidateKeyForEdition(db, userId, edition.id);
    if (!normalized.candidateArtifact) {
      await completeEditorialRun(
        db,
        userId,
        edition,
        {
          snapshot: existing.snapshot_key,
          validation: existing.validation_key,
          candidates: existingCandidateKey,
        },
        now,
        { allowCandidateBackfill: true }
      );
      return { edition: publicSummary(existing), created: false };
    }

    if (existingCandidateKey) {
      const object = await requiredObject(bucket, existingCandidateKey);
      const storedCandidate = EditorialCandidateArtifactSchema.parse(await object.json());
      if (JSON.stringify(storedCandidate) !== JSON.stringify(normalized.candidateArtifact)) {
        throw new EditorialConflictError(
          'Edition ID already contains a different candidate artifact'
        );
      }
    }

    const claim = await db
      .prepare(
        'UPDATE daily_editions SET bundle_hash = ?, updated_at = ? WHERE id = ? AND user_id = ? AND bundle_hash IS NULL'
      )
      .bind(identityHash, now, edition.id, userId)
      .run();
    if ((claim.meta.changes ?? 0) === 0) {
      const raced = await findEditionById(db, edition.id);
      if (!raced || raced.user_id !== userId || raced.bundle_hash !== identityHash) {
        throw new EditorialConflictError('Edition ID already contains a different artifact bundle');
      }
    }

    const candidateKey =
      existingCandidateKey ??
      `editorial/users/${safeSegment(userId)}/${edition.editionDate}/r${edition.revision}/${safeSegment(edition.id)}/${identityHash}/candidates.json`;
    if (!existingCandidateKey) {
      await bucket.put(candidateKey, jsonBody(normalized.candidateArtifact), {
        httpMetadata: { contentType: 'application/json; charset=utf-8' },
        customMetadata: metadata,
      });
    }
    await completeEditorialRun(
      db,
      userId,
      edition,
      {
        snapshot: existing.snapshot_key,
        validation: existing.validation_key,
        candidates: candidateKey,
      },
      now,
      { allowCandidateBackfill: true }
    );
    return { edition: publicSummary(existing), created: false };
  }

  const existingRevision = await findEditionByRevision(
    db,
    userId,
    edition.editionDate,
    edition.revision
  );
  if (existingRevision) {
    throw new EditorialConflictError('Edition date and revision already contain another edition');
  }

  const writes: Promise<unknown>[] = [
    bucket.put(keys.edition, editionJson, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: metadata,
    }),
    bucket.put(keys.markdown, normalized.markdown, {
      httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
      customMetadata: metadata,
    }),
    bucket.put(keys.snapshot, jsonBody(normalized.snapshot), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: metadata,
    }),
    bucket.put(keys.validation, jsonBody(normalized.validation), {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: metadata,
    }),
  ];
  if (keys.candidates && normalized.candidateArtifact) {
    writes.push(
      bucket.put(keys.candidates, jsonBody(normalized.candidateArtifact), {
        httpMetadata: { contentType: 'application/json; charset=utf-8' },
        customMetadata: metadata,
      })
    );
  }
  await Promise.all(writes);

  try {
    await db
      .prepare(
        `INSERT INTO daily_editions
         (id, user_id, edition_date, revision, status, schema_version, headline,
          window_start_at, window_end_at, edition_key, markdown_key, snapshot_key,
          validation_key, content_hash, bundle_hash, quality_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'PUBLISHED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        edition.id,
        userId,
        edition.editionDate,
        edition.revision,
        edition.schemaVersion,
        edition.headline,
        Date.parse(edition.window.newContentAfter),
        Date.parse(edition.window.through),
        keys.edition,
        keys.markdown,
        keys.snapshot,
        keys.validation,
        contentHash,
        identityHash,
        normalized.validation.overallScore ?? 0,
        now,
        now
      )
      .run();
  } catch (error) {
    const [racedId, racedRevision] = await Promise.all([
      findEditionById(db, edition.id),
      findEditionByRevision(db, userId, edition.editionDate, edition.revision),
    ]);
    if (
      racedId?.user_id === userId &&
      racedId.bundle_hash === identityHash &&
      racedRevision?.id === edition.id
    ) {
      await completeEditorialRun(db, userId, edition, keys, now, {
        allowCandidateBackfill: true,
      });
      return { edition: publicSummary(racedId), created: false };
    }
    if (racedId || racedRevision) {
      if (!racedId || racedId.bundle_hash !== identityHash) {
        try {
          await bucket.delete(artifactObjectKeys(keys));
        } catch {
          // Preserve the edition identity conflict if best-effort orphan cleanup fails.
        }
      }
      throw new EditorialConflictError('Edition identity is already in use');
    }
    try {
      await bucket.delete(artifactObjectKeys(keys));
    } catch {
      // Preserve the database insertion error if best-effort orphan cleanup fails.
    }
    throw error;
  }

  try {
    await completeEditorialRun(db, userId, edition, keys, now);
  } catch (error) {
    if (error instanceof EditorialRunConflictError) {
      try {
        const cleanup = await db
          .prepare(
            `DELETE FROM daily_editions
             WHERE id = ? AND user_id = ? AND content_hash = ? AND bundle_hash = ?
             AND NOT EXISTS (
               SELECT 1 FROM editorial_runs
               WHERE editorial_runs.user_id = ? AND editorial_runs.edition_id = ?
             )`
          )
          .bind(edition.id, userId, contentHash, identityHash, userId, edition.id)
          .run();
        if ((cleanup.meta.changes ?? 0) > 0) {
          await bucket.delete(artifactObjectKeys(keys));
        }
      } catch {
        // Preserve the publication conflict even if best-effort orphan cleanup fails.
      }
    }
    throw error;
  }

  const created = await db
    .prepare('SELECT * FROM daily_editions WHERE id = ? AND user_id = ?')
    .bind(edition.id, userId)
    .first<EditorialEditionRow>();
  return { edition: publicSummary(created!), created: true };
}

export async function listEditorialEditions(db: D1Database, userId: string, limit = 20) {
  const rows = await db
    .prepare(
      `SELECT * FROM daily_editions WHERE user_id = ?
       ORDER BY window_end_at DESC, revision DESC LIMIT ?`
    )
    .bind(userId, Math.max(1, Math.min(50, limit)))
    .all<EditorialEditionRow>();
  return rows.results.map(publicSummary);
}

export async function getEditorialEdition(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
  id?: string
): Promise<{ edition: DailyEdition; row: EditorialEditionRow } | null> {
  const query = id
    ? db.prepare('SELECT * FROM daily_editions WHERE id = ? AND user_id = ?').bind(id, userId)
    : db
        .prepare(
          `SELECT * FROM daily_editions WHERE user_id = ?
           ORDER BY window_end_at DESC, revision DESC LIMIT 1`
        )
        .bind(userId);
  const row = await query.first<EditorialEditionRow>();
  if (!row) return null;
  const object = await bucket.get(row.edition_key);
  if (!object) throw new Error('Edition index points to a missing object');
  return { edition: DailyEditionSchema.parse(await object.json()), row };
}

export async function getEditorialArtifact(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
  id: string,
  artifact: 'markdown' | 'snapshot' | 'validation' | 'candidates'
): Promise<R2ObjectBody | null> {
  const row = await db
    .prepare('SELECT * FROM daily_editions WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<EditorialEditionRow>();
  if (!row) return null;
  if (artifact === 'candidates') {
    const candidateKey = await candidateKeyForEdition(db, userId, id);
    return candidateKey ? bucket.get(candidateKey) : null;
  }
  const key =
    artifact === 'markdown'
      ? row.markdown_key
      : artifact === 'snapshot'
        ? row.snapshot_key
        : row.validation_key;
  return bucket.get(key);
}
