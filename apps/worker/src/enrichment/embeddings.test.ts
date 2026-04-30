import { describe, expect, it } from 'vitest';

import { buildVectorId, getVectorVisibility } from './embeddings';

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
});
