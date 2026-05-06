import Constants from 'expo-constants';
import {
  QUERY_PERSISTENCE_MAX_AGE_MS,
  QUERY_PERSISTENCE_STORAGE_PREFIX,
  buildQueryPersistenceBuster as buildSharedQueryPersistenceBuster,
  buildQueryPersistenceKey as buildSharedQueryPersistenceKey,
  getQueryPathFromKey,
  isAllowlistedQueryKey,
  shouldPersistQuery,
} from '@zine/shared';
import { ZINE_VERSION } from '@zine/shared';

const MOBILE_QUERY_CACHE_SCHEMA_VERSION = '2';

export function getAppVersion(): string {
  return process.env.EXPO_PUBLIC_APP_VERSION?.trim() || Constants.expoConfig?.version || '0.0.0';
}

export function getApiSchemaVersion(): string {
  return (
    process.env.EXPO_PUBLIC_API_SCHEMA_VERSION?.trim() ||
    `${ZINE_VERSION}-mobile-cache-${MOBILE_QUERY_CACHE_SCHEMA_VERSION}`
  );
}

export function buildQueryPersistenceBuster(
  appVersion: string = getAppVersion(),
  schemaVersion: string = getApiSchemaVersion()
): string {
  return buildSharedQueryPersistenceBuster(appVersion, schemaVersion);
}

export function buildQueryPersistenceKey(
  userId: string | null | undefined,
  buster: string
): string {
  return buildSharedQueryPersistenceKey(userId, buster);
}

export const PERSISTENCE_STORAGE_PREFIX = QUERY_PERSISTENCE_STORAGE_PREFIX;
export const PERSISTENCE_MAX_AGE_MS = QUERY_PERSISTENCE_MAX_AGE_MS;

export { getQueryPathFromKey, isAllowlistedQueryKey, shouldPersistQuery };
