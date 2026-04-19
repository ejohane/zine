import {
  QUERY_PERSISTENCE_MAX_AGE_MS,
  buildQueryPersistenceBuster,
  buildQueryPersistenceKey,
  shouldPersistQuery,
} from '@zine/shared';
import { ZINE_VERSION } from '@zine/shared';

import { WEB_APP_VERSION } from './env';

export const PERSISTENCE_MAX_AGE_MS = QUERY_PERSISTENCE_MAX_AGE_MS;

export function buildWebQueryPersistenceBuster(): string {
  return buildQueryPersistenceBuster(WEB_APP_VERSION, ZINE_VERSION);
}

export function buildWebQueryPersistenceKey(userId: string | null | undefined): string {
  return buildQueryPersistenceKey(userId, buildWebQueryPersistenceBuster());
}

export { shouldPersistQuery };
