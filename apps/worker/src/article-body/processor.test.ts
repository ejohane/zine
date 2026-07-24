import { beforeEach, describe, expect, it, vi } from 'vitest';

const { acquireArticleBody, markArticleBodyUnavailable, publishArticleBodyArtifact } = vi.hoisted(
  () => ({
    acquireArticleBody: vi.fn(),
    markArticleBodyUnavailable: vi.fn(),
    publishArticleBodyArtifact: vi.fn(),
  })
);

vi.mock('./acquisition', () => ({ acquireArticleBody }));
vi.mock('./service', () => ({ markArticleBodyUnavailable, publishArticleBodyArtifact }));

import { articleBodyProcessorInternals, processArticleBodyQueueMessage } from './processor';
import type { RetryableArticleBodyError } from './processor';
import type { ArticleBodyArtifact, ArticleBodyQueueMessage } from './types';

const message: ArticleBodyQueueMessage = {
  itemId: 'item_1',
  extractorVersion: 1,
  trigger: 'backfill',
  enqueuedAt: 1_700_000_000_000,
};

const artifact: ArticleBodyArtifact = {
  schemaVersion: 1,
  extractorVersion: 1,
  itemId: 'item_1',
  canonicalUrl: 'https://example.com/story',
  title: 'A dependable story',
  byline: 'Author',
  publisher: 'Example',
  publishedAt: '2026-07-23T00:00:00.000Z',
  language: 'en',
  sourceKind: 'PUBLIC_WEB',
  sourceUrl: 'https://example.com/story',
  extractedAt: 1_700_000_000_000,
  contentHash: `sha256:${'a'.repeat(64)}`,
  wordCount: 700,
  readingTimeMinutes: 4,
  qualityScore: 0.94,
  qualityWarnings: [],
  sanitizedHtml: '<p>Story</p>',
  plainText: 'Story',
  blocks: [{ id: 'block_1', kind: 'paragraph', text: 'Story' }],
};

function createDb(item: Record<string, unknown> | undefined = {}) {
  const row = {
    id: 'item_1',
    contentType: 'ARTICLE',
    canonicalUrl: 'https://example.com/story',
    title: 'A dependable story',
    publisher: 'Example',
    publishedAt: '2026-07-23T00:00:00.000Z',
    byline: 'Author',
    ...item,
  };
  const limit = vi.fn().mockResolvedValue(item === undefined ? [] : [row]);
  const whereSelect = vi.fn().mockReturnValue({ limit });
  const leftJoin = vi.fn().mockReturnValue({ where: whereSelect });
  const from = vi.fn().mockReturnValue({ leftJoin });
  const select = vi.fn().mockReturnValue({ from });
  const whereUpdate = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where: whereUpdate });
  const update = vi.fn().mockReturnValue({ set });
  return { db: { select, update }, set };
}

describe('article-body processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('publishes a successful artifact and mirrors reading metrics onto the item', async () => {
    const { db, set } = createDb();
    acquireArticleBody.mockResolvedValue({
      status: 'AVAILABLE',
      artifact,
      attempts: [],
      errorCode: null,
      lastHttpStatus: 200,
    });

    await processArticleBodyQueueMessage(
      message,
      db as never,
      {
        ARTICLE_CONTENT: {},
      } as never
    );

    expect(acquireArticleBody).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item_1', canonicalUrl: artifact.canonicalUrl }),
      { extractorVersion: 1 }
    );
    expect(publishArticleBodyArtifact).toHaveBeenCalledWith(
      db,
      expect.anything(),
      artifact,
      'AVAILABLE'
    );
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ wordCount: 700, readingTimeMinutes: 4 })
    );
  });

  it('records terminal acquisition failures without retrying', async () => {
    const { db } = createDb();
    acquireArticleBody.mockResolvedValue({
      status: 'UNAVAILABLE',
      artifact: null,
      attempts: [],
      errorCode: 'NOT_READERABLE',
      lastHttpStatus: 200,
    });

    await processArticleBodyQueueMessage(message, db as never, {} as never);

    expect(markArticleBodyUnavailable).toHaveBeenCalledWith(db, 'item_1', 'NOT_READERABLE', {
      httpStatus: 200,
    });
  });

  it('throws a typed error for transient acquisition failures', async () => {
    const { db } = createDb();
    acquireArticleBody.mockResolvedValue({
      status: 'UNAVAILABLE',
      artifact: null,
      attempts: [],
      errorCode: 'HTTP_503',
      lastHttpStatus: 503,
    });

    await expect(processArticleBodyQueueMessage(message, db as never, {} as never)).rejects.toEqual(
      expect.objectContaining<Partial<RetryableArticleBodyError>>({
        errorCode: 'HTTP_503',
        httpStatus: 503,
      })
    );
  });

  it('marks non-article items terminally ineligible', async () => {
    const { db } = createDb({ contentType: 'VIDEO' });

    await processArticleBodyQueueMessage(message, db as never, {} as never);

    expect(markArticleBodyUnavailable).toHaveBeenCalledWith(db, 'item_1', 'ITEM_NOT_ELIGIBLE');
    expect(acquireArticleBody).not.toHaveBeenCalled();
  });

  it('classifies only transient network and HTTP failures as retryable', () => {
    expect(articleBodyProcessorInternals.isRetryableAcquisitionFailure('FETCH_TIMEOUT')).toBe(true);
    expect(articleBodyProcessorInternals.isRetryableAcquisitionFailure('HTTP_429')).toBe(true);
    expect(articleBodyProcessorInternals.isRetryableAcquisitionFailure('HTTP_503')).toBe(true);
    expect(articleBodyProcessorInternals.isRetryableAcquisitionFailure('HTTP_404')).toBe(false);
    expect(articleBodyProcessorInternals.isRetryableAcquisitionFailure('QUALITY_REJECTED')).toBe(
      false
    );
  });
});
