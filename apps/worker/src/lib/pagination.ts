/**
 * Cursor-based pagination utilities for tRPC queries
 *
 * Provides a consistent pagination pattern for all list endpoints using
 * a cursor that combines a sortable timestamp with a unique ID for
 * stable, deterministic pagination.
 */

/**
 * Pagination cursor structure
 *
 * Uses a compound cursor with both a sortable value and unique ID
 * to ensure stable pagination even when items have identical timestamps.
 */
export interface PaginationCursor {
  /** Sort value as ISO8601 timestamp string */
  sortValue: string;
  /** Unique identifier for tie-breaking */
  id: string;
}

/**
 * Input parameters for paginated queries
 */
export interface PaginationInput {
  /** Maximum number of items to return */
  limit?: number;
  /** Cursor for fetching next page (from previous response) */
  cursor?: string;
}

/**
 * Output structure for paginated responses
 */
export interface PaginatedResult<T> {
  /** Array of items for the current page */
  items: T[];
  /** Cursor for fetching the next page, null if no more items */
  nextCursor: string | null;
}

/** Default page size if not specified */
export const DEFAULT_PAGE_SIZE = 20;

/** Maximum allowed page size */
export const MAX_PAGE_SIZE = 100;

/**
 * Encode a pagination cursor to a base64url string
 *
 * @param cursor - The cursor object to encode
 * @returns Base64url encoded cursor string
 *
 * @example
 * ```ts
 * const cursor = encodeCursor({
 *   sortValue: '2024-01-15T10:30:00.000Z',
 *   id: 'item_123'
 * });
 * // Returns: 'eyJzb3J0VmFsdWUiOiIyMDI0LTAxLTE1VDEwOjMwOjAwLjAwMFoiLCJpZCI6Iml0ZW1fMTIzIn0'
 * ```
 */
export function encodeCursor(cursor: PaginationCursor): string {
  const json = JSON.stringify(cursor);
  // Use base64url encoding (URL-safe, no padding)
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode a base64url cursor string to a cursor object
 *
 * @param cursorString - The base64url encoded cursor string
 * @returns The decoded cursor object, or null if invalid
 *
 * @example
 * ```ts
 * const cursor = decodeCursor('eyJzb3J0VmFsdWUiOiIyMDI0LTAxLTE1VDEwOjMwOjAwLjAwMFoiLCJpZCI6Iml0ZW1fMTIzIn0');
 * // Returns: { sortValue: '2024-01-15T10:30:00.000Z', id: 'item_123' }
 * ```
 */
export function decodeCursor(cursorString: string): PaginationCursor | null {
  try {
    // Restore base64 from base64url
    let base64 = cursorString.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }

    const json = atob(base64);
    const parsed = JSON.parse(json);

    // Validate the cursor structure
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.sortValue === 'string' &&
      typeof parsed.id === 'string'
    ) {
      return {
        sortValue: parsed.sortValue,
        id: parsed.id,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Options for building a paginated query
 */
export interface BuildPaginatedQueryOptions {
  /** The decoded cursor, or null for first page */
  cursor: PaginationCursor | null;
  /** Number of items to fetch (will fetch limit + 1 to check for more) */
  limit: number;
  /** Sort direction: 'asc' for oldest first, 'desc' for newest first */
  sortDirection?: 'asc' | 'desc';
}

/**
 * Result of buildPaginatedQuery helper
 */
export interface PaginatedQueryParams {
  /** Actual limit to use in query (includes +1 for hasMore check) */
  queryLimit: number;
  /** Cursor filter condition, or null if first page */
  cursorFilter: {
    sortValue: string;
    id: string;
  } | null;
  /** The requested limit (for slicing results) */
  requestedLimit: number;
  /** Sort direction to use */
  sortDirection: 'asc' | 'desc';
}

/**
 * Build query parameters for a paginated list query
 *
 * This helper normalizes pagination input and prepares parameters
 * for use in database queries. It fetches one extra item to determine
 * if there are more results.
 *
 * @param options - Pagination options including cursor and limit
 * @returns Query parameters ready for use in database queries
 *
 * @example
 * ```ts
 * // In a tRPC router:
 * const params = buildPaginatedQuery({
 *   cursor: input.cursor ? decodeCursor(input.cursor) : null,
 *   limit: input.limit ?? DEFAULT_PAGE_SIZE,
 * });
 *
 * // Use in Drizzle query:
 * const items = await db.query.items.findMany({
 *   where: params.cursorFilter
 *     ? and(
 *         lt(items.createdAt, params.cursorFilter.sortValue),
 *         // or same timestamp but lower id
 *       )
 *     : undefined,
 *   orderBy: desc(items.createdAt),
 *   limit: params.queryLimit,
 * });
 *
 * // Process results:
 * const hasMore = items.length > params.requestedLimit;
 * const pageItems = hasMore ? items.slice(0, -1) : items;
 * const nextCursor = hasMore && pageItems.length > 0
 *   ? encodeCursor({
 *       sortValue: pageItems[pageItems.length - 1].createdAt,
 *       id: pageItems[pageItems.length - 1].id,
 *     })
 *   : null;
 * ```
 */
export function buildPaginatedQuery(options: BuildPaginatedQueryOptions): PaginatedQueryParams {
  const { cursor, sortDirection = 'desc' } = options;

  // Clamp limit to valid range
  const requestedLimit = Math.min(Math.max(options.limit, 1), MAX_PAGE_SIZE);

  // Fetch one extra to check if there are more results
  const queryLimit = requestedLimit + 1;

  return {
    queryLimit,
    cursorFilter: cursor
      ? {
          sortValue: cursor.sortValue,
          id: cursor.id,
        }
      : null,
    requestedLimit,
    sortDirection,
  };
}

/**
 * Process query results into a paginated response
 *
 * Takes raw query results and creates a properly structured paginated
 * response with the next cursor if more items exist.
 *
 * @param items - Raw items from database query (may include extra item for hasMore check)
 * @param requestedLimit - The original requested limit
 * @param getSortValue - Function to extract sort value from an item
 * @param getId - Function to extract ID from an item
 * @returns Paginated result with items and nextCursor
 *
 * @example
 * ```ts
 * const result = processPaginatedResults(
 *   rawItems,
 *   params.requestedLimit,
 *   (item) => item.createdAt.toISOString(),
 *   (item) => item.id
 * );
 * // Returns: { items: [...], nextCursor: '...' | null }
 * ```
 */
export function processPaginatedResults<T>(
  items: T[],
  requestedLimit: number,
  getSortValue: (item: T) => string,
  getId: (item: T) => string
): PaginatedResult<T> {
  const hasMore = items.length > requestedLimit;
  const pageItems = hasMore ? items.slice(0, -1) : items;

  let nextCursor: string | null = null;
  if (hasMore && pageItems.length > 0) {
    const lastItem = pageItems[pageItems.length - 1];
    nextCursor = encodeCursor({
      sortValue: getSortValue(lastItem),
      id: getId(lastItem),
    });
  }

  return {
    items: pageItems,
    nextCursor,
  };
}
