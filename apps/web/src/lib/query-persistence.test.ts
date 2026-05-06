import { describe, expect, test } from 'vitest';

import {
  PERSISTENCE_MAX_AGE_MS,
  buildWebQueryPersistenceBuster,
  buildWebQueryPersistenceKey,
  shouldPersistQuery,
} from './query-persistence';

describe('web query persistence', () => {
  test('builds a user-scoped persistence key', () => {
    const key = buildWebQueryPersistenceKey('user-123');

    expect(key).toMatch(/^zine:rq:user-123:/);
    expect(buildWebQueryPersistenceKey(undefined)).toMatch(/^zine:rq:anon:/);
  });

  test('builds a stable buster and keeps the shared max age', () => {
    expect(buildWebQueryPersistenceBuster()).toMatch(/^0\.0\.1-/);
    expect(PERSISTENCE_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test('persists only the allowlisted successful queries', () => {
    expect(shouldPersistQuery({ queryKey: [['items', 'library']], status: 'success' })).toBe(true);
    expect(shouldPersistQuery({ queryKey: [['collections', 'list']], status: 'success' })).toBe(
      true
    );
    expect(shouldPersistQuery({ queryKey: [['collections', 'items']], status: 'success' })).toBe(
      true
    );
    expect(shouldPersistQuery({ queryKey: [['collections', 'forItem']], status: 'success' })).toBe(
      true
    );
    expect(shouldPersistQuery({ queryKey: [['creators', 'get']], status: 'success' })).toBe(true);
    expect(shouldPersistQuery({ queryKey: [['bookmarks', 'preview']], status: 'success' })).toBe(
      false
    );
    expect(shouldPersistQuery({ queryKey: [['items', 'library']], status: 'error' })).toBe(false);
  });
});
