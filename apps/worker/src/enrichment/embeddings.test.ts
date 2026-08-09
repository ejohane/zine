import { describe, expect, it } from 'vitest';

import {
  buildChunkVectorId,
  buildVectorId,
  embeddingInternals,
  getVectorVisibility,
} from './embeddings';

describe('embedding privacy helpers', () => {
  it('uses public vectors for non-private providers', () => {
    expect(getVectorVisibility('WEB')).toBe('public');
    expect(
      buildVectorId({
        itemId: 'item-1',
        userId: 'user-1',
        provider: 'WEB',
      })
    ).toBe('item:item-1');
  });

  it('uses user-scoped vectors for Gmail content', () => {
    expect(getVectorVisibility('GMAIL')).toBe('user');
    expect(
      buildVectorId({
        itemId: 'item-1',
        userId: 'user-1',
        provider: 'GMAIL',
      })
    ).toBe('user:user-1:item:item-1');
  });

  it('versions article chunk vectors by the actual source body hash', () => {
    const first = buildChunkVectorId({
      itemId: 'item-1',
      userId: 'user-1',
      provider: 'WEB',
      sourceContentHash: `sha256:${'a'.repeat(64)}`,
      ordinal: 2,
    });
    const changed = buildChunkVectorId({
      itemId: 'item-1',
      userId: 'user-1',
      provider: 'WEB',
      sourceContentHash: `sha256:${'b'.repeat(64)}`,
      ordinal: 2,
    });

    expect(first).toContain(':content:');
    expect(first).toContain(':chunk:2');
    expect(first).not.toBe(changed);
  });

  it('extracts a vector for every batched chunk', () => {
    expect(
      embeddingInternals.extractEmbeddings({
        data: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
      })
    ).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });
});
