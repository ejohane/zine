import { getDailyFeed } from './daily-feed';

export const PEOPLE_DAILY_SCHEMA_VERSION = 1;
export const PEOPLE_DAILY_ALGORITHM_VERSION = 'people-daily-v1';
export const PEOPLE_DAILY_PROMPT_VERSION = 'people-daily-overview-v1';

type WorkersAIRunner = {
  run(model: string, input: unknown): Promise<unknown>;
};

type PeopleDailyBuildRow = {
  id: string;
  user_id: string;
  edition_date: string;
  status: 'COLLECTING' | 'BUILDING' | 'VALIDATING' | 'PUBLISHED' | 'FAILED';
  edition_id: string | null;
  favorites_run_id: string | null;
  following_run_id: string | null;
  algorithm_version: string;
  prompt_version: string;
  model: string | null;
  input_hash: string | null;
  failure_stage: string | null;
  error_message: string | null;
  timings_json: string;
  started_at: number;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
};

type PeopleDailyEditionRow = {
  id: string;
  user_id: string;
  edition_date: string;
  revision: number;
  status: 'PUBLISHED';
  schema_version: number;
  artifact_key: string;
  content_hash: string;
  favorites_run_id: string;
  following_run_id: string;
  membership_snapshot_id: string | null;
  algorithm_version: string;
  prompt_version: string;
  model: string | null;
  coverage_status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
  warnings_json: string;
  counts_json: string;
  timings_json: string;
  built_at: number;
  published_at: number;
  created_at: number;
};

type DailyFeedDocument = Awaited<ReturnType<typeof getDailyFeed>>;

type PeopleDailyArtifact = {
  schemaVersion: typeof PEOPLE_DAILY_SCHEMA_VERSION;
  algorithmVersion: typeof PEOPLE_DAILY_ALGORITHM_VERSION;
  promptVersion: typeof PEOPLE_DAILY_PROMPT_VERSION;
  editionDate: string;
  feed: DailyFeedDocument;
};

export class PeopleDailyConflictError extends Error {}
export class PeopleDailyNotFoundError extends Error {}
export class PeopleDailyValidationError extends Error {}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

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

