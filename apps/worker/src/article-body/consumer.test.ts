import { beforeEach, describe, expect, it, vi } from 'vitest';

import { expectLoggerErrorCalls } from '../test/mock-logger';
import type { ArticleBodyQueueMessage } from './types';

const {
  createDb,
  markArticleBodyProcessing,
  markArticleBodyRetryScheduled,
  markArticleBodyUnavailable,
  getArticleBodyStatus,
  dlqValues,
  findItem,
} = vi.hoisted(() => ({
  createDb: vi.fn(),
  markArticleBodyProcessing: vi.fn(),
  markArticleBodyRetryScheduled: vi.fn(),
  markArticleBodyUnavailable: vi.fn(),
  getArticleBodyStatus: vi.fn(),
  dlqValues: vi.fn(),
  findItem: vi.fn(),
}));

vi.mock('../db', () => ({ createDb }));
vi.mock('./service', () => ({
  isArticleBodyPipelineEnabled: (env: { ARTICLE_BODY_PIPELINE_ENABLED?: string }) =>
    env.ARTICLE_BODY_PIPELINE_ENABLED?.trim().toLowerCase() === 'true',
  markArticleBodyProcessing,
  markArticleBodyRetryScheduled,
  markArticleBodyUnavailable,
  getArticleBodyStatus,
}));

import { handleArticleBodyDLQ, handleArticleBodyQueue } from './consumer';
import { RetryableArticleBodyError } from './processor';

function body(): ArticleBodyQueueMessage {
  return {
    itemId: 'item_1',
    extractorVersion: 1,
    trigger: 'bookmark',
    enqueuedAt: 1_700_000_000_000,
  };
}

function queueMessage(value: unknown = body(), attempts = 1) {
  return {
    id: 'message_1',
    timestamp: new Date(),
    body: value,
    attempts,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function batch(message: ReturnType<typeof queueMessage>, queue = 'zine-article-body-queue-dev') {
  return {
    queue,
    messages: [message],
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as never;
}

describe('article-body queue consumers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getArticleBodyStatus.mockResolvedValue(null);
    createDb.mockReturnValue({
      query: { items: { findFirst: findItem } },
      insert: vi.fn().mockReturnValue({ values: dlqValues }),
    });
  });

  it('acks without processing while the foundation flag is disabled', async () => {
    const message = queueMessage();
    const processor = vi.fn();

    await handleArticleBodyQueue(batch(message), { DB: {} } as never, processor);

    expect(message.ack).toHaveBeenCalledOnce();
    expect(processor).not.toHaveBeenCalled();
    expect(markArticleBodyProcessing).not.toHaveBeenCalled();
    expect(markArticleBodyUnavailable).toHaveBeenCalledWith(
      expect.anything(),
      'item_1',
      'PIPELINE_DISABLED',
      { attemptCount: 1 }
    );
  });

  it('acks invalid messages instead of retrying poison input', async () => {
    const message = queueMessage({ itemId: '' });

    await handleArticleBodyQueue(batch(message), { DB: {} } as never);

    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    expectLoggerErrorCalls([
      [
        'Invalid article-body queue message',
        expect.objectContaining({ event: 'article_body.queue.invalid', messageId: 'message_1' }),
      ],
    ]);
  });

  it('processes a valid enabled message and acknowledges success', async () => {
    const message = queueMessage();
    const processor = vi.fn().mockResolvedValue(undefined);
    const env = { DB: {}, ARTICLE_BODY_PIPELINE_ENABLED: 'true' } as never;

    await handleArticleBodyQueue(batch(message), env, processor);

    expect(markArticleBodyProcessing).toHaveBeenCalledWith(expect.anything(), 'item_1', 1);
    expect(processor).toHaveBeenCalledWith(body(), expect.anything(), env);
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it('acks an older extractor job without overwriting newer lifecycle state', async () => {
    const message = queueMessage();
    const processor = vi.fn();
    getArticleBodyStatus.mockResolvedValue({ targetExtractorVersion: 2 });

    await handleArticleBodyQueue(
      batch(message),
      { DB: {}, ARTICLE_BODY_PIPELINE_ENABLED: 'true' } as never,
      processor
    );

    expect(message.ack).toHaveBeenCalledOnce();
    expect(markArticleBodyProcessing).not.toHaveBeenCalled();
    expect(processor).not.toHaveBeenCalled();
  });

  it('acks a late duplicate after the same extractor version has already published', async () => {
    const message = queueMessage();
    const processor = vi.fn();
    getArticleBodyStatus.mockResolvedValue({
      status: 'AVAILABLE',
      targetExtractorVersion: 1,
      extractorVersion: 1,
      versionId: 'version_1',
    });

    await handleArticleBodyQueue(
      batch(message),
      { DB: {}, ARTICLE_BODY_PIPELINE_ENABLED: 'true' } as never,
      processor
    );

    expect(message.ack).toHaveBeenCalledOnce();
    expect(markArticleBodyProcessing).not.toHaveBeenCalled();
    expect(processor).not.toHaveBeenCalled();
  });

  it('retries processor failures with bounded backoff', async () => {
    const message = queueMessage(body(), 2);
    const processor = vi.fn().mockRejectedValue(new Error('not installed'));

    await handleArticleBodyQueue(
      batch(message),
      { DB: {}, ARTICLE_BODY_PIPELINE_ENABLED: 'true' } as never,
      processor
    );

    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 300 });
    expect(markArticleBodyRetryScheduled).toHaveBeenCalledWith(
      expect.anything(),
      'item_1',
      'PROCESSOR_FAILED',
      2,
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('preserves typed acquisition error codes in retry diagnostics', async () => {
    const message = queueMessage();
    const processor = vi
      .fn()
      .mockRejectedValue(new RetryableArticleBodyError('HTTP_503', 'upstream unavailable', 503));

    await handleArticleBodyQueue(
      batch(message),
      { DB: {}, ARTICLE_BODY_PIPELINE_ENABLED: 'true' } as never,
      processor
    );

    expect(markArticleBodyRetryScheduled).toHaveBeenCalledWith(
      expect.anything(),
      'item_1',
      'HTTP_503',
      1,
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('persists an aggregate-safe DLQ event and makes item state unavailable', async () => {
    const message = queueMessage(body(), 4);
    findItem.mockResolvedValue({ id: 'item_1' });

    await handleArticleBodyDLQ(batch(message, 'zine-article-body-dlq-dev'), { DB: {} } as never);

    expect(markArticleBodyUnavailable).toHaveBeenCalledWith(
      expect.anything(),
      'item_1',
      'QUEUE_RETRIES_EXHAUSTED',
      expect.objectContaining({ attemptCount: 4 })
    );
    expect(dlqValues).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item_1', attempts: 4 })
    );
    expect(message.ack).toHaveBeenCalledOnce();
    expectLoggerErrorCalls([
      [
        'Article-body message reached DLQ',
        expect.objectContaining({
          event: 'article_body.dlq.message_failed',
          itemId: 'item_1',
          attempts: 4,
        }),
      ],
    ]);
  });
});
