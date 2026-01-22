/**
 * React Query persistence helpers.
 */

import Constants from 'expo-constants';
import { ZINE_VERSION } from '@zine/shared';
import type { QueryStatus } from '@tanstack/react-query';

export const PERSISTENCE_STORAGE_PREFIX = 'zine:rq:';
export const PERSISTENCE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const ALLOWLISTED_QUERY_PATHS = new Set(['items.home', 'items.inbox', 'items.library']);

export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

export function buildQueryPersistenceBuster(
  appVersion: string = getAppVersion(),
  schemaVersion: string = ZINE_VERSION
): string {
  return `${appVersion}-${schemaVersion}`;
}

export function buildQueryPersistenceKey(
  userId: string | null | undefined,
  buster: string
): string {
  const scopedUser = userId ?? 'anonymous';
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
  return path ? ALLOWLISTED_QUERY_PATHS.has(path) : false;
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
