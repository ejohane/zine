/**
 * React Query persistence helpers.
 */

import Constants from 'expo-constants';
import { ZINE_VERSION } from '@zine/shared';
import type { QueryStatus } from '@tanstack/react-query';

export const PERSISTENCE_STORAGE_PREFIX = 'zine:rq:';
export const PERSISTENCE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const ALLOWLISTED_QUERY_PATHS = new Set([
  'items.home',
  'items.inbox',
  'items.library',
  'items.get',
  'subscriptions.list',
  'subscriptions.connections.list',
  'creators.get',
  'creators.listBookmarks',
  'creators.checkSubscription',
]);

const BLOCKLISTED_QUERY_PATHS = new Set([
  'bookmarks.preview',
  'subscriptions.syncStatus',
  'subscriptions.activeSyncJob',
  'creators.fetchLatestContent',
]);

export function getAppVersion(): string {
  return process.env.EXPO_PUBLIC_APP_VERSION?.trim() || Constants.expoConfig?.version || '0.0.0';
}

export function getApiSchemaVersion(): string {
  return process.env.EXPO_PUBLIC_API_SCHEMA_VERSION?.trim() || ZINE_VERSION;
}

export function buildQueryPersistenceBuster(
  appVersion: string = getAppVersion(),
  schemaVersion: string = getApiSchemaVersion()
): string {
  return `${appVersion}-${schemaVersion}`;
}

export function buildQueryPersistenceKey(
  userId: string | null | undefined,
  buster: string
): string {
  const scopedUser = userId ?? 'anon';
  return `${PERSISTENCE_STORAGE_PREFIX}${scopedUser}:${buster}`;
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
  status: QueryStatus;
}): boolean {
  return status === 'success' && isAllowlistedQueryKey(queryKey);
}
