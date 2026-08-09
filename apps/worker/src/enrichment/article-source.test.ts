import { describe, expect, it } from 'vitest';

import type { ArticleBodyArtifact } from '../article-body/types';
import { articleSourceInternals, evidenceFromArticleArtifact } from './article-source';
import type { EnrichmentSourceItem } from './types';

function sourceItem(summary: string | null): EnrichmentSourceItem {
  return {
    id: 'item-1',
    title: 'An article',
    canonicalUrl: 'https://example.com/article',
    contentType: 'ARTICLE',
    provider: 'WEB',
    publisher: 'Example',
    summary,
    rawMetadata: null,
    articleContentKey: null,
  };
}

function artifact(): ArticleBodyArtifact {
  return {
    schemaVersion: 1,
    extractorVersion: 9,
    itemId: 'item-1',
    canonicalUrl: 'https://example.com/article',
    title: 'An article',
    byline: 'Example Author',
    publisher: 'Example',
    publishedAt: null,
    language: 'en',
    sourceKind: 'PUBLIC_WEB',
    sourceUrl: 'https://example.com/article',
    extractedAt: 1,
    contentHash: `sha256:${'a'.repeat(64)}`,
    wordCount: 4,
    readingTimeMinutes: 1,
    qualityScore: 0.94,
    qualityWarnings: [],
    sanitizedHtml: '<p>First paragraph.</p><p>Second paragraph.</p>',
    plainText: 'First paragraph. Second paragraph.',
    blocks: [
      { id: 'block-1', kind: 'paragraph', text: 'First paragraph.' },
      { id: 'block-2', kind: 'paragraph', text: 'Second paragraph.' },
    ],
  };
}

describe('article enrichment source evidence', () => {
  it('preserves current artifact provenance and semantic blocks', () => {
    expect(evidenceFromArticleArtifact(artifact(), 'AVAILABLE')).toEqual({
      coverage: 'FULL_CONTENT',
      sourceKind: 'PUBLIC_WEB',
      contentHash: `sha256:${'a'.repeat(64)}`,
      wordCount: 4,
      qualityScore: 0.94,
      qualityWarnings: [],
      blocks: [
        { id: 'block-1', kind: 'paragraph', text: 'First paragraph.' },
        { id: 'block-2', kind: 'paragraph', text: 'Second paragraph.' },
      ],
    });
  });

  it('labels degraded artifacts as partial content', () => {
    expect(evidenceFromArticleArtifact(artifact(), 'DEGRADED').coverage).toBe('PARTIAL_CONTENT');
  });

  it('hashes the actual normalized legacy body and labels it partial', async () => {
    const evidence = await articleSourceInternals.evidenceFromLegacyContent(
      '<article><p>The &amp; complete body.</p></article>'
    );

    expect(evidence.coverage).toBe('PARTIAL_CONTENT');
    expect(evidence.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(evidence.blocks[0]?.text).toBe('The & complete body.');
    expect(evidence.qualityWarnings).toEqual(['LEGACY_UNNORMALIZED']);
  });

  it('distinguishes description-only from metadata-only evidence', () => {
    expect(articleSourceInternals.metadataEvidence(sourceItem('A description.')).coverage).toBe(
      'DESCRIPTION_ONLY'
    );
    expect(articleSourceInternals.metadataEvidence(sourceItem(null)).coverage).toBe(
      'METADATA_ONLY'
    );
  });
});
