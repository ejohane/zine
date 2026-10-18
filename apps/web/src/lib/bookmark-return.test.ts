import { describe, expect, test } from 'vitest';
import { bookmarkReturnDestination } from './bookmark-return';

describe('bookmark return destination', () => {
  test('retains only exact bookmark paths', () => {
    expect(bookmarkReturnDestination('?returnTo=%2Fitem%2Fa-public')).toBe('/item/a-public');
    for (const value of [
      'https://evil.example/item/a',
      '//evil.example',
      '/item/../settings',
      '/item/a?token=x',
      '/item/a#x',
      '/item/a/b',
      '/item/%2Fevil',
      '/settings',
      '/item/',
    ]) {
      expect(bookmarkReturnDestination(`?returnTo=${encodeURIComponent(value)}`)).toBeNull();
    }
  });
});
