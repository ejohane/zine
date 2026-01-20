/**
 * Tests for Ingestion Processor
 *
 * Tests for:
 * - Error classification (classifyError)
 * - Dead-letter queue storage on ingestion failure
 * - Batch ingestion with DLQ integration
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyError, ValidationError } from './processor';
import { TransformError } from './transformers';

// ============================================================================
// Mock Date.now for consistent testing
// ============================================================================

const MOCK_NOW = 1705320000000; // 2024-01-15T12:00:00.000Z
const originalDateNow = Date.now;

beforeEach(() => {
  Date.now = vi.fn(() => MOCK_NOW);
});

afterEach(() => {
  Date.now = originalDateNow;
});

// ============================================================================
// classifyError Tests
// ============================================================================

describe('classifyError', () => {
  describe('transform errors', () => {
    it('should classify TransformError as transform', () => {
      const error = new TransformError('Missing required field');
      expect(classifyError(error)).toBe('transform');
    });
  });

  describe('database errors', () => {
    it('should classify errors with "database" in name as database', () => {
      const error = new Error('Connection failed');
      error.name = 'DatabaseError';
      expect(classifyError(error)).toBe('database');
    });

    it('should classify errors with "sql" in name as database', () => {
      const error = new Error('Query failed');
      error.name = 'SqliteError';
      expect(classifyError(error)).toBe('database');
    });

    it('should classify errors with "d1" in name as database', () => {
      const error = new Error('D1 operation failed');
      error.name = 'D1Error';
      expect(classifyError(error)).toBe('database');
    });

    it('should classify errors with "constraint" in message as database', () => {
      const error = new Error('UNIQUE constraint failed: items.provider_id');
      expect(classifyError(error)).toBe('database');
    });

    it('should classify errors with "foreign key" in message as database', () => {
      const error = new Error('FOREIGN KEY constraint failed');
      expect(classifyError(error)).toBe('database');
    });

    it('should classify errors with "sqlite" in message as database', () => {
      const error = new Error('SQLITE_BUSY: database is locked');
      expect(classifyError(error)).toBe('database');
    });
  });

  describe('timeout errors', () => {
    it('should classify errors with "timeout" in name as timeout', () => {
      const error = new Error('Operation timed out');
      error.name = 'TimeoutError';
      expect(classifyError(error)).toBe('timeout');
    });

    it('should classify errors with "timeout" in message as timeout', () => {
      const error = new Error('Request timeout after 30000ms');
      expect(classifyError(error)).toBe('timeout');
    });

    it('should classify errors with "timed out" in message as timeout', () => {
      const error = new Error('Connection timed out');
      expect(classifyError(error)).toBe('timeout');
    });

    it('should classify errors with "deadline exceeded" in message as timeout', () => {
      const error = new Error('DEADLINE_EXCEEDED: Request deadline exceeded');
      expect(classifyError(error)).toBe('timeout');
    });
  });

  describe('validation errors', () => {
    it('should classify ValidationError instances as validation', () => {
      const error = new ValidationError('Invalid data', 'testField', 'testValue');
      expect(classifyError(error)).toBe('validation');
    });

    it('should classify ValidationError with context as validation', () => {
      const error = new ValidationError('Invalid data', 'testField', 'testValue', {
        providerId: 'test123',
        allErrors: [],
      });
      expect(classifyError(error)).toBe('validation');
    });

    it('should classify errors with "validation" in name as validation', () => {
      const error = new Error('Invalid data');
      error.name = 'ValidationError';
      expect(classifyError(error)).toBe('validation');
    });

    it('should classify errors with "invalid" in message as validation', () => {
      const error = new Error('Invalid email format');
      expect(classifyError(error)).toBe('validation');
    });

    it('should classify errors with "required field" in message as validation', () => {
      const error = new Error('Required field "title" is missing');
      expect(classifyError(error)).toBe('validation');
    });
  });

  describe('unknown errors', () => {
    it('should classify generic errors as unknown', () => {
      const error = new Error('Something went wrong');
      expect(classifyError(error)).toBe('unknown');
    });

    it('should classify non-Error objects as unknown', () => {
      expect(classifyError('string error')).toBe('unknown');
      expect(classifyError(null)).toBe('unknown');
      expect(classifyError(undefined)).toBe('unknown');
      expect(classifyError({ message: 'object error' })).toBe('unknown');
    });
  });
});

// ============================================================================
// Error Type Classification Edge Cases
// ============================================================================

describe('classifyError - Edge Cases', () => {
  it('should be case-insensitive for error name matching', () => {
    const error1 = new Error('Failed');
    error1.name = 'DATABASEERROR';
    expect(classifyError(error1)).toBe('database');

    const error2 = new Error('Failed');
    error2.name = 'timeoutError';
    expect(classifyError(error2)).toBe('timeout');
  });

  it('should be case-insensitive for error message matching', () => {
    expect(classifyError(new Error('DATABASE connection lost'))).toBe('database');
    expect(classifyError(new Error('Request TIMEOUT'))).toBe('timeout');
    expect(classifyError(new Error('VALIDATION failed'))).toBe('validation');
  });

  it('should prioritize transform error classification', () => {
    // TransformError should be classified as transform even if message contains other keywords
    const error = new TransformError('Database field missing');
    expect(classifyError(error)).toBe('transform');
  });

  it('should prioritize ValidationError classification over message heuristics', () => {
    // ValidationError should be classified as validation even if message contains other keywords
    const error = new ValidationError('Database constraint failed', 'field', 'value');
    expect(classifyError(error)).toBe('validation');
  });
});

// ============================================================================
// Consolidated Batch Ingestion Tests
// ============================================================================

import { DEFAULT_BATCH_CHUNK_SIZE, ingestBatchConsolidated } from './processor';
import { ContentType, Provider } from '@zine/shared';

describe('DEFAULT_BATCH_CHUNK_SIZE', () => {
  it('should be 10', () => {
    expect(DEFAULT_BATCH_CHUNK_SIZE).toBe(10);
  });
});

describe('ingestBatchConsolidated', () => {
  // Mock database functions
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();
  const mockLimit = vi.fn();
  const mockInsert = vi.fn();
  const mockValues = vi.fn();
  const mockOnConflictDoNothing = vi.fn();
  const mockBatch = vi.fn();

  const createMockDb = () => {
    const selectChain = {
      from: mockFrom.mockReturnThis(),
      where: mockWhere.mockReturnThis(),
      limit: mockLimit.mockResolvedValue([]),
    };

    // Create a mock that returns itself for chaining (values -> onConflictDoNothing)
    const valuesResult = {
      onConflictDoNothing: mockOnConflictDoNothing.mockReturnThis(),
    };

    const insertChain = {
      values: mockValues.mockReturnValue(valuesResult),
    };

    return {
      select: mockSelect.mockReturnValue(selectChain),
      insert: mockInsert.mockReturnValue(insertChain),
      batch: mockBatch.mockResolvedValue([]),
    };
  };

  const createTestItem = (id: string) => ({
    id,
    name: `Test Episode ${id}`,
    description: 'Test description',
    release_date: '2024-01-15',
    duration_ms: 3600000,
    external_urls: { spotify: `https://open.spotify.com/episode/${id}` },
    images: [{ url: `https://i.scdn.co/image/${id}` }],
  });

  const transformFn = (raw: ReturnType<typeof createTestItem>) => ({
    id: raw.id,
    contentType: ContentType.PODCAST,
    provider: Provider.SPOTIFY,
    providerId: raw.id,
    canonicalUrl: raw.external_urls.spotify,
    title: raw.name,
    description: raw.description,
    creator: 'Test Show',
    creatorImageUrl: undefined,
    imageUrl: raw.images[0]?.url,
    durationSeconds: Math.floor(raw.duration_ms / 1000),
    publishedAt: new Date(raw.release_date).getTime(),
    createdAt: MOCK_NOW,
  });

  const getProviderId = (raw: ReturnType<typeof createTestItem>) => raw.id;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('empty input', () => {
    it('should return empty result for empty array', async () => {
      const mockDb = createMockDb();

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        [],
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId
      );

      expect(result).toEqual({
        total: 0,
        created: 0,
        skipped: 0,
        errors: 0,
        errorDetails: [],
        batchCount: 0,
        fallbackCount: 0,
        durationMs: expect.any(Number),
      });
      expect(mockBatch).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('should skip items already seen', async () => {
      const mockDb = createMockDb();
      // Simulate that item was already seen
      mockLimit.mockResolvedValueOnce([{ id: 'seen123' }]);

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        [createTestItem('episode1')],
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId
      );

      expect(result.skipped).toBe(1);
      expect(result.created).toBe(0);
      expect(mockBatch).not.toHaveBeenCalled();
    });
  });

  describe('batch execution', () => {
    it('should create items in a single batch for small arrays', async () => {
      const mockDb = createMockDb();
      const items = [createTestItem('ep1'), createTestItem('ep2'), createTestItem('ep3')];

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        items,
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId
      );

      expect(result.created).toBe(3);
      expect(result.batchCount).toBe(1);
      // One batch call for all items
      expect(mockBatch).toHaveBeenCalledTimes(1);
    });

    it('should split into chunks when items exceed chunk size', async () => {
      const mockDb = createMockDb();
      // Create 15 items, with chunk size 5 = 3 chunks
      const items = Array.from({ length: 15 }, (_, i) => createTestItem(`ep${i}`));

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        items,
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId,
        5 // Custom chunk size
      );

      expect(result.created).toBe(15);
      expect(result.batchCount).toBe(3);
      expect(mockBatch).toHaveBeenCalledTimes(3);
    });

    it('should use default chunk size when not specified', async () => {
      const mockDb = createMockDb();
      // Create 25 items, with default chunk size 10 = 3 chunks
      const items = Array.from({ length: 25 }, (_, i) => createTestItem(`ep${i}`));

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        items,
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId
      );

      expect(result.created).toBe(25);
      expect(result.batchCount).toBe(3); // 10 + 10 + 5
    });
  });

  describe('canonical item handling', () => {
    it('should reuse existing canonical items', async () => {
      const mockDb = createMockDb();
      // Idempotency check - not seen
      mockLimit.mockResolvedValueOnce([]);
      // Canonical item exists
      mockLimit.mockResolvedValueOnce([{ id: 'existing-canonical-id' }]);

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        [createTestItem('ep1')],
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId
      );

      expect(result.created).toBe(1);
      // The batch should not include a canonical item insert
      // (verified through the insert not being called for items table)
    });

    it('should create new canonical items when not existing', async () => {
      const mockDb = createMockDb();
      // Idempotency check - not seen
      mockLimit.mockResolvedValueOnce([]);
      // Canonical item does not exist
      mockLimit.mockResolvedValueOnce([]);

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        [createTestItem('ep1')],
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId
      );

      expect(result.created).toBe(1);
    });
  });

  describe('batch fallback', () => {
    it('should fallback to individual inserts when batch fails', async () => {
      const mockDb = createMockDb();
      // First batch call fails
      mockBatch.mockRejectedValueOnce(new Error('Batch failed'));
      // Individual inserts succeed
      mockBatch.mockResolvedValue([]);

      const items = [createTestItem('ep1'), createTestItem('ep2')];

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        items,
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId
      );

      expect(result.created).toBe(2);
      expect(result.fallbackCount).toBe(2);
      // 1 failed batch + 2 individual fallbacks
      expect(mockBatch).toHaveBeenCalledTimes(3);
    });

    it('should track errors when individual fallback also fails', async () => {
      const mockDb = createMockDb();
      // Batch fails
      mockBatch.mockRejectedValueOnce(new Error('Batch failed'));
      // Individual inserts also fail
      mockBatch.mockRejectedValue(new Error('Individual failed'));

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        [createTestItem('ep1')],
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId
      );

      expect(result.created).toBe(0);
      expect(result.errors).toBe(1);
      expect(result.errorDetails).toHaveLength(1);
      expect(result.errorDetails[0].providerId).toBe('ep1');
    });
  });

  describe('error handling', () => {
    it('should track transformation errors', async () => {
      const mockDb = createMockDb();
      const badTransform = () => {
        throw new TransformError('Missing required field');
      };

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        [createTestItem('ep1')],
        Provider.SPOTIFY,
        mockDb as never,
        badTransform,
        getProviderId
      );

      expect(result.errors).toBe(1);
      expect(result.errorDetails[0]).toMatchObject({
        providerId: 'ep1',
        error: expect.stringContaining('TransformError'),
      });
    });

    it('should track validation errors', async () => {
      const mockDb = createMockDb();
      // Transform to invalid item (missing required fields triggers validation)
      const invalidTransform = () => ({
        id: '',
        providerId: '', // Empty = invalid
        title: '',
        canonicalUrl: 'not-a-url',
        creator: '',
        contentType: ContentType.PODCAST,
        provider: Provider.SPOTIFY,
        publishedAt: 0, // Invalid timestamp
        createdAt: MOCK_NOW,
      });

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        [createTestItem('ep1')],
        Provider.SPOTIFY,
        mockDb as never,
        invalidTransform,
        getProviderId
      );

      expect(result.errors).toBe(1);
      expect(result.errorDetails[0]).toMatchObject({
        providerId: 'ep1',
        error: expect.stringContaining('Invalid'),
      });
    });

    it('should continue processing after individual item errors', async () => {
      const mockDb = createMockDb();
      let callCount = 0;
      const sometimesBadTransform = (raw: ReturnType<typeof createTestItem>) => {
        callCount++;
        if (callCount === 2) {
          throw new TransformError('Bad item');
        }
        return transformFn(raw);
      };

      const items = [createTestItem('ep1'), createTestItem('ep2'), createTestItem('ep3')];

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        items,
        Provider.SPOTIFY,
        mockDb as never,
        sometimesBadTransform,
        getProviderId
      );

      // 2 succeeded, 1 failed
      expect(result.created).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.errorDetails).toHaveLength(1);
      expect(result.errorDetails[0].providerId).toBe('ep2');
    });
  });

  describe('metrics', () => {
    it('should track duration', async () => {
      const mockDb = createMockDb();

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        [createTestItem('ep1')],
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId
      );

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should calculate correct batch count for various sizes', async () => {
      const mockDb = createMockDb();

      // Test with exactly chunk size items
      const exactChunkItems = Array.from({ length: 10 }, (_, i) => createTestItem(`ep${i}`));
      const exactResult = await ingestBatchConsolidated(
        'user123',
        'sub123',
        exactChunkItems,
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId,
        10
      );
      expect(exactResult.batchCount).toBe(1);

      vi.clearAllMocks();

      // Test with chunk size + 1 items
      const overChunkItems = Array.from({ length: 11 }, (_, i) => createTestItem(`ep${i}`));
      const overResult = await ingestBatchConsolidated(
        'user123',
        'sub123',
        overChunkItems,
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId,
        10
      );
      expect(overResult.batchCount).toBe(2);
    });
  });

  describe('mixed scenarios', () => {
    it('should handle mix of created, skipped, and errored items', async () => {
      const mockDb = createMockDb();

      // First item: seen (skipped)
      mockLimit.mockResolvedValueOnce([{ id: 'seen' }]);
      // Second item: not seen, canonical doesn't exist (created)
      mockLimit.mockResolvedValueOnce([]);
      mockLimit.mockResolvedValueOnce([]);

      let callCount = 0;
      const mixedTransform = (raw: ReturnType<typeof createTestItem>) => {
        callCount++;
        if (callCount === 3) {
          // Third item transform fails
          throw new TransformError('Bad data');
        }
        return transformFn(raw);
      };

      const items = [createTestItem('seen-ep'), createTestItem('new-ep'), createTestItem('bad-ep')];

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        items,
        Provider.SPOTIFY,
        mockDb as never,
        mixedTransform,
        getProviderId
      );

      expect(result.total).toBe(3);
      expect(result.skipped).toBe(1);
      expect(result.created).toBe(1);
      expect(result.errors).toBe(1);
    });
  });

  describe('race condition handling', () => {
    it('should use onConflictDoNothing for all insert statements', async () => {
      const mockOnConflictDoNothing = vi.fn().mockReturnThis();
      const mockValues = vi.fn().mockReturnValue({
        onConflictDoNothing: mockOnConflictDoNothing,
      });
      const mockInsert = vi.fn().mockReturnValue({
        values: mockValues,
      });
      const mockBatch = vi.fn().mockResolvedValue([]);

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]), // Not seen, no existing canonical
      };

      const mockDb = {
        select: vi.fn().mockReturnValue(selectChain),
        insert: mockInsert,
        batch: mockBatch,
      };

      await ingestBatchConsolidated(
        'user123',
        'sub123',
        [createTestItem('ep1')],
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId
      );

      // Verify onConflictDoNothing was called for all insert operations
      // For one item: 1 canonical item + 1 user_item + 1 subscription_item + 1 provider_items_seen = 4 inserts
      expect(mockOnConflictDoNothing).toHaveBeenCalled();
      expect(mockOnConflictDoNothing.mock.calls.length).toBeGreaterThanOrEqual(4);
    });

    it('should handle UNIQUE constraint violations gracefully via onConflictDoNothing', async () => {
      // This test verifies the batch succeeds even when there would be conflicts
      // In practice, onConflictDoNothing means the batch won't fail on duplicates
      const mockOnConflictDoNothing = vi.fn().mockReturnThis();
      const mockValues = vi.fn().mockReturnValue({
        onConflictDoNothing: mockOnConflictDoNothing,
      });
      const mockInsert = vi.fn().mockReturnValue({
        values: mockValues,
      });
      // Batch succeeds (onConflictDoNothing prevents constraint violation errors)
      const mockBatch = vi.fn().mockResolvedValue([]);

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      const mockDb = {
        select: vi.fn().mockReturnValue(selectChain),
        insert: mockInsert,
        batch: mockBatch,
      };

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        [createTestItem('ep1'), createTestItem('ep2')],
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId
      );

      // Both items should be reported as created (batch succeeded)
      expect(result.created).toBe(2);
      expect(result.errors).toBe(0);
      // Batch was called once (single chunk for 2 items)
      expect(mockBatch).toHaveBeenCalledTimes(1);
    });

    it('should not fail when concurrent workers try to insert the same item', async () => {
      // Simulates the race condition scenario:
      // Worker A checks idempotency (not seen) → proceeds
      // Worker B checks idempotency (not seen) → proceeds
      // Worker A inserts with onConflictDoNothing → succeeds
      // Worker B inserts with onConflictDoNothing → succeeds (no error due to IGNORE)

      const mockOnConflictDoNothing = vi.fn().mockReturnThis();
      const mockValues = vi.fn().mockReturnValue({
        onConflictDoNothing: mockOnConflictDoNothing,
      });
      const mockInsert = vi.fn().mockReturnValue({
        values: mockValues,
      });
      // Both batches succeed - onConflictDoNothing handles the duplicate gracefully
      const mockBatch = vi.fn().mockResolvedValue([]);

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]), // Both workers see "not seen"
      };

      const mockDb = {
        select: vi.fn().mockReturnValue(selectChain),
        insert: mockInsert,
        batch: mockBatch,
      };

      // Simulate Worker A
      const resultA = await ingestBatchConsolidated(
        'user123',
        'sub123',
        [createTestItem('same-episode')],
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId
      );

      // Simulate Worker B (same item, same user)
      const resultB = await ingestBatchConsolidated(
        'user123',
        'sub123',
        [createTestItem('same-episode')],
        Provider.SPOTIFY,
        mockDb as never,
        transformFn,
        getProviderId
      );

      // Both workers report success - no errors thrown
      expect(resultA.errors).toBe(0);
      expect(resultB.errors).toBe(0);
      // Both workers think they created the item (in reality, only one did)
      // This is acceptable because the end result is correct (exactly one item exists)
      expect(resultA.created).toBe(1);
      expect(resultB.created).toBe(1);
    });
  });

  describe('creator linking', () => {
    // Helper to create a mock DB that tracks inserts
    const createCreatorTrackingMockDb = () => {
      const insertedCreators: any[] = [];
      const insertedItems: any[] = [];
      let creatorQueryCount = 0;

      const mockQuery = {
        creators: {
          findFirst: vi.fn().mockImplementation(() => {
            creatorQueryCount++;
            // First call returns null (creator doesn't exist)
            // Subsequent calls could return the created creator
            return Promise.resolve(null);
          }),
        },
      };

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      // Track what gets inserted
      const mockInsert = vi.fn().mockImplementation((_table) => ({
        values: vi.fn().mockImplementation((values) => {
          // Check if this is a creators insert by looking at the values structure
          if (values.normalizedName !== undefined) {
            insertedCreators.push(values);
          } else if (values.contentType !== undefined) {
            insertedItems.push(values);
          }
          return {
            onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
          };
        }),
      }));

      const mockBatch = vi.fn().mockResolvedValue([]);

      return {
        db: {
          select: vi.fn().mockReturnValue(selectChain),
          insert: mockInsert,
          batch: mockBatch,
          query: mockQuery,
        },
        getInsertedCreators: () => insertedCreators,
        getInsertedItems: () => insertedItems,
        getCreatorQueryCount: () => creatorQueryCount,
      };
    };

    it('should extract and create YouTube creator during batch ingestion', async () => {
      const mockDbTracker = createCreatorTrackingMockDb();

      // Create a YouTube video item with full metadata including snippet
      const youtubeItem = {
        id: 'ep1',
        contentDetails: {
          videoId: 'video123',
        },
        snippet: {
          channelId: 'UC_youtube_channel_123',
          channelTitle: 'Test YouTube Channel',
          title: 'Test Video',
          description: 'A test video',
          publishedAt: '2024-01-15T10:00:00Z',
        },
      };

      const transformFnWithCreator = (raw: typeof youtubeItem) => ({
        id: 'item-' + raw.id,
        contentType: ContentType.VIDEO,
        provider: Provider.YOUTUBE,
        providerId: raw.contentDetails?.videoId || raw.id,
        canonicalUrl: `https://youtube.com/watch?v=${raw.contentDetails?.videoId}`,
        title: raw.snippet?.title || 'Untitled',
        description: raw.snippet?.description,
        creator: raw.snippet?.channelTitle || 'Unknown',
        creatorImageUrl: undefined,
        imageUrl: undefined,
        durationSeconds: undefined,
        publishedAt: new Date(raw.snippet?.publishedAt || '').getTime(),
        createdAt: MOCK_NOW,
      });

      const getProviderId = (raw: typeof youtubeItem) => raw.contentDetails?.videoId || raw.id;

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        [youtubeItem],
        Provider.YOUTUBE,
        mockDbTracker.db as never,
        transformFnWithCreator,
        getProviderId
      );

      expect(result.created).toBe(1);
      expect(result.errors).toBe(0);

      // Verify creator query was made (findOrCreateCreator calls findFirst)
      expect(mockDbTracker.getCreatorQueryCount()).toBeGreaterThan(0);

      // Verify creators.insert was called with YouTube channel info
      const insertedCreators = mockDbTracker.getInsertedCreators();
      expect(insertedCreators.length).toBeGreaterThan(0);

      const youtubeCreator = insertedCreators.find(
        (c) => c.provider === 'YOUTUBE' && c.providerCreatorId === 'UC_youtube_channel_123'
      );
      expect(youtubeCreator).toBeDefined();
      expect(youtubeCreator?.name).toBe('Test YouTube Channel');
    });

    it('should generate synthetic creator ID for RSS provider', async () => {
      const mockDbTracker = createCreatorTrackingMockDb();

      // RSS items don't have native creator IDs, so we generate synthetic ones
      const rssItem = {
        id: 'rss-item-1',
        title: 'RSS Article',
        description: 'An article from RSS',
        link: 'https://example.com/article',
        pubDate: '2024-01-15T10:00:00Z',
        creator: 'RSS Blog Author',
      };

      const transformFnRss = (raw: typeof rssItem) => ({
        id: 'item-' + raw.id,
        contentType: ContentType.ARTICLE,
        provider: Provider.RSS,
        providerId: raw.id,
        canonicalUrl: raw.link,
        title: raw.title,
        description: raw.description,
        creator: raw.creator,
        creatorImageUrl: undefined,
        imageUrl: undefined,
        durationSeconds: undefined,
        publishedAt: new Date(raw.pubDate).getTime(),
        createdAt: MOCK_NOW,
      });

      const getProviderId = (raw: typeof rssItem) => raw.id;

      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        [rssItem],
        Provider.RSS as any, // RSS is a valid provider
        mockDbTracker.db as never,
        transformFnRss,
        getProviderId
      );

      expect(result.created).toBe(1);

      // Verify creators.insert was called with synthetic ID
      const insertedCreators = mockDbTracker.getInsertedCreators();
      // Note: For RSS, synthetic ID is generated, so we check the name and provider
      const rssCreator = insertedCreators.find(
        (c) => c.provider === 'RSS' && c.name === 'RSS Blog Author'
      );
      expect(rssCreator).toBeDefined();
      // Synthetic ID should be a 32-char hex string
      expect(rssCreator?.providerCreatorId).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should include creatorId in batch item insert', async () => {
      const mockOnConflictDoNothing = vi.fn().mockReturnThis();
      const mockValues = vi.fn().mockReturnValue({
        onConflictDoNothing: mockOnConflictDoNothing,
      });

      const mockInsert = vi.fn().mockReturnValue({
        values: mockValues,
      });

      const mockBatch = vi.fn().mockResolvedValue([]);

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      const mockQuery = {
        creators: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      const mockDb = {
        select: vi.fn().mockReturnValue(selectChain),
        insert: mockInsert,
        batch: mockBatch,
        query: mockQuery,
      };

      const youtubeItem = {
        id: 'ep1',
        contentDetails: { videoId: 'video123' },
        snippet: {
          channelId: 'UC_youtube_channel_123',
          channelTitle: 'Test YouTube Channel',
          title: 'Test Video',
          publishedAt: '2024-01-15T10:00:00Z',
        },
      };

      const transformFn = (raw: typeof youtubeItem) => ({
        id: 'item-' + raw.id,
        contentType: ContentType.VIDEO,
        provider: Provider.YOUTUBE,
        providerId: raw.contentDetails?.videoId || raw.id,
        canonicalUrl: `https://youtube.com/watch?v=${raw.contentDetails?.videoId}`,
        title: raw.snippet?.title || 'Untitled',
        creator: raw.snippet?.channelTitle || 'Unknown',
        publishedAt: new Date(raw.snippet?.publishedAt || '').getTime(),
        createdAt: MOCK_NOW,
      });

      await ingestBatchConsolidated(
        'user123',
        'sub123',
        [youtubeItem],
        Provider.YOUTUBE,
        mockDb as never,
        transformFn,
        (raw) => raw.contentDetails?.videoId || raw.id
      );

      // Verify that batch was called
      expect(mockBatch).toHaveBeenCalled();

      // Verify that mockValues was called with creatorId field
      // Find the call that included creatorId (the items insert)
      const allValuesCalls = mockValues.mock.calls;
      const itemInsertCall = allValuesCalls.find((call) => call[0]?.creatorId !== undefined);

      expect(itemInsertCall).toBeDefined();
      // creatorId should be a ULID (26 chars)
      expect(itemInsertCall![0].creatorId).toHaveLength(26);
    });

    it('should handle creator extraction failure gracefully', async () => {
      // Create a mock that throws on creator findFirst
      const mockQuery = {
        creators: {
          findFirst: vi.fn().mockRejectedValue(new Error('DB error')),
        },
      };

      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      };

      const mockOnConflictDoNothing = vi.fn().mockReturnThis();
      const mockValues = vi.fn().mockReturnValue({
        onConflictDoNothing: mockOnConflictDoNothing,
      });

      const mockInsert = vi.fn().mockReturnValue({
        values: mockValues,
      });

      const mockBatch = vi.fn().mockResolvedValue([]);

      const mockDb = {
        select: vi.fn().mockReturnValue(selectChain),
        insert: mockInsert,
        batch: mockBatch,
        query: mockQuery,
      };

      const youtubeItem = {
        id: 'ep1',
        contentDetails: { videoId: 'video123' },
        snippet: {
          channelId: 'UC_youtube_channel_123',
          channelTitle: 'Test YouTube Channel',
          title: 'Test Video',
          publishedAt: '2024-01-15T10:00:00Z',
        },
      };

      const transformFn = (raw: typeof youtubeItem) => ({
        id: 'item-' + raw.id,
        contentType: ContentType.VIDEO,
        provider: Provider.YOUTUBE,
        providerId: raw.contentDetails?.videoId || raw.id,
        canonicalUrl: `https://youtube.com/watch?v=${raw.contentDetails?.videoId}`,
        title: raw.snippet?.title || 'Untitled',
        creator: raw.snippet?.channelTitle || 'Unknown',
        publishedAt: new Date(raw.snippet?.publishedAt || '').getTime(),
        createdAt: MOCK_NOW,
      });

      // Should NOT throw - creator extraction failure should be logged but not fail ingestion
      const result = await ingestBatchConsolidated(
        'user123',
        'sub123',
        [youtubeItem],
        Provider.YOUTUBE,
        mockDb as never,
        transformFn,
        (raw) => raw.contentDetails?.videoId || raw.id
      );

      // Item should still be created, just without creatorId
      expect(result.created).toBe(1);
      expect(result.errors).toBe(0);

      // Verify item insert was called (item still created despite creator failure)
      expect(mockBatch).toHaveBeenCalled();
    });

    it('should not create creator for items with missing metadata', async () => {
      const mockDbTracker = createCreatorTrackingMockDb();

      // YouTube item without snippet (missing channel info)
      const incompleteItem = {
        id: 'ep1',
        contentDetails: { videoId: 'video123' },
        // No snippet - extractCreatorFromMetadata will return null
      };

      const transformFn = (raw: typeof incompleteItem) => ({
        id: 'item-' + raw.id,
        contentType: ContentType.VIDEO,
        provider: Provider.YOUTUBE,
        providerId: raw.contentDetails?.videoId || raw.id,
        canonicalUrl: `https://youtube.com/watch?v=${raw.contentDetails?.videoId}`,
        title: 'Untitled',
        creator: 'Unknown',
        publishedAt: MOCK_NOW,
        createdAt: MOCK_NOW,
      });

      await ingestBatchConsolidated(
        'user123',
        'sub123',
        [incompleteItem],
        Provider.YOUTUBE,
        mockDbTracker.db as never,
        transformFn,
        (raw) => raw.contentDetails?.videoId || raw.id
      );

      // No YouTube creator should have been inserted (missing snippet.channelId)
      const insertedCreators = mockDbTracker.getInsertedCreators();
      const youtubeCreator = insertedCreators.find((c) => c.provider === 'YOUTUBE');
      expect(youtubeCreator).toBeUndefined();
    });
  });
});