function publicBuild(row: PeopleDailyBuildRow) {
  return {
    id: row.id,
    editionDate: row.edition_date,
    status: row.status,
    editionId: row.edition_id,
    favoritesRunId: row.favorites_run_id,
    followingRunId: row.following_run_id,
    algorithmVersion: row.algorithm_version,
    promptVersion: row.prompt_version,
    model: row.model,
    failureStage: row.failure_stage,
    errorMessage: row.error_message,
    timingsMs: parseJson<Record<string, number>>(row.timings_json, {}),
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function publicEdition(row: PeopleDailyEditionRow) {
  return {
    id: row.id,
    editionDate: row.edition_date,
    revision: row.revision,
    status: row.status,
    schemaVersion: row.schema_version,
    contentHash: row.content_hash,
    favoritesRunId: row.favorites_run_id,
    followingRunId: row.following_run_id,
    membershipSnapshotId: row.membership_snapshot_id,
    algorithmVersion: row.algorithm_version,
    promptVersion: row.prompt_version,
    model: row.model,
    coverageStatus: row.coverage_status,
    warnings: parseJson<string[]>(row.warnings_json, []),
    counts: parseJson<Record<string, number>>(row.counts_json, {}),
    timingsMs: parseJson<Record<string, number>>(row.timings_json, {}),
    builtAt: new Date(row.built_at).toISOString(),
    publishedAt: new Date(row.published_at).toISOString(),
  };
}

async function findBuild(
  db: D1Database,
  userId: string,
  buildId: string
): Promise<PeopleDailyBuildRow | null> {
  return db
    .prepare('SELECT * FROM people_daily_builds WHERE id = ? AND user_id = ?')
    .bind(buildId, userId)
    .first<PeopleDailyBuildRow>();
}

async function findEdition(
  db: D1Database,
  userId: string,
  editionId: string
): Promise<PeopleDailyEditionRow | null> {
  return db
    .prepare('SELECT * FROM people_daily_editions WHERE id = ? AND user_id = ?')
    .bind(editionId, userId)
    .first<PeopleDailyEditionRow>();
}

async function activeEdition(
  db: D1Database,
  userId: string
): Promise<PeopleDailyEditionRow | null> {
  return db
    .prepare(
      `SELECT e.* FROM people_daily_active_editions a
       JOIN people_daily_editions e ON e.id = a.edition_id
       WHERE a.user_id = ? AND e.user_id = ? AND e.status = 'PUBLISHED'`
    )
    .bind(userId, userId)
    .first<PeopleDailyEditionRow>();
}

async function readArtifact(
  bucket: R2Bucket,
  row: PeopleDailyEditionRow
): Promise<PeopleDailyArtifact> {
  const object = await bucket.get(row.artifact_key);
  if (!object) throw new PeopleDailyNotFoundError('The active Today artifact is missing');
  const artifact = (await object.json()) as PeopleDailyArtifact;
  if (
    artifact.schemaVersion !== PEOPLE_DAILY_SCHEMA_VERSION ||
    artifact.algorithmVersion !== row.algorithm_version ||
    artifact.editionDate !== row.edition_date ||
    !artifact.feed ||
    typeof artifact.feed !== 'object'
  ) {
    throw new PeopleDailyValidationError('The active Today artifact failed structural validation');
  }
  return artifact;
}

export async function startPeopleDailyBuild(
  db: D1Database,
  userId: string,
  input: { id: string; editionDate: string; model?: string | null },
  now = Date.now()
) {
  const existing = await findBuild(db, userId, input.id);
  if (existing) {
    if (
      existing.edition_date !== input.editionDate ||
      existing.algorithm_version !== PEOPLE_DAILY_ALGORITHM_VERSION ||
      existing.prompt_version !== PEOPLE_DAILY_PROMPT_VERSION ||
      existing.model !== (input.model ?? null)
    ) {
      throw new PeopleDailyConflictError(
        'People Daily build ID is already used by different inputs'
      );
    }
    return { created: false, build: publicBuild(existing) };
  }

  await db
    .prepare(
      `INSERT INTO people_daily_builds (
        id, user_id, edition_date, status, edition_id, favorites_run_id, following_run_id,
        algorithm_version, prompt_version, model, input_hash, failure_stage, error_message,
        timings_json, started_at, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'COLLECTING', NULL, NULL, NULL, ?, ?, ?, NULL, NULL, NULL, '{}', ?, NULL, ?, ?)`
    )
    .bind(
      input.id,
      userId,
      input.editionDate,
      PEOPLE_DAILY_ALGORITHM_VERSION,
      PEOPLE_DAILY_PROMPT_VERSION,
      input.model ?? null,
      now,
      now,
      now
    )
    .run();
  return { created: true, build: publicBuild((await findBuild(db, userId, input.id))!) };
}

export async function getPeopleDailyBuild(db: D1Database, userId: string, buildId: string) {
  const row = await findBuild(db, userId, buildId);
  if (!row) throw new PeopleDailyNotFoundError('People Daily build not found');
  return publicBuild(row);
}

export async function listPeopleDailyEditions(db: D1Database, userId: string, limit = 30) {
  const boundedLimit = Math.max(1, Math.min(limit, 100));
  const [rows, active] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM people_daily_editions WHERE user_id = ? AND status = 'PUBLISHED'
         ORDER BY edition_date DESC, revision DESC LIMIT ?`
      )
      .bind(userId, boundedLimit)
      .all<PeopleDailyEditionRow>(),
    activeEdition(db, userId),
  ]);
  return {
    activeEditionId: active?.id ?? null,
    editions: rows.results.map(publicEdition),
  };
}

export async function activatePeopleDailyEdition(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
  editionId: string,
  now = Date.now()
) {
  const edition = await findEdition(db, userId, editionId);
  if (!edition) throw new PeopleDailyNotFoundError('People Daily edition not found');
  await readArtifact(bucket, edition);
  await db
    .prepare(
      `INSERT INTO people_daily_active_editions (user_id, edition_id, updated_at)
       VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
       edition_id = excluded.edition_id, updated_at = excluded.updated_at`
    )
    .bind(userId, editionId, now)
    .run();
  return { edition: publicEdition(edition), activatedAt: new Date(now).toISOString() };
}

export async function failPeopleDailyBuild(
  db: D1Database,
  userId: string,
  buildId: string,
  input: { stage: string; message: string },
  now = Date.now()
) {
  const row = await findBuild(db, userId, buildId);
  if (!row) throw new PeopleDailyNotFoundError('People Daily build not found');
  if (row.status === 'PUBLISHED') {
    throw new PeopleDailyConflictError('A published People Daily build cannot be failed');
  }
  await db
    .prepare(
      `UPDATE people_daily_builds SET status = 'FAILED', failure_stage = ?, error_message = ?,
       completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`
    )
    .bind(input.stage, input.message.slice(0, 2_000), now, now, buildId, userId)
    .run();
  return getPeopleDailyBuild(db, userId, buildId);
}

function validateArtifact(
  artifact: PeopleDailyArtifact,
  expected: {
    date: string;
    favoritesRunId: string;
    followingRunId: string;
  }
) {
  const feed = artifact.feed as DailyFeedDocument & {
    posts: Array<{ id: string }>;
    threadUnits?: Array<{ id: string; postIds: string[] }>;
    overviewSections?: Array<{
      id: string;
      favoriteThreadUnitIds: string[];
      supportingThreadUnitIds: string[];
      representativePostIds: string[];
    }>;
    sections?: {
      favoriteThreadUnitIds?: string[];
      followingThreadUnitIds?: string[];
    };
    inputs?: {
      favorites?: { runId: string } | null;
      following?: { runId: string } | null;
    };
  };
  if (artifact.editionDate !== expected.date || feed.date !== expected.date) {
    throw new PeopleDailyValidationError(
      'Built feed date does not match the registered edition date'
    );
  }
  if (feed.inputs?.favorites?.runId !== expected.favoritesRunId) {
    throw new PeopleDailyValidationError('Built feed does not retain the requested Favorites run');
  }
  if (feed.inputs?.following?.runId !== expected.followingRunId) {
    throw new PeopleDailyValidationError('Built feed does not retain the requested Following run');
  }
  const postIds = new Set(feed.posts.map((post) => post.id));
  const units = new Map((feed.threadUnits ?? []).map((unit) => [unit.id, unit]));
  for (const unit of units.values()) {
    if (unit.postIds.some((postId) => !postIds.has(postId))) {
      throw new PeopleDailyValidationError(`Thread unit ${unit.id} references a missing post`);
    }
  }
  const assignedUnits = new Map<string, string>();
  const assignedPosts = new Map<string, string>();
  const claimUnit = (sectionId: string, unitId: string) => {
    const unit = units.get(unitId);
    if (!unit) {
      throw new PeopleDailyValidationError(
        `Overview section ${sectionId} references a missing thread`
      );
    }
    const previousUnitSection = assignedUnits.get(unitId);
    if (previousUnitSection && previousUnitSection !== sectionId) {
      throw new PeopleDailyValidationError(
        `Thread unit ${unitId} is repeated in sections ${previousUnitSection} and ${sectionId}`
      );
    }
    assignedUnits.set(unitId, sectionId);
    for (const postId of unit.postIds) {
      const previousPostSection = assignedPosts.get(postId);
      if (previousPostSection && previousPostSection !== sectionId) {
        throw new PeopleDailyValidationError(
          `Post ${postId} is repeated in sections ${previousPostSection} and ${sectionId}`
        );
      }
      assignedPosts.set(postId, sectionId);
    }
  };
  for (const section of feed.overviewSections ?? []) {
    const referencedUnits = new Set([
      ...section.favoriteThreadUnitIds,
      ...section.supportingThreadUnitIds,
    ]);
    referencedUnits.forEach((unitId) => claimUnit(section.id, unitId));
    if (section.representativePostIds.some((postId) => !postIds.has(postId))) {
      throw new PeopleDailyValidationError(
        `Overview section ${section.id} references a missing post`
      );
    }
  }
  const moreUnitIds = new Set([
    ...(feed.sections?.favoriteThreadUnitIds ?? []),
    ...(feed.sections?.followingThreadUnitIds ?? []),
  ]);
  moreUnitIds.forEach((unitId) => claimUnit('more', unitId));
}

export async function publishPeopleDailyBuild(
  db: D1Database,
  archiveDb: D1Database,
  bucket: R2Bucket,
  userId: string,
  buildId: string,
  input: { favoritesRunId: string; followingRunId: string },
  options: {
    ai?: WorkersAIRunner | null;
    embeddingModel?: string;
    overviewModel?: string;
    now?: Date;
  } = {}
) {
  const started = performance.now();
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  let stage = 'BUILD';
  const row = await findBuild(db, userId, buildId);
  if (!row) throw new PeopleDailyNotFoundError('People Daily build not found');
  if (row.status === 'PUBLISHED' && row.edition_id) {
    const edition = await findEdition(db, userId, row.edition_id);
    if (!edition) throw new PeopleDailyNotFoundError('Published People Daily edition is missing');
    return { created: false, build: publicBuild(row), edition: publicEdition(edition) };
  }
  const inputHash = await sha256(
    JSON.stringify({
      editionDate: row.edition_date,
      favoritesRunId: input.favoritesRunId,
      followingRunId: input.followingRunId,
      algorithmVersion: row.algorithm_version,
      promptVersion: row.prompt_version,
      model: row.model,
    })
  );
  if (row.input_hash && row.input_hash !== inputHash) {
    throw new PeopleDailyConflictError('People Daily build inputs changed across a retry');
  }

  await db
    .prepare(
      `UPDATE people_daily_builds SET status = 'BUILDING', favorites_run_id = ?,
       following_run_id = ?, input_hash = ?, failure_stage = NULL, error_message = NULL,
       completed_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?`
    )
    .bind(input.favoritesRunId, input.followingRunId, inputHash, nowMs, buildId, userId)
    .run();

  try {
    const buildStarted = performance.now();
    const feed = await getDailyFeed(archiveDb, userId, {
      date: row.edition_date,
      favoritesRunId: input.favoritesRunId,
      followingRunId: input.followingRunId,
      now,
      ai: options.ai,
      embeddingModel: options.embeddingModel,
      overviewModel: options.overviewModel ?? row.model ?? undefined,
    });
    const buildMs = performance.now() - buildStarted;
    stage = 'VALIDATE';
    await db
      .prepare(
        `UPDATE people_daily_builds SET status = 'VALIDATING', timings_json = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .bind(JSON.stringify({ build: Math.round(buildMs) }), Date.now(), buildId, userId)
      .run();

    const artifact: PeopleDailyArtifact = {
      schemaVersion: PEOPLE_DAILY_SCHEMA_VERSION,
      algorithmVersion: PEOPLE_DAILY_ALGORITHM_VERSION,
      promptVersion: PEOPLE_DAILY_PROMPT_VERSION,
      editionDate: row.edition_date,
      feed,
    };
    validateArtifact(artifact, {
      date: row.edition_date,
      favoritesRunId: input.favoritesRunId,
      followingRunId: input.followingRunId,
    });
    const artifactBody = jsonBody(artifact);
    const contentHash = await sha256(artifactBody);
    const existingEdition = await db
      .prepare('SELECT * FROM people_daily_editions WHERE user_id = ? AND content_hash = ?')
      .bind(userId, contentHash)
      .first<PeopleDailyEditionRow>();
    const validationMs = performance.now() - buildStarted - buildMs;

    let edition = existingEdition;
    let created = false;
    if (!edition) {
      const revisionRow = await db
        .prepare(
          'SELECT COALESCE(MAX(revision), 0) AS revision FROM people_daily_editions WHERE user_id = ? AND edition_date = ?'
        )
        .bind(userId, row.edition_date)
        .first<{ revision: number }>();
      const revision = (revisionRow?.revision ?? 0) + 1;
      const editionId = `people_daily_${row.edition_date}_r${revision}_${contentHash.slice(0, 12)}`;
      const artifactKey = `people-daily/users/${safeSegment(userId)}/${row.edition_date}/r${revision}/${contentHash}/edition.json`;
      stage = 'UPLOAD';
      const uploadStarted = performance.now();
      await bucket.put(artifactKey, artifactBody, {
        httpMetadata: { contentType: 'application/json; charset=utf-8' },
        customMetadata: {
          userId,
          editionId,
          editionDate: row.edition_date,
          contentHash,
          favoritesRunId: input.favoritesRunId,
          followingRunId: input.followingRunId,
        },
      });
      const uploadMs = performance.now() - uploadStarted;
      const publishedAt = Date.now();
      const feedRecord = feed as DailyFeedDocument & {
        posts: unknown[];
        threadUnits?: unknown[];
        overviewSections?: unknown[];
        freshness: { status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE'; warnings: string[] };
        inputs?: { membership?: { snapshotId?: string | null } | null };
        generationTimingsMs?: Record<string, number>;
      };
      const timings = {
        ...(feedRecord.generationTimingsMs ?? {}),
        build: Math.round(buildMs),
        validate: Math.round(validationMs),
        upload: Math.round(uploadMs),
        total: Math.round(performance.now() - started),
      };
      const counts = {
        posts: feedRecord.posts.length,
        threadUnits: feedRecord.threadUnits?.length ?? 0,
        overviewSections: feedRecord.overviewSections?.length ?? 0,
      };
      stage = 'PUBLISH';
      await db.batch([
        db
          .prepare(
            `INSERT INTO people_daily_editions (
              id, user_id, edition_date, revision, status, schema_version, artifact_key,
              content_hash, favorites_run_id, following_run_id, membership_snapshot_id,
              algorithm_version, prompt_version, model, coverage_status, warnings_json,
              counts_json, timings_json, built_at, published_at, created_at
            ) VALUES (?, ?, ?, ?, 'PUBLISHED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            editionId,
            userId,
            row.edition_date,
            revision,
            PEOPLE_DAILY_SCHEMA_VERSION,
            artifactKey,
            contentHash,
            input.favoritesRunId,
            input.followingRunId,
            feedRecord.inputs?.membership?.snapshotId ?? null,
            PEOPLE_DAILY_ALGORITHM_VERSION,
            PEOPLE_DAILY_PROMPT_VERSION,
            row.model,
            feedRecord.freshness.status,
            JSON.stringify(feedRecord.freshness.warnings),
            JSON.stringify(counts),
            JSON.stringify(timings),
            publishedAt,
            publishedAt,
            publishedAt
          ),
        db
          .prepare(
            `INSERT INTO people_daily_active_editions (user_id, edition_id, updated_at)
             VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
             edition_id = excluded.edition_id, updated_at = excluded.updated_at`
          )
          .bind(userId, editionId, publishedAt),
        db
          .prepare(
            `UPDATE people_daily_builds SET status = 'PUBLISHED', edition_id = ?,
             timings_json = ?, completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`
          )
          .bind(editionId, JSON.stringify(timings), publishedAt, publishedAt, buildId, userId),
      ]);
      edition = await findEdition(db, userId, editionId);
      created = true;
    } else {
      const completedAt = Date.now();
      await db.batch([
        db
          .prepare(
            `INSERT INTO people_daily_active_editions (user_id, edition_id, updated_at)
             VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
             edition_id = excluded.edition_id, updated_at = excluded.updated_at`
          )
          .bind(userId, edition.id, completedAt),
        db
          .prepare(
            `UPDATE people_daily_builds SET status = 'PUBLISHED', edition_id = ?, completed_at = ?,
             updated_at = ? WHERE id = ? AND user_id = ?`
          )
          .bind(edition.id, completedAt, completedAt, buildId, userId),
      ]);
    }
    if (!edition) throw new PeopleDailyNotFoundError('Published People Daily edition is missing');
    return {
      created,
      build: publicBuild((await findBuild(db, userId, buildId))!),
      edition: publicEdition(edition),
    };
  } catch (error) {
    const failedAt = Date.now();
    await db
      .prepare(
        `UPDATE people_daily_builds SET status = 'FAILED', failure_stage = ?, error_message = ?,
         completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`
      )
      .bind(
        stage,
        (error instanceof Error ? error.message : String(error)).slice(0, 2_000),
        failedAt,
        failedAt,
        buildId,
        userId
      )
      .run();
    throw error;
  }
}

function uniqueAuthors(
  feed: DailyFeedDocument & { posts: Array<{ author: unknown; repostedBy?: unknown }> }
) {
  const authors = new Map<string, unknown>();
  for (const post of feed.posts) {
    const author = post.author as { key?: string };
    if (author?.key) authors.set(author.key, author);
    const repostedBy = post.repostedBy as { key?: string } | null | undefined;
    if (repostedBy?.key) authors.set(repostedBy.key, repostedBy);
  }
  return [...authors.values()];
}

export async function getPeopleDailyOverview(db: D1Database, bucket: R2Bucket, userId: string) {
  const row = await activeEdition(db, userId);
  if (!row) return null;
  const artifact = await readArtifact(bucket, row);
  const feed = artifact.feed as DailyFeedDocument & {
    posts: Array<{ author: unknown; repostedBy?: unknown }>;
    overviewSections?: unknown[];
    sections?: { favoriteThreadUnitIds?: string[]; followingThreadUnitIds?: string[] };
  };
  return {
    ...publicEdition(row),
    date: feed.date,
    timezone: feed.timezone,
    frozenAt: feed.frozenAt,
    freshness: feed.freshness,
    coverage: feed.coverage,
    sources: feed.sources,
    overview: feed.overview,
    overviewSections: feed.overviewSections ?? [],
    authors: uniqueAuthors(feed),
    more: {
      id: 'more',
      favoriteConversationCount: feed.sections?.favoriteThreadUnitIds?.length ?? 0,
      supportingConversationCount: feed.sections?.followingThreadUnitIds?.length ?? 0,
    },
    inputs: feed.inputs,
  };
}

export async function getPeopleDailySection(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
  sectionId: string
) {
  const row = await activeEdition(db, userId);
  if (!row) return null;
  const artifact = await readArtifact(bucket, row);
  const feed = artifact.feed as DailyFeedDocument & {
    posts: Array<{ id: string }>;
    threadUnits?: Array<{ id: string; postIds: string[] }>;
    overviewSections?: Array<{
      id: string;
      title: string;
      summary: string;
      favoriteThreadUnitIds: string[];
      supportingThreadUnitIds: string[];
      coverageWarnings: string[];
    }>;
    sections?: { favoriteThreadUnitIds?: string[]; followingThreadUnitIds?: string[] };
  };
  const section =
    sectionId === 'more'
      ? {
          id: 'more',
          title: 'More conversations',
          summary: 'Conversations that stand on their own today.',
          favoriteThreadUnitIds: feed.sections?.favoriteThreadUnitIds ?? [],
          supportingThreadUnitIds: feed.sections?.followingThreadUnitIds ?? [],
          coverageWarnings: [] as string[],
        }
      : feed.overviewSections?.find((candidate) => candidate.id === sectionId);
  if (!section) throw new PeopleDailyNotFoundError('Today section not found');
  const requestedUnitIds = new Set([
    ...section.favoriteThreadUnitIds,
    ...section.supportingThreadUnitIds,
  ]);
  const threadUnits = (feed.threadUnits ?? []).filter((unit) => requestedUnitIds.has(unit.id));
  const postIds = new Set(threadUnits.flatMap((unit) => unit.postIds));
  const posts = feed.posts.filter((post) => postIds.has(post.id));
  return {
    edition: publicEdition(row),
    date: feed.date,
    timezone: feed.timezone,
    section,
    sources: feed.sources,
    threadUnits,
    posts,
  };
}
