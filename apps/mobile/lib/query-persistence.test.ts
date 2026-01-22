import {
  buildQueryPersistenceBuster,
  buildQueryPersistenceKey,
  getQueryPathFromKey,
  isAllowlistedQueryKey,
  shouldPersistQuery,
} from './query-persistence';

describe('query persistence helpers', () => {
  it('builds a user-scoped persistence key', () => {
    expect(buildQueryPersistenceKey('user-123', 'buster')).toBe('zine:rq:user-123:buster');
  });

  it('falls back to anonymous scope when user is missing', () => {
    expect(buildQueryPersistenceKey(undefined, 'buster')).toBe('zine:rq:anonymous:buster');
  });

  it('builds a buster from app and schema versions', () => {
    expect(buildQueryPersistenceBuster('1.2.3', '0.9.0')).toBe('1.2.3-0.9.0');
  });

  it('extracts query paths from tRPC-style keys', () => {
    expect(getQueryPathFromKey([['items', 'home']])).toBe('items.home');
    expect(getQueryPathFromKey(['items', 'home'])).toBe('items.home');
    expect(getQueryPathFromKey(['items.home'])).toBe('items.home');
    expect(getQueryPathFromKey(['items.home', { filter: 'recent' }])).toBe('items.home');
    expect(getQueryPathFromKey([{ key: 'value' }])).toBeNull();
  });

  it('allowlists core UX queries only', () => {
    expect(isAllowlistedQueryKey([['items', 'inbox']])).toBe(true);
    expect(isAllowlistedQueryKey(['items', 'library'])).toBe(true);
    expect(isAllowlistedQueryKey([['bookmarks', 'preview']])).toBe(false);
  });

  it('persists only successful allowlisted queries', () => {
    expect(shouldPersistQuery({ queryKey: [['items', 'home']], status: 'success' })).toBe(true);
    expect(shouldPersistQuery({ queryKey: [['items', 'home']], status: 'error' })).toBe(false);
    expect(shouldPersistQuery({ queryKey: [['bookmarks', 'preview']], status: 'success' })).toBe(
      false
    );
  });
});
