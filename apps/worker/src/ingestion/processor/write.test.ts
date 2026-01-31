/**
 * Tests for ingestion write helpers
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect } from 'vitest';
import { ContentType, Provider } from '@zine/shared';
import { items, providerItemsSeen, subscriptionItems, userItems } from '../../db/schema';
import { buildIngestionStatements, executeBatchStatements } from './write';

const createPreparedItem = (
  overrides: Partial<Parameters<typeof buildIngestionStatements>[0]> = {}
) => ({
  newItem: {
    id: '01HRG9J9Z0D4P2JH6Y0YH1K4QG',
    providerId: 'provider-1',
    provider: Provider.YOUTUBE,
    contentType: ContentType.VIDEO,
    title: 'Test Title',
    canonicalUrl: 'https://example.com/video',
    creator: 'Test Creator',
    publishedAt: 1705320000000,
    createdAt: 1705320000000,
  },
  rawItem: { id: 'raw-1' },
  providerId: 'provider-1',
  canonicalItemId: '01HRG9J9Z0D4P2JH6Y0YH1K4QG',
  canonicalItemExists: false,
  userItemId: '01HRG9J9Z0D4P2JH6Y0YH1K4QH',
  creatorId: 'creator-1',
  ...overrides,
});

const createMockDb = () => {
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const insert = (table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      inserted.push({ table, values });
      return { onConflictDoNothing: () => ({}) };
    },
  });

  return { db: { insert }, inserted };
};

describe('buildIngestionStatements', () => {
  it('builds canonical, user, subscription, and seen inserts when item is new', () => {
    const { db, inserted } = createMockDb();
    const prepared = createPreparedItem();
    const nowISO = '2024-01-15T12:00:00.000Z';
    const now = 1705320000000;

    const statements = buildIngestionStatements(prepared, {
      db: db as never,
      userId: 'user-1',
      subscriptionId: 'sub-1',
      provider: Provider.YOUTUBE,
      nowISO,
      now,
    });

    expect(statements).toHaveLength(4);
    expect(inserted).toHaveLength(4);

    const itemInsert = inserted.find((entry) => entry.table === items);
    expect(itemInsert?.values).toMatchObject({
      id: prepared.newItem.id,
      provider: Provider.YOUTUBE,
      providerId: prepared.newItem.providerId,
      canonicalUrl: prepared.newItem.canonicalUrl,
      creatorId: prepared.creatorId,
      publishedAt: new Date(prepared.newItem.publishedAt).toISOString(),
      createdAt: nowISO,
      updatedAt: nowISO,
    });

    const userItemInsert = inserted.find((entry) => entry.table === userItems);
    expect(userItemInsert?.values).toMatchObject({
      id: prepared.userItemId,
      userId: 'user-1',
      itemId: prepared.canonicalItemId,
    });

    const subscriptionInsert = inserted.find((entry) => entry.table === subscriptionItems);
    expect(subscriptionInsert?.values).toMatchObject({
      subscriptionId: 'sub-1',
      itemId: prepared.canonicalItemId,
      providerItemId: prepared.newItem.providerId,
      fetchedAt: now,
    });

    const seenInsert = inserted.find((entry) => entry.table === providerItemsSeen);
    expect(seenInsert?.values).toMatchObject({
      userId: 'user-1',
      provider: Provider.YOUTUBE,
      providerItemId: prepared.newItem.providerId,
      firstSeenAt: nowISO,
    });
  });

  it('skips canonical insert when canonical item already exists', () => {
    const { db, inserted } = createMockDb();
    const prepared = createPreparedItem({ canonicalItemExists: true });

    const statements = buildIngestionStatements(prepared, {
      db: db as never,
      userId: 'user-1',
      subscriptionId: 'sub-1',
      provider: Provider.YOUTUBE,
      nowISO: '2024-01-15T12:00:00.000Z',
      now: 1705320000000,
    });

    expect(statements).toHaveLength(3);
    expect(inserted.find((entry) => entry.table === items)).toBeUndefined();
  });

  it('stores null publishedAt when timestamp is zero', () => {
    const { db, inserted } = createMockDb();
    const prepared = createPreparedItem({
      newItem: {
        ...createPreparedItem().newItem,
        publishedAt: 0,
      },
    });

    buildIngestionStatements(prepared, {
      db: db as never,
      userId: 'user-1',
      subscriptionId: 'sub-1',
      provider: Provider.YOUTUBE,
      nowISO: '2024-01-15T12:00:00.000Z',
      now: 1705320000000,
    });

    const itemInsert = inserted.find((entry) => entry.table === items);
    expect(itemInsert?.values.publishedAt).toBeNull();
  });
});

describe('executeBatchStatements', () => {
  it('passes statements to db.batch', async () => {
    const mockBatch = async (_statements: unknown[]) => undefined;
    const db = { batch: mockBatch } as never;
    const statements = [{ a: 1 }, { b: 2 }];

    await expect(executeBatchStatements(statements, db)).resolves.toBeUndefined();
  });
});
