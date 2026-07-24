import { describe, expect, it, vi } from 'vitest';

import { buildArticleBodyArtifact } from './artifact';
import {
  getArticleBodyArtifact,
  getArticleBodyArtifactKey,
  putArticleBodyArtifact,
} from './storage';

async function artifact() {
  return buildArticleBodyArtifact({
    extractorVersion: 1,
    itemId: 'item/with spaces',
    canonicalUrl: 'https://example.com/story',
    title: 'Story',
    sourceKind: 'PUBLIC_WEB',
    sourceUrl: 'https://example.com/story',
    extractedAt: 1_700_000_000_000,
    wordCount: 1,
    readingTimeMinutes: 1,
    qualityScore: 1,
    sanitizedHtml: '<p>Body</p>',
    plainText: 'Body',
  });
}

describe('article-body R2 storage', () => {
  it('writes to a content-addressed immutable key', async () => {
    const value = await artifact();
    const get = vi.fn().mockResolvedValue(null);
    const put = vi.fn().mockResolvedValue(undefined);
    const result = await putArticleBodyArtifact({ get, put } as never, value);

    expect(result).toEqual({
      key: getArticleBodyArtifactKey(value.itemId, value.contentHash),
      created: true,
    });
    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0]?.[0]).toContain('articles/v2/item%2Fwith%20spaces/');
  });

  it('does not overwrite an existing valid artifact', async () => {
    const value = await artifact();
    const put = vi.fn();
    const bucket = {
      get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue(value) }),
      put,
    } as never;

    await expect(putArticleBodyArtifact(bucket, value)).resolves.toMatchObject({ created: false });
    expect(put).not.toHaveBeenCalled();
  });

  it('verifies integrity when reading', async () => {
    const value = await artifact();
    const key = getArticleBodyArtifactKey(value.itemId, value.contentHash);
    const validBucket = {
      get: vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue(value) }),
    } as never;
    const invalidBucket = {
      get: vi
        .fn()
        .mockResolvedValue({ json: vi.fn().mockResolvedValue({ ...value, plainText: 'bad' }) }),
    } as never;

    await expect(getArticleBodyArtifact(validBucket, key)).resolves.toEqual(value);
    await expect(getArticleBodyArtifact(invalidBucket, key)).rejects.toThrow(
      'failed integrity verification'
    );
  });
});
