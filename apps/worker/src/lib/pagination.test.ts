import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildPaginatedQuery,
  decodeCursor,
  encodeCursor,
  processPaginatedResults,
} from './pagination';

describe('pagination utilities', () => {
  describe('cursor encoding and decoding', () => {
    it('round-trips a valid cursor', () => {
      const original = {
        sortValue: '2026-03-10T00:00:00.000Z',
        id: 'item_123',
      };

      const encoded = encodeCursor(original);
      const decoded = decodeCursor(encoded);

      expect(decoded).toEqual(original);
    });

    it('produces URL-safe base64 output', () => {
      const encoded = encodeCursor({
        sortValue: '2026-03-10T00:00:00.000Z',
        id: 'abc+/=',
      });

      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });

    it('returns null for malformed cursor strings', () => {
      expect(decodeCursor('not-base64')).toBeNull();
      expect(decodeCursor('')).toBeNull();
    });

    it('returns null for structurally invalid payloads', () => {
      const invalidPayload = btoa(JSON.stringify({ sortValue: 123, id: null }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      expect(decodeCursor(invalidPayload)).toBeNull();
    });
  });

  describe('buildPaginatedQuery', () => {
    it('uses default descending sort and adds one for hasMore detection', () => {
      const params = buildPaginatedQuery({ cursor: null, limit: DEFAULT_PAGE_SIZE });

      expect(params).toEqual({
        queryLimit: DEFAULT_PAGE_SIZE + 1,
        cursorFilter: null,
        requestedLimit: DEFAULT_PAGE_SIZE,
        sortDirection: 'desc',
      });
    });

    it('clamps limit to valid min/max bounds', () => {
      const tooSmall = buildPaginatedQuery({ cursor: null, limit: 0 });
      const tooLarge = buildPaginatedQuery({ cursor: null, limit: MAX_PAGE_SIZE + 500 });

      expect(tooSmall.requestedLimit).toBe(1);
      expect(tooSmall.queryLimit).toBe(2);
      expect(tooLarge.requestedLimit).toBe(MAX_PAGE_SIZE);
      expect(tooLarge.queryLimit).toBe(MAX_PAGE_SIZE + 1);
    });

    it('passes through cursor and custom sort direction', () => {
      const cursor = {
        sortValue: '2026-03-10T00:00:00.000Z',
        id: 'item_999',
      };

      const params = buildPaginatedQuery({ cursor, limit: 10, sortDirection: 'asc' });

      expect(params.cursorFilter).toEqual(cursor);
      expect(params.sortDirection).toBe('asc');
    });
  });

  describe('processPaginatedResults', () => {
    const rows = [
      { id: 'a', createdAt: '2026-03-10T00:00:03.000Z' },
      { id: 'b', createdAt: '2026-03-10T00:00:02.000Z' },
      { id: 'c', createdAt: '2026-03-10T00:00:01.000Z' },
    ];

    it('returns all items with null cursor when there are no additional results', () => {
      const result = processPaginatedResults(
        rows.slice(0, 2),
        2,
        (item) => item.createdAt,
        (item) => item.id
      );

      expect(result.items).toEqual(rows.slice(0, 2));
      expect(result.nextCursor).toBeNull();
    });

    it('trims the sentinel row and returns nextCursor when there are more results', () => {
      const result = processPaginatedResults(
        rows,
        2,
        (item) => item.createdAt,
        (item) => item.id
      );

      expect(result.items).toEqual(rows.slice(0, 2));
      expect(result.nextCursor).not.toBeNull();

      const decoded = decodeCursor(result.nextCursor!);
      expect(decoded).toEqual({
        sortValue: rows[1].createdAt,
        id: rows[1].id,
      });
    });
  });
});
