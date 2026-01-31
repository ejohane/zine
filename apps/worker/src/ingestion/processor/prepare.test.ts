/**
 * Tests for ingestion preparation helpers
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentType, Provider } from '@zine/shared';
import { items } from '../../db/schema';
import { prepareBatch, prepareItem } from './prepare';
import { backfillCreatorIdIfMissing, getOrCreateCreator } from './creators';
import { storeToDLQ } from './dlq';

vi.mock('./creators', () => ({
  getOrCreateCreator: vi.fn(),
  backfillCreatorIdIfMissing: vi.fn(),
}));

vi.mock('./dlq', () => ({
  storeToDLQ: vi.fn(),
}));

const baseItem = {
  id: '01HRG9J9Z0D4P2JH6Y0YH1K4QG',
  providerId: 'provider-1',
  provider: Provider.YOUTUBE,
  contentType: ContentType.VIDEO,
  title: 'Test Title',
  canonicalUrl: 'https://example.com/video',
  creator: 'Test Creator',
  publishedAt: 1705320000000,
  createdAt: 1705320000000,
};

const createMockDb = () => {
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();
  const mockLimit = vi.fn();
  const selectChain = {
    from: mockFrom.mockReturnThis(),
    where: mockWhere.mockReturnThis(),
    limit: mockLimit,
  };

  const mockWhereUpdate = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhereUpdate });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  return {
    db: {
      select: mockSelect.mockReturnValue(selectChain),
      update: mockUpdate,
    },
    mockLimit,
    mockUpdate,
    mockSet,
    mockWhereUpdate,
  };
};

describe('prepareItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns skipped when already seen and backfills creator when requested', async () => {
    const { db, mockLimit } = createMockDb();
    const mockBackfill = vi.mocked(backfillCreatorIdIfMissing);
    const mockCreator = vi.mocked(getOrCreateCreator);

    mockLimit.mockResolvedValueOnce([{ id: 'seen' }]);
    mockCreator.mockResolvedValue('creator-1');

    const result = await prepareItem({
      context: { userId: 'user-1', provider: Provider.YOUTUBE, db: db as never },
      rawItem: { id: 'raw-1' },
      transformFn: () => baseItem,
      backfillOnSeen: true,
    });

    expect(result).toEqual({ status: 'skipped', reason: 'already_seen' });
    expect(mockBackfill).toHaveBeenCalledTimes(1);
    expect(mockCreator).not.toHaveBeenCalled();
  });

  it('updates canonical creatorId when existing item is missing it', async () => {
    const { db, mockLimit, mockUpdate, mockSet } = createMockDb();
    const mockCreator = vi.mocked(getOrCreateCreator);
    mockCreator.mockResolvedValue('creator-123');

    mockLimit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'canonical-1', creatorId: null }]);

    const result = await prepareItem({
      context: { userId: 'user-1', provider: Provider.YOUTUBE, db: db as never },
      rawItem: { id: 'raw-2' },
      transformFn: () => baseItem,
    });

    expect(result.status).toBe('prepared');
    if (result.status === 'prepared') {
      expect(result.item.canonicalItemId).toBe('canonical-1');
      expect(result.item.canonicalItemExists).toBe(true);
      expect(result.item.creatorId).toBe('creator-123');
    }

    expect(mockUpdate).toHaveBeenCalledWith(items);
    expect(mockSet).toHaveBeenCalledWith({
      creatorId: 'creator-123',
      updatedAt: expect.any(String),
    });
  });
});

describe('prepareBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tracks skipped items, errors, and stores failed items in DLQ', async () => {
    const { db, mockLimit } = createMockDb();
    const mockCreator = vi.mocked(getOrCreateCreator);
    const mockDLQ = vi.mocked(storeToDLQ);
    mockCreator.mockResolvedValue('creator-1');

    mockLimit
      .mockResolvedValueOnce([{ id: 'seen' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const rawItems = [{ id: 'seen' }, { id: 'bad' }, { id: 'good' }];

    const transformFn = (raw: { id: string }) => {
      if (raw.id === 'bad') {
        throw new Error('Transform failed');
      }
      return {
        ...baseItem,
        id: `item-${raw.id}`,
        providerId: raw.id,
      };
    };

    const result = await prepareBatch({
      userId: 'user-1',
      subscriptionId: 'sub-1',
      rawItems,
      provider: Provider.YOUTUBE,
      db: db as never,
      transformFn,
      getProviderId: (raw) => raw.id,
    });

    expect(result.preparedItems).toHaveLength(1);
    expect(result.skippedCount).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.errorDetails[0].providerId).toBe('bad');
    expect(mockDLQ).toHaveBeenCalledTimes(1);
    expect(mockDLQ).toHaveBeenCalledWith(
      db,
      'sub-1',
      'user-1',
      Provider.YOUTUBE,
      'bad',
      { id: 'bad' },
      expect.any(Error)
    );
  });
});
