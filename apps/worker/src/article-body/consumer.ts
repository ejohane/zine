import { ulid } from 'ulid';

import { createDb, type Database } from '../db';
import { articleBodyDlqEvents } from '../db/schema';
import { logger } from '../lib/logger';
import type { Bindings } from '../types';
import { processArticleBodyQueueMessage, RetryableArticleBodyError } from './processor';
import { ArticleBodyQueueMessageSchema } from './schema';
import {
  getArticleBodyStatus,
  isRetryableStoredFailure,
  isArticleBodyPipelineEnabled,
  markArticleBodyProcessing,
  markArticleBodyRetryScheduled,
  markArticleBodyUnavailable,
} from './service';
import type { ArticleBodyQueueMessage } from './types';

const articleBodyLogger = logger.child('article-body-consumer');

export type ArticleBodyProcessor = (
  message: ArticleBodyQueueMessage,
  db: Database,
  env: Bindings
) => Promise<void>;

export async function handleArticleBodyQueue(
  batch: MessageBatch<ArticleBodyQueueMessage>,
  env: Bindings,
  processor: ArticleBodyProcessor = processArticleBodyQueueMessage
): Promise<void> {
  const enabled = isArticleBodyPipelineEnabled(env);
  const db = createDb(env.DB);

  for (const message of batch.messages) {
    const parsed = ArticleBodyQueueMessageSchema.safeParse(message.body);
    if (!parsed.success) {
      articleBodyLogger.error('Invalid article-body queue message', {
        operation: 'article_body.queue',
        event: 'article_body.queue.invalid',
        messageId: message.id,
        error: parsed.error.message,
      });
      message.ack();
      continue;
    }

    if (!enabled) {
      await markArticleBodyUnavailable(db, parsed.data.itemId, 'PIPELINE_DISABLED', {
        attemptCount: message.attempts,
      });
      articleBodyLogger.info('Article-body pipeline disabled; acknowledging queued message', {
        operation: 'article_body.queue',
        event: 'article_body.queue.disabled',
        messageId: message.id,
        itemId: parsed.data.itemId,
      });
      message.ack();
      continue;
    }

    const current = await getArticleBodyStatus(db, parsed.data.itemId);
    if (current && current.targetExtractorVersion > parsed.data.extractorVersion) {
      articleBodyLogger.info('Stale article-body queue message acknowledged', {
        operation: 'article_body.queue',
        event: 'article_body.queue.stale',
        messageId: message.id,
        itemId: parsed.data.itemId,
        messageExtractorVersion: parsed.data.extractorVersion,
        targetExtractorVersion: current.targetExtractorVersion,
      });
      message.ack();
      continue;
    }
    if (
      current?.versionId &&
      (current.status === 'AVAILABLE' || current.status === 'DEGRADED') &&
      (current.extractorVersion ?? 0) >= parsed.data.extractorVersion
    ) {
      articleBodyLogger.info('Completed article-body queue message acknowledged', {
        operation: 'article_body.queue',
        event: 'article_body.queue.completed',
        messageId: message.id,
        itemId: parsed.data.itemId,
        messageExtractorVersion: parsed.data.extractorVersion,
        currentExtractorVersion: current.extractorVersion,
      });
      message.ack();
      continue;
    }
    if (
      current?.status === 'UNAVAILABLE' &&
      current.targetExtractorVersion >= parsed.data.extractorVersion &&
      current.updatedAt >= parsed.data.enqueuedAt &&
      !isRetryableStoredFailure(current.lastErrorCode)
    ) {
      articleBodyLogger.info('Terminal article-body queue message acknowledged', {
        operation: 'article_body.queue',
        event: 'article_body.queue.terminal',
        messageId: message.id,
        itemId: parsed.data.itemId,
        errorCode: current.lastErrorCode,
      });
      message.ack();
      continue;
    }

    try {
      await markArticleBodyProcessing(db, parsed.data.itemId, message.attempts);
      await processor(parsed.data, db, env);
      message.ack();
    } catch (error) {
      const delaySeconds = Math.min(60 * 60, 60 * 5 ** Math.max(0, message.attempts - 1));
      const errorCode =
        error instanceof RetryableArticleBodyError ? error.errorCode : 'PROCESSOR_FAILED';
      const now = Date.now();
      await markArticleBodyRetryScheduled(
        db,
        parsed.data.itemId,
        errorCode,
        message.attempts,
        now + delaySeconds * 1_000,
        now
      );
      articleBodyLogger.warn('Article-body queue message will retry', {
        operation: 'article_body.queue',
        event: 'article_body.queue.retry',
        messageId: message.id,
        itemId: parsed.data.itemId,
        attempts: message.attempts,
        error: error instanceof Error ? error.message : String(error),
      });
      message.retry({ delaySeconds });
    }
  }
}

export async function handleArticleBodyDLQ(
  batch: MessageBatch<ArticleBodyQueueMessage>,
  env: Bindings
): Promise<void> {
  const db = createDb(env.DB);
  const now = Date.now();

  for (const message of batch.messages) {
    const parsed = ArticleBodyQueueMessageSchema.safeParse(message.body);
    let itemId: string | null = null;

    if (parsed.success) {
      const item = await db.query.items.findFirst({
        where: (table, { eq }) => eq(table.id, parsed.data.itemId),
        columns: { id: true },
      });
      itemId = item?.id ?? null;

      if (itemId) {
        await markArticleBodyUnavailable(db, itemId, 'QUEUE_RETRIES_EXHAUSTED', {
          attemptCount: message.attempts,
          now,
        });
      }
    }

    await db.insert(articleBodyDlqEvents).values({
      id: ulid(),
      itemId,
      extractorVersion: parsed.success ? parsed.data.extractorVersion : null,
      trigger: parsed.success ? parsed.data.trigger : null,
      attempts: message.attempts,
      errorCode: parsed.success ? 'QUEUE_RETRIES_EXHAUSTED' : 'INVALID_MESSAGE',
      deadLetteredAt: now,
    });

    articleBodyLogger.error('Article-body message reached DLQ', {
      operation: 'article_body.dlq',
      event: 'article_body.dlq.message_failed',
      messageId: message.id,
      itemId,
      attempts: message.attempts,
      errorCode: parsed.success ? 'QUEUE_RETRIES_EXHAUSTED' : 'INVALID_MESSAGE',
    });
    message.ack();
  }
}
