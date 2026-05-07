import { describe, expect, it } from 'vitest';

import { buildVectorId, buildVectorMetadata, getVectorVisibility } from './embeddings';

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

  it('builds Vectorize-compatible public metadata without null fields', () => {
    expect(
      buildVectorMetadata(
        {
          itemId: 'item-1',
          userId: 'user-1',
          provider: 'WEB',
          contentType: 'ARTICLE',
          primaryCategory: null,
        },
        'public'
      )
    ).toEqual({
      itemId: 'item-1',
      provider: 'WEB',
      contentType: 'ARTICLE',
      visibility: 'public',
    });
  });

  it('includes user and category metadata for private vectors', () => {
    expect(
      buildVectorMetadata(
        {
          itemId: 'item-1',
          userId: 'user-1',
          provider: 'GMAIL',
          contentType: 'EMAIL',
          primaryCategory: 'work',
        },
        'user'
      )
    ).toEqual({
      itemId: 'item-1',
      userId: 'user-1',
      provider: 'GMAIL',
      contentType: 'EMAIL',
      primaryCategory: 'work',
      visibility: 'user',
    });
  });
});
