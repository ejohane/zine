import { describe, expect, it } from 'bun:test';
import { resolveCollectorSource } from './source-config';

describe('collector source configuration', () => {
  it('uses an explicit Following source by default', () => {
    expect(resolveCollectorSource({})).toEqual({
      type: 'FOLLOWING',
      id: 'following',
      name: 'Following',
      url: 'https://x.com/home',
    });
  });

  it('derives and validates a stable X list id from the source URL', () => {
    expect(
      resolveCollectorSource({
        type: 'favorites',
        name: 'Favorites',
        url: 'https://x.com/i/lists/123/',
      })
    ).toEqual({
      type: 'FAVORITES',
      id: 'x-list:123',
      name: 'Favorites',
      url: 'https://x.com/i/lists/123',
    });
    expect(() =>
      resolveCollectorSource({
        type: 'FAVORITES',
        id: 'x-list:456',
        url: 'https://x.com/i/lists/123',
      })
    ).toThrow('must match the list URL');
  });

  it('rejects non-list and non-X URLs for list collection', () => {
    expect(() => resolveCollectorSource({ type: 'FAVORITES', url: 'https://x.com/home' })).toThrow(
      'x.com/i/lists'
    );
    expect(() =>
      resolveCollectorSource({ type: 'FAVORITES', url: 'https://example.com/i/lists/123' })
    ).toThrow('x.com/i/lists');
  });
});
