import { describe, expect, it } from 'vitest';

import {
  buildArticleBodyArtifact,
  verifyArticleBodyArtifactIntegrity,
  type BuildArticleBodyArtifactInput,
} from './artifact';

function input(
  overrides: Partial<BuildArticleBodyArtifactInput> = {}
): BuildArticleBodyArtifactInput {
  return {
    extractorVersion: 1,
    itemId: 'item_1',
    canonicalUrl: 'https://example.com/story',
    title: 'A dependable body',
    byline: 'A. Writer',
    publisher: 'Example',
    publishedAt: '2026-07-23T12:00:00.000Z',
    language: 'en',
    sourceKind: 'RSS_FULL',
    sourceUrl: 'https://example.com/feed.xml',
    extractedAt: 1_700_000_000_000,
    wordCount: 2,
    readingTimeMinutes: 1,
    qualityScore: 0.98,
    sanitizedHtml: '<p>Hello world</p>',
    plainText: 'Hello world',
    blocks: [{ id: 'p1', kind: 'paragraph', text: 'Hello world' }],
    ...overrides,
  };
}

describe('article-body artifacts', () => {
  it('uses a deterministic content identity independent of extraction time', async () => {
    const first = await buildArticleBodyArtifact(input());
    const replay = await buildArticleBodyArtifact(
      input({ extractedAt: first.extractedAt + 1_000 })
    );

    expect(replay.contentHash).toBe(first.contentHash);
    expect(await verifyArticleBodyArtifactIntegrity(first)).toBe(true);
  });

  it('changes identity when normalized body content changes', async () => {
    const first = await buildArticleBodyArtifact(input());
    const changed = await buildArticleBodyArtifact(
      input({ sanitizedHtml: '<p>Changed</p>', plainText: 'Changed' })
    );

    expect(changed.contentHash).not.toBe(first.contentHash);
  });

  it('detects a modified artifact', async () => {
    const artifact = await buildArticleBodyArtifact(input());

    expect(await verifyArticleBodyArtifactIntegrity({ ...artifact, plainText: 'tampered' })).toBe(
      false
    );
  });
});
