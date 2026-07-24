import { and, eq, isNull, lte } from 'drizzle-orm';
import { ulid } from 'ulid';

import type { Database } from '../db';
import { articleBodyDlqEvents, articleBodyStates, articleBodyVersions } from '../db/schema';
import type { Bindings } from '../types';
import { ArticleBodyQueueMessageSchema } from './schema';
import { putArticleBodyArtifact } from './storage';
import {
  ARTICLE_BODY_EXTRACTOR_VERSION,
  type ArticleBodyArtifact,
  type ArticleBodyEmbeddedCandidate,
  type ArticleBodyEnrollmentMode,
  type ArticleBodyPublicStatus,
  type ArticleBodyQueueMessage,
  type ArticleBodyStatus,
  type ArticleBodyTrigger,
} from './types';

export interface ArticleBodyStatusRecord {
  status: ArticleBodyStatus;
  targetExtractorVersion: number;
  attemptCount: number;
  lastErrorCode: string | null;
  lastHttpStatus: number | null;
  lastAttemptAt: number | null;
  nextAttemptAt: number | null;
  updatedAt: number;
  versionId: string | null;
  schemaVersion: number | null;
  extractorVersion: number | null;
  sourceKind: ArticleBodyArtifact['sourceKind'] | null;
  contentHash: string | null;
  r2Key: string | null;
  wordCount: number | null;
  readingTimeMinutes: number | null;
  qualityScore: number | null;
  qualityWarningsJson: string | null;
}

