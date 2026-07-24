import { describe, expect, it, vi } from 'vitest';

import { ARTICLE_BODY_QUEUE_CANDIDATE_MAX_BYTES } from './schema';
import { enqueueArticleBody } from './service';
import type { ArticleBodyStatusRecord } from './service';
import { ARTICLE_BODY_EXTRACTOR_VERSION } from './types';

function createDb(status: ArticleBodyStatusRecord | null) {
  const limit = vi.fn().mockResolvedValue(status ? [status] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin });
  const select = vi.fn().mockReturnValue({ from });
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  const insert = vi.fn().mockReturnValue({ values });
  return { select, insert };
}

function status(overrides: Partial<ArticleBodyStatusRecord> = {}): ArticleBodyStatusRecord {
  return {
    status: 'PENDING',
    targetExtractorVersion: ARTICLE_BODY_EXTRACTOR_VERSION,
    attemptCount: 0,
    lastErrorCode: null,
    lastHttpStatus: null,
    lastAttemptAt: null,
    nextAttemptAt: null,
    updatedAt: 1,
    versionId: null,
    schemaVersion: null,
    extractorVersion: null,
    sourceKind: null,
    contentHash: null,
    r2Key: null,
    wordCount: null,
    readingTimeMinutes: null,
    qualityScore: null,
    qualityWarningsJson: null,
    ...overrides,
  };
}

describe('article-body enqueue', () => {
  it('does not duplicate a pending job at the same extractor version', async () => {
    const db = createDb(status());
    const send = vi.fn();
    const result = await enqueueArticleBody(
      db as never,
      { ARTICLE_BODY_PIPELINE_ENABLED: 'true', ARTICLE_BODY_QUEUE: { send } as never },
      { itemId: 'item_1', trigger: 'backfill' }
    );

    expect(result).toEqual({ queued: false, reason: 'already_queued' });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not replace a current artifact outside an explicit repair', async () => {
    const db = createDb(
      status({
        status: 'AVAILABLE',
        versionId: 'version_1',
        extractorVersion: ARTICLE_BODY_EXTRACTOR_VERSION,
      })
    );
    const send = vi.fn();
    const result = await enqueueArticleBody(
      db as never,
      { ARTICLE_BODY_PIPELINE_ENABLED: 'true', ARTICLE_BODY_QUEUE: { send } as never },
      { itemId: 'item_1', trigger: 'backfill' }
    );

    expect(result).toEqual({ queued: false, reason: 'current' });
    expect(send).not.toHaveBeenCalled();
  });

  it('does not repeat a terminal failure at the current extractor version', async () => {
    const db = createDb(
      status({
        status: 'UNAVAILABLE',
        lastErrorCode: 'NOT_READERABLE',
        targetExtractorVersion: ARTICLE_BODY_EXTRACTOR_VERSION,
      })
    );
    const send = vi.fn();
    const result = await enqueueArticleBody(
      db as never,
      { ARTICLE_BODY_PIPELINE_ENABLED: 'true', ARTICLE_BODY_QUEUE: { send } as never },
      { itemId: 'item_1', trigger: 'reader_open' }
    );

    expect(result).toEqual({ queued: false, reason: 'terminal' });
    expect(send).not.toHaveBeenCalled();
  });

  it('allows a reader request to retry a transient stored failure', async () => {
    const db = createDb(
      status({
        status: 'UNAVAILABLE',
        lastErrorCode: 'HTTP_503',
        targetExtractorVersion: ARTICLE_BODY_EXTRACTOR_VERSION,
      })
    );
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await enqueueArticleBody(
      db as never,
      { ARTICLE_BODY_PIPELINE_ENABLED: 'true', ARTICLE_BODY_QUEUE: { send } as never },
      { itemId: 'item_1', trigger: 'reader_open' }
    );

    expect(result).toMatchObject({ queued: true });
    expect(send).toHaveBeenCalledOnce();
  });

  it('allows reader demand to repair a job after bounded queue retries are exhausted', async () => {
    const db = createDb(
      status({
        status: 'UNAVAILABLE',
        lastErrorCode: 'QUEUE_RETRIES_EXHAUSTED',
        targetExtractorVersion: ARTICLE_BODY_EXTRACTOR_VERSION,
      })
    );
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await enqueueArticleBody(
      db as never,
      { ARTICLE_BODY_PIPELINE_ENABLED: 'true', ARTICLE_BODY_QUEUE: { send } as never },
      { itemId: 'item_1', trigger: 'reader_open' }
    );

    expect(result).toMatchObject({ queued: true });
    expect(send).toHaveBeenCalledOnce();
  });

  it('includes a bounded embedded candidate in the queue job', async () => {
    const db = createDb(null);
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await enqueueArticleBody(
      db as never,
      { ARTICLE_BODY_PIPELINE_ENABLED: 'true', ARTICLE_BODY_QUEUE: { send } as never },
      {
        itemId: 'item_1',
        trigger: 'ingestion',
        embeddedCandidates: [
          {
            html: '<article><p>Full body</p></article>',
            sourceKind: 'RSS_FULL',
            sourceUrl: 'https://example.com/feed.xml',
          },
        ],
      }
    );

    expect(result).toMatchObject({ queued: true, embeddedCandidatesIncluded: true });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ embeddedCandidates: expect.any(Array) })
    );
  });

  it('drops an oversized embedded candidate but still queues public fallback', async () => {
    const db = createDb(null);
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await enqueueArticleBody(
      db as never,
      { ARTICLE_BODY_PIPELINE_ENABLED: 'true', ARTICLE_BODY_QUEUE: { send } as never },
      {
        itemId: 'item_1',
        trigger: 'ingestion',
        embeddedCandidates: [
          {
            html: 'x'.repeat(ARTICLE_BODY_QUEUE_CANDIDATE_MAX_BYTES),
            sourceKind: 'RSS_FULL',
            sourceUrl: 'https://example.com/feed.xml',
          },
        ],
      }
    );

    expect(result).toMatchObject({ queued: true, embeddedCandidatesIncluded: false });
    expect(send).toHaveBeenCalledWith(
      expect.not.objectContaining({ embeddedCandidates: expect.anything() })
    );
  });
});
