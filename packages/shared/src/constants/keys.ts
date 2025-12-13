/**
 * Key Conventions for Zine
 *
 * Canonical key shapes for Replicache key-value store.
 * All keys follow the pattern: `{entity}/{id}`
 */

// ============================================================================
// Key Prefixes
// ============================================================================

export const KEY_PREFIX = {
  ITEM: 'item',
  USER_ITEM: 'userItem',
  SOURCE: 'source',
} as const;

// ============================================================================
// Key Generators
// ============================================================================

/**
 * Generate a key for an Item
 * @param id - The item ID
 * @returns Key in format `item/{id}`
 *
 * @example
 * itemKey('abc') // => 'item/abc'
 */
export function itemKey(id: string): string {
  return `${KEY_PREFIX.ITEM}/${id}`;
}

/**
 * Generate a key for a UserItem
 * @param id - The user item ID
 * @returns Key in format `userItem/{id}`
 *
 * @example
 * userItemKey('xyz') // => 'userItem/xyz'
 */
export function userItemKey(id: string): string {
  return `${KEY_PREFIX.USER_ITEM}/${id}`;
}

/**
 * Generate a key for a Source
 * @param id - The source ID
 * @returns Key in format `source/{id}`
 *
 * @example
 * sourceKey('123') // => 'source/123'
 */
export function sourceKey(id: string): string {
  return `${KEY_PREFIX.SOURCE}/${id}`;
}

// ============================================================================
// Key Parsers
// ============================================================================

/**
 * Parse an entity type from a key
 * @param key - The full key
 * @returns The entity type prefix, or null if invalid
 */
export function parseKeyType(
  key: string
): (typeof KEY_PREFIX)[keyof typeof KEY_PREFIX] | null {
  const prefix = key.split('/')[0];
  if (
    prefix === KEY_PREFIX.ITEM ||
    prefix === KEY_PREFIX.USER_ITEM ||
    prefix === KEY_PREFIX.SOURCE
  ) {
    return prefix;
  }
  return null;
}

/**
 * Parse an ID from a key
 * @param key - The full key
 * @returns The ID portion of the key, or null if invalid
 */
export function parseKeyId(key: string): string | null {
  const parts = key.split('/');
  if (parts.length !== 2) {
    return null;
  }
  return parts[1];
}

/**
 * Check if a key is for an Item
 */
export function isItemKey(key: string): boolean {
  return key.startsWith(`${KEY_PREFIX.ITEM}/`);
}

/**
 * Check if a key is for a UserItem
 */
export function isUserItemKey(key: string): boolean {
  return key.startsWith(`${KEY_PREFIX.USER_ITEM}/`);
}

/**
 * Check if a key is for a Source
 */
export function isSourceKey(key: string): boolean {
  return key.startsWith(`${KEY_PREFIX.SOURCE}/`);
}

// ============================================================================
// Scan Prefixes
// ============================================================================

/**
 * Get the scan prefix for all Items
 * Use with Replicache's `scan({ prefix })` to iterate all items
 */
export function itemScanPrefix(): string {
  return `${KEY_PREFIX.ITEM}/`;
}

/**
 * Get the scan prefix for all UserItems
 * Use with Replicache's `scan({ prefix })` to iterate all user items
 */
export function userItemScanPrefix(): string {
  return `${KEY_PREFIX.USER_ITEM}/`;
}

/**
 * Get the scan prefix for all Sources
 * Use with Replicache's `scan({ prefix })` to iterate all sources
 */
export function sourceScanPrefix(): string {
  return `${KEY_PREFIX.SOURCE}/`;
}
