import { and, eq } from 'drizzle-orm';
import { UserItemState } from '@zine/shared';

import type { Database } from '../db';
import { creators, items, userItems } from '../db/schema';
import { getItemContentHash } from '../enrichment/service';
import { shouldUseArticleUnderstanding } from '../enrichment/article-understanding-rollout';
import { ENRICHMENT_SCHEMA_VERSION, type EnrichmentQueueMessage } from '../enrichment/types';
import { logger } from '../lib/logger';
import type { Bindings } from '../types';
import { acquireArticleBody } from './acquisition';
import {
  markArticleBodyUnavailable,
  publishArticleBodyArtifact,
  resolveArticleBodyDlqEvents,
} from './service';
import type { ArticleBodyQueueMessage } from './types';

const processorLogger = logger.child('article-body-processor');

export class RetryableArticleBodyError extends Error {
  constructor(
    public readonly errorCode: string,
    message: string,
    public readonly httpStatus: number | null = null
  ) {
    super(message);
    this.name = 'RetryableArticleBodyError';
  }
}

async function enqueuePublishedArticleEnrichment(
  db: Database,
  env: Bindings,
  itemId: string
): Promise<number> {
  if (!shouldUseArticleUnderstanding(env.ARTICLE_UNDERSTANDING_MODE, 'article_body_ready')) {
    return 0;
  }
  const queue = env.ENRICHMENT_QUEUE as Queue<EnrichmentQueueMessage> | undefined;
  if (!queue) return 0;
  const contentHash = await getItemContentHash(db, itemId);
  if (!contentHash) return 0;
  const relationships = await db
    .select({ id: userItems.id, userId: userItems.userId })
    .from(userItems)
    .where(and(eq(userItems.itemId, itemId), eq(userItems.state, UserItemState.BOOKMARKED)));

  await Promise.all(
    relationships.map((relationship) =>
      queue.send({
        itemId,
        userItemId: relationship.id,
        userId: relationship.userId,
        trigger: 'article_body_ready',
        schemaVersion: ENRICHMENT_SCHEMA_VERSION,
        contentHash,
        enqueuedAt: Date.now(),
      })
    )
  );
  return relationships.length;
}

function isRetryableAcquisitionFailure(errorCode: string | null): boolean {
  if (!errorCode) return false;
  if (errorCode === 'FETCH_FAILED' || errorCode === 'FETCH_TIMEOUT') return true;
  const match = /^HTTP_(\d{3})$/.exec(errorCode);
  if (!match) return false;
  const status = Number(match[1]);
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export async function processArticleBodyQueueMessage(
  message: ArticleBodyQueueMessage,
  db: Database,
  env: Bindings
): Promise<void> {
  const rows = await db
    .select({
      id: items.id,
      contentType: items.contentType,
      canonicalUrl: items.canonicalUrl,
      title: items.title,
      publisher: items.publisher,
      publishedAt: items.publishedAt,
      byline: creators.name,
    })
    .from(items)
    .leftJoin(creators, eq(items.creatorId, creators.id))
    .where(eq(items.id, message.itemId))
    .limit(1);
  const item = rows[0];

  if (!item) {
    processorLogger.info('Article-body item no longer exists; acknowledging job', {
      operation: 'article_body.process',
      event: 'article_body.process.item_missing',
      itemId: message.itemId,
    });
    return;
  }

  if (item.contentType !== 'ARTICLE') {
    await markArticleBodyUnavailable(db, item.id, 'ITEM_NOT_ELIGIBLE');
    return;
  }

  const result = await acquireArticleBody(
    {
      itemId: item.id,
      canonicalUrl: item.canonicalUrl,
      title: item.title,
      byline: item.byline,
      publisher: item.publisher,
      publishedAt: item.publishedAt,
      embeddedCandidates: message.embeddedCandidates,
    },
    { extractorVersion: message.extractorVersion }
  );

  if (!result.artifact) {
    if (isRetryableAcquisitionFailure(result.errorCode)) {
      throw new RetryableArticleBodyError(
        result.errorCode ?? 'ACQUISITION_FAILED',
        `Article-body acquisition failed for ${item.id}`,
        result.lastHttpStatus
      );
    }
    await markArticleBodyUnavailable(db, item.id, result.errorCode ?? 'NO_ACCEPTABLE_BODY', {
      httpStatus: result.lastHttpStatus,
    });
    await resolveArticleBodyDlqEvents(db, item.id, message.extractorVersion);
    return;
  }

  try {
    const publicationStatus = result.status === 'DEGRADED' ? 'DEGRADED' : 'AVAILABLE';
    await publishArticleBodyArtifact(db, env.ARTICLE_CONTENT, result.artifact, publicationStatus);
    await db
      .update(items)
      .set({
        wordCount: result.artifact.wordCount,
        readingTimeMinutes: result.artifact.readingTimeMinutes,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(items.id, item.id));
  } catch (error) {
    throw new RetryableArticleBodyError(
      'PUBLISH_FAILED',
      error instanceof Error ? error.message : 'Article-body publication failed'
    );
  }

  try {
    const enrichmentJobs = await enqueuePublishedArticleEnrichment(db, env, item.id);
    if (enrichmentJobs > 0) {
      processorLogger.info('Article understanding queued after body publication', {
        operation: 'article_body.process',
        event: 'article_body.process.enrichment_queued',
        itemId: item.id,
        enrichmentJobs,
      });
    }
  } catch (error) {
    processorLogger.warn('Article body published but understanding enqueue failed', {
      operation: 'article_body.process',
      event: 'article_body.process.enrichment_enqueue_failed',
      itemId: item.id,
      error,
    });
  }

  processorLogger.info('Article body published', {
    operation: 'article_body.process',
    event: 'article_body.process.published',
    itemId: item.id,
    trigger: message.trigger,
    sourceKind: result.artifact.sourceKind,
    status: result.status,
    wordCount: result.artifact.wordCount,
    qualityScore: result.artifact.qualityScore,
  });
}

export const articleBodyProcessorInternals = {
  enqueuePublishedArticleEnrichment,
  isRetryableAcquisitionFailure,
};
