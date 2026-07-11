import {
  DailyEditionSchema,
  PublishEditorialEditionSchema,
  type DailyEdition,
  type PublishEditorialEdition,
  validateDailyEdition,
} from '@zine/editorial-schema';

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
  const serverValidation = validateDailyEdition(edition);
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
  const editionJson = `${JSON.stringify(edition, null, 2)}\n`;
  const contentHash = await sha256(editionJson);
  const existing = await db
    .prepare('SELECT * FROM daily_editions WHERE id = ? AND user_id = ?')
    .bind(edition.id, userId)
    .first<EditorialEditionRow>();
  if (existing) {
    if (existing.content_hash !== contentHash) {
      throw new EditorialConflictError('Edition ID already contains different content');
    }
    return { edition: publicSummary(existing), created: false };
  }

  const prefix = `editorial/users/${safeSegment(userId)}/${edition.editionDate}/r${edition.revision}`;
  const keys = {
    edition: `${prefix}/edition.json`,
    markdown: `${prefix}/edition.md`,
    snapshot: `${prefix}/snapshot.json`,
    validation: `${prefix}/validation.json`,
  };
  const metadata = { userId, editionId: edition.id, editionDate: edition.editionDate };
  await Promise.all([
    bucket.put(keys.edition, editionJson, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: metadata,
    }),
    bucket.put(keys.markdown, normalized.markdown, {
      httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
      customMetadata: metadata,
    }),
    bucket.put(keys.snapshot, `${JSON.stringify(normalized.snapshot, null, 2)}\n`, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: metadata,
    }),
    bucket.put(keys.validation, `${JSON.stringify(normalized.validation, null, 2)}\n`, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: metadata,
    }),
  ]);

  await db
    .prepare(
      `INSERT INTO daily_editions
       (id, user_id, edition_date, revision, status, schema_version, headline,
        window_start_at, window_end_at, edition_key, markdown_key, snapshot_key,
        validation_key, content_hash, quality_score, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'PUBLISHED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      normalized.validation.overallScore ?? 0,
      now,
      now
    )
    .run();

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
  artifact: 'markdown' | 'snapshot' | 'validation'
): Promise<R2ObjectBody | null> {
  const row = await db
    .prepare('SELECT * FROM daily_editions WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<EditorialEditionRow>();
  if (!row) return null;
  const key =
    artifact === 'markdown'
      ? row.markdown_key
      : artifact === 'snapshot'
        ? row.snapshot_key
        : row.validation_key;
  return bucket.get(key);
}
