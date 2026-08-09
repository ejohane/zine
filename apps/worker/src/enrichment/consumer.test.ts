import { afterEach, describe, expect, it, vi } from 'vitest';

import { enrichmentConsumerInternals } from './consumer';

describe('enrichment consumer helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('marks canonical and per-user enrichment failed when retries reach the DLQ', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T17:30:00.000Z'));
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    const error = new Error('Enrichment message exhausted retries');

    await enrichmentConsumerInternals.markDlqFailed(
      { update, insert } as never,
      {
        itemId: 'item-1',
        userItemId: 'user-item-1',
        userId: 'user-1',
        trigger: 'backfill',
        schemaVersion: 3,
        contentHash: `sha256:${'a'.repeat(64)}`,
        enqueuedAt: Date.now(),
      },
      error
    );

    expect(set).toHaveBeenCalledWith({
      status: 'FAILED',
      errorMessage: error.message,
      updatedAt: Date.now(),
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        userItemId: 'user-item-1',
        itemId: 'item-1',
        status: 'FAILED',
        errorMessage: error.message,
      })
    );
  });
});
