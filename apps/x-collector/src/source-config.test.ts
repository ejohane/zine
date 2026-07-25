import { describe, expect, it } from 'bun:test';
import { resolveCollectionConfig, resolveCollectorSource } from './source-config';

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

  it('uses a count target for Following and a rolling 24-hour window for Favorites', () => {
    const startedAt = '2026-07-25T18:00:00.000Z';
    expect(
      resolveCollectionConfig({
        source: resolveCollectorSource({}),
        count: '500',
        startedAt,
      })
    ).toEqual({ requestedCount: 500, collectionPolicy: { mode: 'COUNT' } });

    expect(
      resolveCollectionConfig({
        source: resolveCollectorSource({
          type: 'FAVORITES',
          url: 'https://x.com/i/lists/123',
        }),
        startedAt,
      })
    ).toEqual({
      requestedCount: 5_000,
      collectionPolicy: {
        mode: 'ROLLING_WINDOW',
        windowHours: 24,
        cutoffAt: '2026-07-24T18:00:00.000Z',
        boundaryEvidenceRequired: 3,
      },
    });
  });

  it('rejects a count-limited Favorites collection', () => {
    expect(() =>
      resolveCollectionConfig({
        source: resolveCollectorSource({
          type: 'FAVORITES',
          url: 'https://x.com/i/lists/123',
        }),
        count: '500',
        startedAt: '2026-07-25T18:00:00.000Z',
      })
    ).toThrow('uses --window-hours and --safety-limit');
  });
});
