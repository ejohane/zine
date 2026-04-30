import { describe, expect, it } from 'vitest';

import { enrichmentConsumerInternals } from './consumer';

describe('enrichment consumer helpers', () => {
  it('normalizes, dedupes, caps, and matches suggested tags', () => {
    const suggestions = enrichmentConsumerInternals.normalizeSuggestedTags(
      [
        { name: ' Cloudflare ', kind: 'topic', confidence: 0.9 },
        { name: 'cloudflare', kind: 'entity', confidence: 0.7 },
        {
          name: 'This tag name is definitely longer than thirty two characters',
          kind: 'topic',
          confidence: 0.8,
        },
        { name: 'Workers AI', kind: 'entity', confidence: 0.85 },
      ],
      [
        {
          id: 'tag-cloudflare',
          name: 'Cloudflare',
          normalizedName: 'cloudflare',
        },
      ]
    );

    expect(suggestions).toEqual([
      {
        name: 'Cloudflare',
        normalizedName: 'cloudflare',
        kind: 'topic',
        confidence: 0.9,
        matchedExistingTagId: 'tag-cloudflare',
      },
      {
        name: 'Workers AI',
        normalizedName: 'workers ai',
        kind: 'entity',
        confidence: 0.85,
        matchedExistingTagId: null,
      },
    ]);
  });

  it('builds fallback user suggestions from complete canonical enrichment', () => {
    const modelTags = enrichmentConsumerInternals.buildTagsFromCanonical({
      topicsJson: JSON.stringify([{ name: 'recommendations', confidence: 0.88 }]),
      entitiesJson: JSON.stringify([{ name: 'Vectorize', confidence: 0.8 }]),
      intent: 'reference',
    } as never);

    expect(modelTags).toEqual([
      { name: 'recommendations', kind: 'topic', confidence: 0.88 },
      { name: 'Vectorize', kind: 'entity', confidence: 0.8 },
      { name: 'reference', kind: 'intent', confidence: 0.65 },
    ]);
  });
});
