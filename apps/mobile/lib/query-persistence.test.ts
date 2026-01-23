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

  it('falls back to anon scope when user is missing', () => {
    expect(buildQueryPersistenceKey(undefined, 'buster')).toBe('zine:rq:anon:buster');
  });

  it('builds a buster from app and schema versions', () => {
    expect(buildQueryPersistenceBuster('1.2.3', '0.9.0')).toBe('1.2.3-0.9.0');
  });

  it('prefers EXPO_PUBLIC app and schema versions when set', () => {
    const originalAppVersion = process.env.EXPO_PUBLIC_APP_VERSION;
    const originalSchemaVersion = process.env.EXPO_PUBLIC_API_SCHEMA_VERSION;

    process.env.EXPO_PUBLIC_APP_VERSION = '9.9.9';
    process.env.EXPO_PUBLIC_API_SCHEMA_VERSION = '8.8.8';

    expect(buildQueryPersistenceBuster()).toBe('9.9.9-8.8.8');

    process.env.EXPO_PUBLIC_APP_VERSION = originalAppVersion;
    process.env.EXPO_PUBLIC_API_SCHEMA_VERSION = originalSchemaVersion;
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
    expect(isAllowlistedQueryKey([['items', 'get']])).toBe(true);
    expect(isAllowlistedQueryKey([['subscriptions', 'list']])).toBe(true);
    expect(isAllowlistedQueryKey([['subscriptions', 'connections', 'list']])).toBe(true);
    expect(isAllowlistedQueryKey([['creators', 'get']])).toBe(true);
    expect(isAllowlistedQueryKey([['creators', 'listBookmarks']])).toBe(true);
    expect(isAllowlistedQueryKey([['creators', 'checkSubscription']])).toBe(true);
    expect(isAllowlistedQueryKey([['bookmarks', 'preview']])).toBe(false);
    expect(isAllowlistedQueryKey([['subscriptions', 'syncStatus']])).toBe(false);
    expect(isAllowlistedQueryKey([['subscriptions', 'activeSyncJob']])).toBe(false);
    expect(isAllowlistedQueryKey([['creators', 'fetchLatestContent']])).toBe(false);
  });

  it('persists only successful allowlisted queries', () => {
    expect(shouldPersistQuery({ queryKey: [['items', 'home']], status: 'success' })).toBe(true);
    expect(shouldPersistQuery({ queryKey: [['items', 'home']], status: 'error' })).toBe(false);
    expect(shouldPersistQuery({ queryKey: [['bookmarks', 'preview']], status: 'success' })).toBe(
      false
    );
  });
});
