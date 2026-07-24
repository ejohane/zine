import { describe, expect, it } from 'vitest';

import {
  getArticleBodyEnrollmentMode,
  isArticleBodyEnrollmentEnabled,
  isArticleBodyPipelineEnabled,
  toArticleBodyPublicStatus,
} from './service';
import type { ArticleBodyStatusRecord } from './service';

function record(overrides: Partial<ArticleBodyStatusRecord> = {}): ArticleBodyStatusRecord {
  return {
    status: 'AVAILABLE',
    targetExtractorVersion: 1,
    attemptCount: 1,
    lastErrorCode: null,
    lastHttpStatus: 200,
    lastAttemptAt: 1_700_000_000_000,
    nextAttemptAt: null,
    updatedAt: 1_700_000_000_000,
    versionId: 'version_1',
    schemaVersion: 1,
    extractorVersion: 1,
    sourceKind: 'RSS_FULL',
    contentHash: `sha256:${'a'.repeat(64)}`,
    r2Key: 'articles/v2/item_1/hash.json',
    wordCount: 500,
    readingTimeMinutes: 3,
    qualityScore: 0.95,
    qualityWarningsJson: '[]',
    ...overrides,
  };
}

describe('article-body public status', () => {
  it('keeps the foundation disabled unless explicitly enabled', () => {
    expect(isArticleBodyPipelineEnabled({})).toBe(false);
    expect(isArticleBodyPipelineEnabled({ ARTICLE_BODY_PIPELINE_ENABLED: 'false' })).toBe(false);
    expect(isArticleBodyPipelineEnabled({ ARTICLE_BODY_PIPELINE_ENABLED: ' TRUE ' })).toBe(true);
  });

  it('uses progressive enrollment modes and treats unknown values as off', () => {
    expect(getArticleBodyEnrollmentMode({})).toBe('off');
    expect(getArticleBodyEnrollmentMode({ ARTICLE_BODY_ENROLLMENT_MODE: 'unexpected' })).toBe(
      'off'
    );
    expect(getArticleBodyEnrollmentMode({ ARTICLE_BODY_ENROLLMENT_MODE: ' Saved ' })).toBe('saved');

    expect(
      isArticleBodyEnrollmentEnabled({ ARTICLE_BODY_ENROLLMENT_MODE: 'reader' }, 'reader_open')
    ).toBe(true);
    expect(
      isArticleBodyEnrollmentEnabled({ ARTICLE_BODY_ENROLLMENT_MODE: 'reader' }, 'bookmark')
    ).toBe(false);
    expect(
      isArticleBodyEnrollmentEnabled({ ARTICLE_BODY_ENROLLMENT_MODE: 'saved' }, 'bookmark')
    ).toBe(true);
    expect(
      isArticleBodyEnrollmentEnabled({ ARTICLE_BODY_ENROLLMENT_MODE: 'saved' }, 'ingestion')
    ).toBe(false);
    expect(
      isArticleBodyEnrollmentEnabled({ ARTICLE_BODY_ENROLLMENT_MODE: 'all' }, 'ingestion')
    ).toBe(true);
  });

  it('represents legacy and absent content explicitly', () => {
    expect(toArticleBodyPublicStatus(null, true)).toMatchObject({
      availability: 'AVAILABLE',
      pipelineStatus: 'LEGACY',
      sourceKind: 'LEGACY',
    });
    expect(toArticleBodyPublicStatus(null, false)).toMatchObject({
      availability: 'UNAVAILABLE',
      pipelineStatus: 'NOT_REQUESTED',
    });
  });

  it('never reports an available state without a current immutable version', () => {
    expect(
      toArticleBodyPublicStatus(record({ versionId: null, r2Key: null }), false)
    ).toMatchObject({
      availability: 'UNAVAILABLE',
      pipelineStatus: 'AVAILABLE',
      qualityWarnings: ['MISSING_CURRENT_VERSION'],
    });
  });

  it('keeps an existing body available while a replacement is processing', () => {
    expect(toArticleBodyPublicStatus(record({ status: 'PROCESSING' }), false)).toMatchObject({
      availability: 'AVAILABLE',
      pipelineStatus: 'PROCESSING',
      contentHash: `sha256:${'a'.repeat(64)}`,
    });
  });

  it('keeps the last good body readable as degraded when refresh is exhausted', () => {
    expect(
      toArticleBodyPublicStatus(
        record({ status: 'UNAVAILABLE', lastErrorCode: 'QUEUE_RETRIES_EXHAUSTED' }),
        false
      )
    ).toMatchObject({
      availability: 'DEGRADED',
      pipelineStatus: 'UNAVAILABLE',
      lastErrorCode: 'QUEUE_RETRIES_EXHAUSTED',
      qualityWarnings: ['LATEST_ACQUISITION_FAILED_USING_CURRENT_VERSION'],
    });
  });
});