function parseWarnings(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((warning) => typeof warning === 'string')
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export function isArticleBodyPipelineEnabled(
  env: Pick<Bindings, 'ARTICLE_BODY_PIPELINE_ENABLED'>
): boolean {
  return env.ARTICLE_BODY_PIPELINE_ENABLED?.trim().toLowerCase() === 'true';
}

export function getArticleBodyEnrollmentMode(
  env: Pick<Bindings, 'ARTICLE_BODY_ENROLLMENT_MODE'>
): ArticleBodyEnrollmentMode {
  const value = env.ARTICLE_BODY_ENROLLMENT_MODE?.trim().toLowerCase();
  return value === 'reader' || value === 'saved' || value === 'all' ? value : 'off';
}

export function isArticleBodyEnrollmentEnabled(
  env: Pick<Bindings, 'ARTICLE_BODY_ENROLLMENT_MODE'>,
  trigger: Extract<ArticleBodyTrigger, 'reader_open' | 'bookmark' | 'ingestion'>
): boolean {
  const mode = getArticleBodyEnrollmentMode(env);
  if (mode === 'all') return true;
  if (mode === 'saved') return trigger === 'reader_open' || trigger === 'bookmark';
  return mode === 'reader' && trigger === 'reader_open';
}

function isRetryableStoredFailure(errorCode: string | null): boolean {
  if (!errorCode) return false;
  if (
    errorCode === 'QUEUE_SEND_FAILED' ||
    errorCode === 'QUEUE_RETRIES_EXHAUSTED' ||
    errorCode === 'FETCH_FAILED' ||
    errorCode === 'FETCH_TIMEOUT' ||
    errorCode === 'PUBLISH_FAILED'
  ) {
    return true;
  }
  const match = /^HTTP_(\d{3})$/.exec(errorCode);
  if (!match) return false;
  const status = Number(match[1]);
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function getArticleBodyStatus(
  db: Database,
  itemId: string
): Promise<ArticleBodyStatusRecord | null> {
  const rows = await db
    .select({
      status: articleBodyStates.status,
      targetExtractorVersion: articleBodyStates.targetExtractorVersion,
      attemptCount: articleBodyStates.attemptCount,
      lastErrorCode: articleBodyStates.lastErrorCode,
      lastHttpStatus: articleBodyStates.lastHttpStatus,
      lastAttemptAt: articleBodyStates.lastAttemptAt,
      nextAttemptAt: articleBodyStates.nextAttemptAt,
      updatedAt: articleBodyStates.updatedAt,
      versionId: articleBodyVersions.id,
      schemaVersion: articleBodyVersions.schemaVersion,
      extractorVersion: articleBodyVersions.extractorVersion,
      sourceKind: articleBodyVersions.sourceKind,
      contentHash: articleBodyVersions.contentHash,
      r2Key: articleBodyVersions.r2Key,
      wordCount: articleBodyVersions.wordCount,
      readingTimeMinutes: articleBodyVersions.readingTimeMinutes,
      qualityScore: articleBodyVersions.qualityScore,
      qualityWarningsJson: articleBodyVersions.qualityWarningsJson,
    })
    .from(articleBodyStates)
    .leftJoin(articleBodyVersions, eq(articleBodyStates.currentVersionId, articleBodyVersions.id))
    .where(eq(articleBodyStates.itemId, itemId))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0] as ArticleBodyStatusRecord;
}

export function toArticleBodyPublicStatus(
  record: ArticleBodyStatusRecord | null,
  legacyContentPresent: boolean
): ArticleBodyPublicStatus {
  if (!record) {
    if (legacyContentPresent) {
      return {
        availability: 'AVAILABLE',
        pipelineStatus: 'LEGACY',
        schemaVersion: 0,
        extractorVersion: null,
        sourceKind: 'LEGACY',
        contentHash: null,
        wordCount: null,
        readingTimeMinutes: null,
        qualityScore: null,
        qualityWarnings: ['LEGACY_UNNORMALIZED'],
        lastErrorCode: null,
        updatedAt: null,
      };
    }

    return {
      availability: 'UNAVAILABLE',
      pipelineStatus: 'NOT_REQUESTED',
      schemaVersion: null,
      extractorVersion: null,
      sourceKind: null,
      contentHash: null,
      wordCount: null,
      readingTimeMinutes: null,
      qualityScore: null,
      qualityWarnings: [],
      lastErrorCode: null,
      updatedAt: null,
    };
  }

  const hasCurrentVersion = record.versionId !== null && record.r2Key !== null;
  const qualityWarnings = parseWarnings(record.qualityWarningsJson);
  let availability: ArticleBodyPublicStatus['availability'];

  if (record.status === 'PENDING' || record.status === 'PROCESSING') {
    availability = hasCurrentVersion ? 'AVAILABLE' : 'PENDING';
  } else if (record.status === 'AVAILABLE' && hasCurrentVersion) {
    availability = 'AVAILABLE';
  } else if (record.status === 'DEGRADED' && hasCurrentVersion) {
    availability = 'DEGRADED';
  } else if (record.status === 'UNAVAILABLE' && hasCurrentVersion) {
    availability = 'DEGRADED';
    qualityWarnings.push('LATEST_ACQUISITION_FAILED_USING_CURRENT_VERSION');
  } else {
    availability = 'UNAVAILABLE';
    if ((record.status === 'AVAILABLE' || record.status === 'DEGRADED') && !hasCurrentVersion) {
      qualityWarnings.push('MISSING_CURRENT_VERSION');
    }
  }

  return {
    availability,
    pipelineStatus: record.status,
    schemaVersion: record.schemaVersion,
    extractorVersion: record.extractorVersion ?? record.targetExtractorVersion,
    sourceKind: record.sourceKind,
    contentHash: record.contentHash,
    wordCount: record.wordCount,
    readingTimeMinutes: record.readingTimeMinutes,
    qualityScore: record.qualityScore,
    qualityWarnings,
    lastErrorCode: record.lastErrorCode,
    updatedAt: new Date(record.updatedAt).toISOString(),
  };
}

export async function markArticleBodyPending(
  db: Database,
  itemId: string,
  extractorVersion: number,
  trigger: ArticleBodyTrigger,
  now: number = Date.now()
): Promise<void> {
  await db
    .insert(articleBodyStates)
    .values({
      itemId,
      status: 'PENDING',
      currentVersionId: null,
      targetExtractorVersion: extractorVersion,
      attemptCount: 0,
      lastErrorCode: null,
      lastHttpStatus: null,
      lastAttemptAt: null,
      nextAttemptAt: null,
      enrollmentTrigger: trigger,
      requestedAt: now,
      terminalAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: articleBodyStates.itemId,
      set: {
        status: 'PENDING',
        targetExtractorVersion: extractorVersion,
        lastErrorCode: null,
        lastHttpStatus: null,
        nextAttemptAt: null,
        enrollmentTrigger: trigger,
        requestedAt: now,
        terminalAt: null,
        updatedAt: now,
      },
    });
}

export async function markArticleBodyProcessing(
  db: Database,
  itemId: string,
  attemptCount: number,
  now: number = Date.now()
): Promise<void> {
  await db
    .update(articleBodyStates)
    .set({
      status: 'PROCESSING',
      attemptCount,
      lastAttemptAt: now,
      nextAttemptAt: null,
      updatedAt: now,
    })
    .where(eq(articleBodyStates.itemId, itemId));
}

export async function markArticleBodyRetryScheduled(
  db: Database,
  itemId: string,
  errorCode: string,
  attemptCount: number,
  nextAttemptAt: number,
  now: number = Date.now()
): Promise<void> {
  await db
    .update(articleBodyStates)
    .set({
      status: 'PENDING',
      attemptCount,
      lastErrorCode: errorCode,
      lastAttemptAt: now,
      nextAttemptAt,
      terminalAt: null,
      updatedAt: now,
    })
    .where(eq(articleBodyStates.itemId, itemId));
}

export async function markArticleBodyUnavailable(
  db: Database,
  itemId: string,
  errorCode: string,
  options: {
    httpStatus?: number | null;
    attemptCount?: number;
    nextAttemptAt?: number | null;
    now?: number;
  } = {}
): Promise<void> {
  const now = options.now ?? Date.now();
  await db
    .update(articleBodyStates)
    .set({
      status: 'UNAVAILABLE',
      ...(options.attemptCount === undefined ? {} : { attemptCount: options.attemptCount }),
      lastErrorCode: errorCode,
      lastHttpStatus: options.httpStatus ?? null,
      lastAttemptAt: now,
      nextAttemptAt: options.nextAttemptAt ?? null,
      terminalAt: now,
      updatedAt: now,
    })
    .where(eq(articleBodyStates.itemId, itemId));
}

export async function publishArticleBodyArtifact(
  db: Database,
  bucket: R2Bucket,
  artifact: ArticleBodyArtifact,
  status: Extract<ArticleBodyStatus, 'AVAILABLE' | 'DEGRADED'>,
  now: number = Date.now()
): Promise<{ versionId: string; r2Key: string; created: boolean }> {
  const stored = await putArticleBodyArtifact(bucket, artifact);
  const proposedVersionId = ulid(now);

  await db
    .insert(articleBodyVersions)
    .values({
      id: proposedVersionId,
      itemId: artifact.itemId,
      schemaVersion: artifact.schemaVersion,
      extractorVersion: artifact.extractorVersion,
      sourceKind: artifact.sourceKind,
      sourceUrl: artifact.sourceUrl,
      contentHash: artifact.contentHash,
      r2Key: stored.key,
      wordCount: artifact.wordCount,
      readingTimeMinutes: artifact.readingTimeMinutes,
      qualityScore: artifact.qualityScore,
      qualityWarningsJson: JSON.stringify(artifact.qualityWarnings),
      createdAt: now,
    })
    .onConflictDoNothing({
      target: [articleBodyVersions.itemId, articleBodyVersions.contentHash],
    });

  const existing = await db
    .select({ id: articleBodyVersions.id })
    .from(articleBodyVersions)
    .where(
      and(
        eq(articleBodyVersions.itemId, artifact.itemId),
        eq(articleBodyVersions.contentHash, artifact.contentHash)
      )
    )
    .limit(1);

  const versionId = existing[0]?.id;
  if (!versionId) {
    throw new Error('Article body version was not readable after storage');
  }

  await db
    .insert(articleBodyStates)
    .values({
      itemId: artifact.itemId,
      status,
      currentVersionId: versionId,
      targetExtractorVersion: artifact.extractorVersion,
      attemptCount: 1,
      lastErrorCode: null,
      lastHttpStatus: null,
      lastAttemptAt: now,
      nextAttemptAt: null,
      terminalAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: articleBodyStates.itemId,
      set: {
        status,
        currentVersionId: versionId,
        targetExtractorVersion: artifact.extractorVersion,
        lastErrorCode: null,
        lastHttpStatus: null,
        lastAttemptAt: now,
        nextAttemptAt: null,
        terminalAt: now,
        updatedAt: now,
      },
    });

  await resolveArticleBodyDlqEvents(db, artifact.itemId, artifact.extractorVersion, now);

  return { versionId, r2Key: stored.key, created: stored.created };
}

export async function resolveArticleBodyDlqEvents(
  db: Database,
  itemId: string,
  extractorVersion: number,
  now: number = Date.now()
): Promise<void> {
  await db
    .update(articleBodyDlqEvents)
    .set({ resolvedAt: now })
    .where(
      and(
        eq(articleBodyDlqEvents.itemId, itemId),
        lte(articleBodyDlqEvents.extractorVersion, extractorVersion),
        isNull(articleBodyDlqEvents.resolvedAt)
      )
    );
}

export async function enqueueArticleBody(
  db: Database,
  env: Pick<Bindings, 'ARTICLE_BODY_PIPELINE_ENABLED' | 'ARTICLE_BODY_QUEUE'>,
  input: {
    itemId: string;
    trigger: ArticleBodyTrigger;
    extractorVersion?: number;
    traceId?: string;
    embeddedCandidates?: ArticleBodyEmbeddedCandidate[];
    now?: number;
  }
): Promise<{
  queued: boolean;
  reason?: 'disabled' | 'queue_unavailable' | 'already_queued' | 'current' | 'terminal';
  embeddedCandidatesIncluded?: boolean;
}> {
  if (!isArticleBodyPipelineEnabled(env)) return { queued: false, reason: 'disabled' };
  if (!env.ARTICLE_BODY_QUEUE) return { queued: false, reason: 'queue_unavailable' };

  const now = input.now ?? Date.now();
  const extractorVersion = input.extractorVersion ?? ARTICLE_BODY_EXTRACTOR_VERSION;
  const current = await getArticleBodyStatus(db, input.itemId);
  if (
    current &&
    (current.status === 'PENDING' || current.status === 'PROCESSING') &&
    current.targetExtractorVersion >= extractorVersion
  ) {
    return { queued: false, reason: 'already_queued' };
  }
  if (
    input.trigger !== 'repair' &&
    current?.versionId &&
    (current.extractorVersion ?? 0) >= extractorVersion &&
    (current.status === 'AVAILABLE' || current.status === 'DEGRADED')
  ) {
    return { queued: false, reason: 'current' };
  }
  if (
    input.trigger !== 'repair' &&
    current?.status === 'UNAVAILABLE' &&
    current.targetExtractorVersion >= extractorVersion &&
    !isRetryableStoredFailure(current.lastErrorCode)
  ) {
    return { queued: false, reason: 'terminal' };
  }
  await markArticleBodyPending(db, input.itemId, extractorVersion, input.trigger, now);

  const baseMessage: ArticleBodyQueueMessage = {
    itemId: input.itemId,
    extractorVersion,
    trigger: input.trigger,
    enqueuedAt: now,
    ...(input.traceId ? { traceId: input.traceId } : {}),
  };
  const candidateMessage: ArticleBodyQueueMessage = {
    ...baseMessage,
    ...(input.embeddedCandidates?.length ? { embeddedCandidates: input.embeddedCandidates } : {}),
  };
  const parsedCandidateMessage = ArticleBodyQueueMessageSchema.safeParse(candidateMessage);
  const message = parsedCandidateMessage.success ? parsedCandidateMessage.data : baseMessage;
  try {
    await env.ARTICLE_BODY_QUEUE.send(message);
  } catch (error) {
    await markArticleBodyUnavailable(db, input.itemId, 'QUEUE_SEND_FAILED', { now });
    throw error;
  }
  return {
    queued: true,
    embeddedCandidatesIncluded: Boolean(message.embeddedCandidates?.length),
  };
}

export const articleBodyEnrollmentInternals = { isRetryableStoredFailure };
