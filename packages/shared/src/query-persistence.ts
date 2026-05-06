export const QUERY_PERSISTENCE_STORAGE_PREFIX = 'zine:rq:';
export const QUERY_PERSISTENCE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export type QueryPersistenceStatus = 'pending' | 'error' | 'success';

const ALLOWLISTED_QUERY_PATHS = new Set([
  'items.home',
  'items.inbox',
  'items.library',
  'items.get',
  'insights.weeklyRecap',
  'insights.weeklyRecapTeaser',
  'subscriptions.list',
  'subscriptions.connections.list',
  'creators.get',
  'creators.listBookmarks',
  'creators.listPublications',
  'creators.checkSubscription',
]);

const BLOCKLISTED_QUERY_PATHS = new Set([
  'bookmarks.preview',
  'subscriptions.syncStatus',
  'subscriptions.activeSyncJob',
  'creators.fetchLatestContent',
]);

export function buildQueryPersistenceBuster(appVersion: string, schemaVersion: string): string {
  return `${appVersion}-${schemaVersion}`;
}

export function buildQueryPersistenceKey(
  userId: string | null | undefined,
  buster: string
): string {
  const scopedUser = userId ?? 'anon';
  return `${QUERY_PERSISTENCE_STORAGE_PREFIX}${scopedUser}:${buster}`;
}

export function getQueryPathFromKey(queryKey: unknown): string | null {
  if (!Array.isArray(queryKey) || queryKey.length === 0) {
    return null;
  }

  const [path, ...rest] = queryKey;

  if (Array.isArray(path)) {
    return path.join('.');
  }

  if (typeof path === 'string') {
    if (rest.length > 0 && rest.every((segment) => typeof segment === 'string')) {
      return [path, ...rest].join('.');
    }

    return path;
  }

  return null;
}

export function isAllowlistedQueryKey(queryKey: unknown): boolean {
  const path = getQueryPathFromKey(queryKey);

  if (!path || BLOCKLISTED_QUERY_PATHS.has(path)) {
    return false;
  }

  return ALLOWLISTED_QUERY_PATHS.has(path);
}

export function shouldPersistQuery({
  queryKey,
  status,
}: {
  queryKey: unknown;
  status: QueryPersistenceStatus;
}): boolean {
  return status === 'success' && isAllowlistedQueryKey(queryKey);
}
