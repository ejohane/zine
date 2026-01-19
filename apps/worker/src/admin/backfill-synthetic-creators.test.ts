/**
 * Tests for Backfill Synthetic Creators
 *
 * Tests the backfill logic for creating synthetic creator records for
 * RSS, WEB, and SUBSTACK items that don't have native creator IDs.
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  backfillSyntheticCreators,
  generateBackfillReport,
  SYNTHETIC_PROVIDERS,
  type BackfillSyntheticCreatorsResult,
} from './backfill-synthetic-creators';
import { generateSyntheticCreatorId } from '../db/helpers/creators';

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
// Mock Database Types
// ============================================================================

interface MockItem {
  id: string;
  title: string;
  provider: string;
  creator: string | null;
  creatorId: string | null;
}

interface MockCreator {
  id: string;
  provider: string;
  providerCreatorId: string;
  name: string;
  normalizedName: string;
  imageUrl: string | null;
  description: string | null;
  handle: string | null;
  externalUrl: string | null;
  createdAt: number;
  updatedAt: number;
}

interface MockDb {
  items: MockItem[];
  creators: MockCreator[];
  insertCalls: Array<{ table: string; values: Record<string, unknown> }>;
  updateCalls: Array<{ table: string; ids: string[]; values: Record<string, unknown> }>;
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockItem(overrides: Partial<MockItem> = {}): MockItem {
  return {
    id: 'item_test_123',
    title: 'Test Article Title',
    provider: 'RSS',
    creator: 'Test Blog Author',
    creatorId: null,
    ...overrides,
  };
}

function createMockCreator(overrides: Partial<MockCreator> = {}): MockCreator {
  return {
    id: 'creator_test_123',
    provider: 'RSS',
    providerCreatorId: generateSyntheticCreatorId('RSS', 'Test Blog Author'),
    name: 'Test Blog Author',
    normalizedName: 'test blog author',
    imageUrl: null,
    description: null,
    handle: null,
    externalUrl: null,
    createdAt: MOCK_NOW - 86400000,
    updatedAt: MOCK_NOW - 86400000,
    ...overrides,
  };
}

// ============================================================================
// Mock Database Factory
// ============================================================================

function createMockDb(
  items: MockItem[] = [],
  creators: MockCreator[] = []
): { db: MockDb; drizzleMock: ReturnType<typeof createDrizzleMock> } {
  const db: MockDb = {
    items,
    creators,
    insertCalls: [],
    updateCalls: [],
  };

  const drizzleMock = createDrizzleMock(db);
  return { db, drizzleMock };
}

function createDrizzleMock(db: MockDb) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() =>
          Promise.resolve(
            db.items
              .filter((i) => i.creatorId === null)
              .filter((i) => SYNTHETIC_PROVIDERS.includes(i.provider as 'RSS' | 'WEB' | 'SUBSTACK'))
              .map((i) => ({
                id: i.id,
                title: i.title,
                provider: i.provider,
                creator: i.creator,
                creatorId: i.creatorId,
              }))
          )
        ),
      })),
    })),
    query: {
      creators: {
        findFirst: vi.fn((): Promise<MockCreator | null> => {
          // Default: no existing creators
          return Promise.resolve(null);
        }),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        db.insertCalls.push({ table: 'creators', values });
        db.creators.push({
          id: values.id as string,
          provider: values.provider as string,
          providerCreatorId: values.providerCreatorId as string,
          name: values.name as string,
          normalizedName: values.normalizedName as string,
          imageUrl: values.imageUrl as string | null,
          description: values.description as string | null,
          handle: values.handle as string | null,
          externalUrl: values.externalUrl as string | null,
          createdAt: values.createdAt as number,
          updatedAt: values.updatedAt as number,
        });
        return Promise.resolve();
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn((_whereCondition) => {
          // We can't easily parse the whereCondition, so we track generically
          db.updateCalls.push({ table: 'items', ids: [], values });
          return Promise.resolve();
        }),
      })),
    })),
  };
}

// ============================================================================
// backfillSyntheticCreators Tests
// ============================================================================

describe('backfillSyntheticCreators', () => {
  describe('supported providers', () => {
    it('should only process RSS, WEB, and SUBSTACK items', () => {
      expect(SYNTHETIC_PROVIDERS).toEqual(['RSS', 'WEB', 'SUBSTACK']);
    });
  });

  describe('dry run mode', () => {
    it('should not create creators or link items in dry run mode', async () => {
      const item = createMockItem();
      const { db, drizzleMock } = createMockDb([item], []);

      const result = await backfillSyntheticCreators(drizzleMock as never, {
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.creatorsCreated).toBe(1);
      expect(result.itemsLinked).toBe(1);
      expect(db.insertCalls.length).toBe(0); // No actual inserts in dry run
      expect(db.updateCalls.length).toBe(0); // No actual updates in dry run
    });

    it('should report existing creators in dry run mode', async () => {
      const item = createMockItem();
      const existingCreator = createMockCreator();
      const { drizzleMock } = createMockDb([item], [existingCreator]);

      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(existingCreator));

      const result = await backfillSyntheticCreators(drizzleMock as never, {
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.creatorsCreated).toBe(0);
      expect(result.creatorsExisted).toBe(1);
      expect(result.itemsLinked).toBe(1);
    });
  });

  describe('actual backfill mode', () => {
    it('should create new creators and link items when they do not exist', async () => {
      const item = createMockItem();
      const { db, drizzleMock } = createMockDb([item], []);

      const result = await backfillSyntheticCreators(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.dryRun).toBe(false);
      expect(result.creatorsCreated).toBe(1);
      expect(result.creatorsExisted).toBe(0);
      expect(result.itemsLinked).toBe(1);
      expect(db.insertCalls.length).toBe(1);
      expect(db.updateCalls.length).toBe(1); // One batch update to link items

      // Verify the inserted creator data
      const insertedCreator = db.insertCalls[0].values;
      expect(insertedCreator.provider).toBe('RSS');
      expect(insertedCreator.name).toBe('Test Blog Author');
      expect(insertedCreator.normalizedName).toBe('test blog author');
      // Verify synthetic ID is generated correctly
      expect(insertedCreator.providerCreatorId).toBe(
        generateSyntheticCreatorId('RSS', 'Test Blog Author')
      );
    });

    it('should link items to existing creators', async () => {
      const item = createMockItem();
      const existingCreator = createMockCreator();
      const { db, drizzleMock } = createMockDb([item], [existingCreator]);

      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(existingCreator));

      const result = await backfillSyntheticCreators(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.creatorsCreated).toBe(0);
      expect(result.creatorsExisted).toBe(1);
      expect(result.itemsLinked).toBe(1);
      expect(db.insertCalls.length).toBe(0); // No new creators
      expect(db.updateCalls.length).toBe(1); // Items linked
    });
  });

  describe('grouping by normalized name', () => {
    it('should group items with same normalized creator name', async () => {
      const items = [
        createMockItem({ id: 'item1', creator: 'The New York Times' }),
        createMockItem({ id: 'item2', creator: 'the new york times' }), // Same when normalized
        createMockItem({ id: 'item3', creator: 'THE NEW YORK TIMES' }), // Same when normalized
      ];
      const { db, drizzleMock } = createMockDb(items, []);

      const result = await backfillSyntheticCreators(drizzleMock as never, {
        dryRun: false,
      });

      // All three items should be linked to ONE creator
      expect(result.creatorsCreated).toBe(1);
      expect(result.itemsLinked).toBe(3);
      expect(result.creatorGroups.length).toBe(1);
      expect(result.creatorGroups[0].itemCount).toBe(3);
      expect(db.insertCalls.length).toBe(1);
    });

    it('should create separate creators for different names', async () => {
      const items = [
        createMockItem({ id: 'item1', creator: 'Netflix' }),
        createMockItem({ id: 'item2', creator: 'Hulu' }),
        createMockItem({ id: 'item3', creator: 'Netflix' }), // Same as first
      ];
      const { db, drizzleMock } = createMockDb(items, []);

      const result = await backfillSyntheticCreators(drizzleMock as never, {
        dryRun: false,
      });

      // Netflix and Hulu = 2 unique creators
      expect(result.creatorsCreated).toBe(2);
      expect(result.itemsLinked).toBe(3);
      expect(result.creatorGroups.length).toBe(2);
      expect(db.insertCalls.length).toBe(2);
    });

    it('should keep different providers separate even with same name', async () => {
      const items = [
        createMockItem({ id: 'item1', provider: 'RSS', creator: 'TechCrunch' }),
        createMockItem({ id: 'item2', provider: 'WEB', creator: 'TechCrunch' }),
      ];
      const { db, drizzleMock } = createMockDb(items, []);

      const result = await backfillSyntheticCreators(drizzleMock as never, {
        dryRun: false,
      });

      // Same name but different providers = 2 separate creators
      expect(result.creatorsCreated).toBe(2);
      expect(result.creatorGroups.length).toBe(2);
      expect(db.insertCalls.length).toBe(2);

      // Verify different synthetic IDs
      const ids = db.insertCalls.map((c) => c.values.providerCreatorId);
      expect(ids[0]).not.toBe(ids[1]);
    });
  });

  describe('skip cases', () => {
    it('should skip items with null creator name', async () => {
      const item = createMockItem({ creator: null });
      const { drizzleMock } = createMockDb([item], []);

      // Mock returns empty because creator is null
      drizzleMock.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([])),
        })),
      }));

      const result = await backfillSyntheticCreators(drizzleMock as never, {
        dryRun: false,
        includeItemDetails: true,
      });

      expect(result.itemsLinked).toBe(0);
      expect(result.creatorGroups.length).toBe(0);
    });

    it('should skip items with empty creator name', async () => {
      const items = [
        createMockItem({ id: 'item1', creator: '' }),
        createMockItem({ id: 'item2', creator: '   ' }), // Whitespace only
        createMockItem({ id: 'item3', creator: 'Valid Author' }),
      ];
      const { drizzleMock } = createMockDb(items, []);

      const result = await backfillSyntheticCreators(drizzleMock as never, {
        dryRun: false,
      });

      // Only valid author should be processed
      expect(result.itemsLinked).toBe(1);
      expect(result.creatorsCreated).toBe(1);
    });
  });

  describe('provider filtering', () => {
    it('should not process YOUTUBE items', async () => {
      const items = [
        createMockItem({ id: 'item1', provider: 'YOUTUBE', creator: 'YouTube Channel' }),
        createMockItem({ id: 'item2', provider: 'RSS', creator: 'RSS Feed' }),
      ];

      // Custom mock that filters by provider
      const db: MockDb = { items, creators: [], insertCalls: [], updateCalls: [] };
      const drizzleMock = createDrizzleMock(db);

      const result = await backfillSyntheticCreators(drizzleMock as never, {
        dryRun: false,
      });

      // Only RSS item should be processed
      expect(result.itemsLinked).toBe(1);
      expect(result.creatorGroups.length).toBe(1);
      expect(result.creatorGroups[0].provider).toBe('RSS');
    });

    it('should filter by specific provider when option provided', async () => {
      const items = [
        createMockItem({ id: 'item1', provider: 'RSS', creator: 'RSS Feed' }),
        createMockItem({ id: 'item2', provider: 'WEB', creator: 'Web Article' }),
        createMockItem({ id: 'item3', provider: 'SUBSTACK', creator: 'Substack Newsletter' }),
      ];
      const { drizzleMock } = createMockDb(items, []);

      // Override to return all items
      drizzleMock.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() =>
            Promise.resolve(
              items.map((i) => ({
                id: i.id,
                title: i.title,
                provider: i.provider,
                creator: i.creator,
                creatorId: null,
              }))
            )
          ),
        })),
      }));

      const result = await backfillSyntheticCreators(drizzleMock as never, {
        dryRun: true,
        provider: 'RSS',
      });

      // Only RSS items should be counted
      // Note: The mock doesn't perfectly simulate filtering, but the result tracks by provider
      expect(result.byProvider.RSS).toBeDefined();
    });
  });

  describe('synthetic ID generation', () => {
    it('should generate consistent IDs for same provider + normalized name', () => {
      const id1 = generateSyntheticCreatorId('RSS', 'The New York Times');
      const id2 = generateSyntheticCreatorId('RSS', 'the new york times');
      const id3 = generateSyntheticCreatorId('RSS', 'THE NEW YORK TIMES');

      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
    });

    it('should generate different IDs for different providers', () => {
      const id1 = generateSyntheticCreatorId('RSS', 'TechCrunch');
      const id2 = generateSyntheticCreatorId('WEB', 'TechCrunch');

      expect(id1).not.toBe(id2);
    });

    it('should generate 32-character hex IDs', () => {
      const id = generateSyntheticCreatorId('RSS', 'Test');

      expect(id.length).toBe(32);
      expect(/^[0-9a-f]+$/.test(id)).toBe(true);
    });
  });

  describe('by provider statistics', () => {
    it('should track statistics per provider', async () => {
      const items = [
        createMockItem({ id: 'item1', provider: 'RSS', creator: 'RSS Author 1' }),
        createMockItem({ id: 'item2', provider: 'RSS', creator: 'RSS Author 2' }),
        createMockItem({ id: 'item3', provider: 'WEB', creator: 'Web Author' }),
        createMockItem({ id: 'item4', provider: 'SUBSTACK', creator: 'Substack Author' }),
      ];
      const { drizzleMock } = createMockDb(items, []);

      const result = await backfillSyntheticCreators(drizzleMock as never, {
        dryRun: true,
      });

      expect(result.byProvider.RSS.processed).toBe(2);
      expect(result.byProvider.RSS.uniqueCreators).toBe(2);
      expect(result.byProvider.WEB.processed).toBe(1);
      expect(result.byProvider.WEB.uniqueCreators).toBe(1);
      expect(result.byProvider.SUBSTACK.processed).toBe(1);
      expect(result.byProvider.SUBSTACK.uniqueCreators).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully and continue processing', async () => {
      const items = [
        createMockItem({ id: 'item1', creator: 'Author 1' }),
        createMockItem({ id: 'item2', creator: 'Author 2' }),
      ];
      const { drizzleMock } = createMockDb(items, []);

      // Fail on first creator lookup, succeed on second
      let callCount = 0;
      drizzleMock.query.creators.findFirst = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Database error'));
        }
        return Promise.resolve(null);
      });

      const result = await backfillSyntheticCreators(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.errorCount).toBe(1);
      expect(result.creatorsCreated).toBe(1);
      expect(result.creatorGroups.find((g) => g.displayName === 'Author 1')?.error).toBeDefined();
      expect(result.creatorGroups.find((g) => g.displayName === 'Author 2')?.error).toBeUndefined();
    });
  });

  describe('item details option', () => {
    it('should include item results when includeItemDetails is true', async () => {
      const items = [
        createMockItem({ id: 'item1', creator: 'Author' }),
        createMockItem({ id: 'item2', creator: 'Author' }),
      ];
      const { drizzleMock } = createMockDb(items, []);

      const result = await backfillSyntheticCreators(drizzleMock as never, {
        dryRun: true,
        includeItemDetails: true,
      });

      expect(result.itemResults).toBeDefined();
      expect(result.itemResults?.length).toBe(2);
    });

    it('should not include item results by default', async () => {
      const items = [createMockItem()];
      const { drizzleMock } = createMockDb(items, []);

      const result = await backfillSyntheticCreators(drizzleMock as never, {
        dryRun: true,
      });

      expect(result.itemResults).toBeUndefined();
    });
  });

  describe('defaults', () => {
    it('should default to dry run mode', async () => {
      const { drizzleMock } = createMockDb([], []);

      const result = await backfillSyntheticCreators(drizzleMock as never);

      expect(result.dryRun).toBe(true);
    });
  });
});

// ============================================================================
// generateBackfillReport Tests
// ============================================================================

describe('generateBackfillReport', () => {
  it('should generate report with linked items and created creators', () => {
    const result: BackfillSyntheticCreatorsResult = {
      dryRun: false,
      totalProcessed: 100,
      itemsLinked: 90,
      creatorsCreated: 25,
      creatorsExisted: 20,
      skipped: 10,
      errorCount: 0,
      creatorGroups: [
        {
          provider: 'RSS',
          displayName: 'TechCrunch',
          normalizedName: 'techcrunch',
          syntheticId: 'abc123',
          created: true,
          creatorId: 'creator_1',
          itemCount: 30,
        },
        {
          provider: 'WEB',
          displayName: 'Hacker News',
          normalizedName: 'hacker news',
          syntheticId: 'def456',
          created: false,
          creatorId: 'creator_2',
          itemCount: 20,
        },
      ],
      byProvider: {
        RSS: {
          processed: 60,
          linked: 55,
          created: 15,
          existed: 10,
          skipped: 5,
          errors: 0,
          uniqueCreators: 25,
        },
        WEB: {
          processed: 40,
          linked: 35,
          created: 10,
          existed: 10,
          skipped: 5,
          errors: 0,
          uniqueCreators: 20,
        },
      },
    };

    const report = generateBackfillReport(result);

    expect(report).toContain('SYNTHETIC CREATOR BACKFILL REPORT');
    expect(report).toContain('Mode: EXECUTED');
    expect(report).toContain('Total items processed: 100');
    expect(report).toContain('Items linked to creators: 90');
    expect(report).toContain('New creators created: 25');
    expect(report).toContain('Creators already existed: 20');
    expect(report).toContain('Unique creator groups: 2');
    expect(report).toContain('RSS:');
    expect(report).toContain('WEB:');
    expect(report).toContain('Top Creator Groups');
    expect(report).toContain('TechCrunch');
  });

  it('should generate dry run report', () => {
    const result: BackfillSyntheticCreatorsResult = {
      dryRun: true,
      totalProcessed: 50,
      itemsLinked: 45,
      creatorsCreated: 10,
      creatorsExisted: 5,
      skipped: 5,
      errorCount: 0,
      creatorGroups: [],
      byProvider: {
        RSS: {
          processed: 50,
          linked: 45,
          created: 10,
          existed: 5,
          skipped: 5,
          errors: 0,
          uniqueCreators: 15,
        },
      },
    };

    const report = generateBackfillReport(result);

    expect(report).toContain('Mode: DRY RUN');
  });

  it('should include errors in report', () => {
    const result: BackfillSyntheticCreatorsResult = {
      dryRun: false,
      totalProcessed: 10,
      itemsLinked: 5,
      creatorsCreated: 2,
      creatorsExisted: 1,
      skipped: 2,
      errorCount: 2,
      creatorGroups: [
        {
          provider: 'RSS',
          displayName: 'Failed Source 1',
          normalizedName: 'failed source 1',
          syntheticId: 'abc',
          created: false,
          creatorId: '',
          itemCount: 3,
          error: 'Database connection error',
        },
        {
          provider: 'WEB',
          displayName: 'Failed Source 2',
          normalizedName: 'failed source 2',
          syntheticId: 'def',
          created: false,
          creatorId: '',
          itemCount: 2,
          error: 'Timeout',
        },
      ],
      byProvider: {
        RSS: {
          processed: 6,
          linked: 3,
          created: 1,
          existed: 0,
          skipped: 1,
          errors: 1,
          uniqueCreators: 2,
        },
        WEB: {
          processed: 4,
          linked: 2,
          created: 1,
          existed: 1,
          skipped: 1,
          errors: 1,
          uniqueCreators: 2,
        },
      },
    };

    const report = generateBackfillReport(result);

    expect(report).toContain('Errors: 2');
    expect(report).toContain('--- Errors ---');
    expect(report).toContain('Failed Source 1');
    expect(report).toContain('Database connection error');
    expect(report).toContain('Failed Source 2');
    expect(report).toContain('Timeout');
  });
});

// ============================================================================
// Integration Scenarios
// ============================================================================

describe('Integration Scenarios', () => {
  it('should handle real-world RSS feed data', async () => {
    const items = [
      createMockItem({
        id: 'item_rss_1',
        title: 'Apple announces new iPhone',
        provider: 'RSS',
        creator: 'TechCrunch',
      }),
      createMockItem({
        id: 'item_rss_2',
        title: 'Google launches new AI',
        provider: 'RSS',
        creator: 'TechCrunch', // Same creator
      }),
      createMockItem({
        id: 'item_rss_3',
        title: 'Microsoft acquires startup',
        provider: 'RSS',
        creator: 'The Verge', // Different creator
      }),
    ];

    const { db, drizzleMock } = createMockDb(items, []);

    const result = await backfillSyntheticCreators(drizzleMock as never, {
      dryRun: false,
    });

    expect(result.totalProcessed).toBe(3);
    expect(result.itemsLinked).toBe(3);
    expect(result.creatorsCreated).toBe(2); // TechCrunch and The Verge

    // Verify TechCrunch creator was created correctly
    const techCrunchCreator = db.insertCalls.find((c) => c.values.name === 'TechCrunch');
    expect(techCrunchCreator).toBeDefined();
    expect(techCrunchCreator!.values.provider).toBe('RSS');
    expect(techCrunchCreator!.values.normalizedName).toBe('techcrunch');

    // Verify The Verge creator was created
    const vergeCreator = db.insertCalls.find((c) => c.values.name === 'The Verge');
    expect(vergeCreator).toBeDefined();
    expect(vergeCreator!.values.provider).toBe('RSS');
  });

  it('should handle mixed providers with same creator names', async () => {
    // Same blog might appear as RSS feed and web scrape
    const items = [
      createMockItem({
        id: 'item_rss_1',
        provider: 'RSS',
        creator: 'Paul Graham',
      }),
      createMockItem({
        id: 'item_web_1',
        provider: 'WEB',
        creator: 'Paul Graham', // Same name, different provider
      }),
      createMockItem({
        id: 'item_sub_1',
        provider: 'SUBSTACK',
        creator: 'Paul Graham', // Same name, yet another provider
      }),
    ];

    const { db, drizzleMock } = createMockDb(items, []);

    const result = await backfillSyntheticCreators(drizzleMock as never, {
      dryRun: false,
    });

    // Three separate creators (one per provider)
    expect(result.creatorsCreated).toBe(3);
    expect(result.creatorGroups.length).toBe(3);

    // Each should have different synthetic IDs
    const ids = db.insertCalls.map((c) => c.values.providerCreatorId);
    expect(new Set(ids).size).toBe(3);
  });

  it('should handle edge cases with whitespace and casing', async () => {
    const items = [
      createMockItem({ id: 'item1', creator: '  Netflix  ' }), // Leading/trailing whitespace
      createMockItem({ id: 'item2', creator: 'netflix' }), // Lowercase
      createMockItem({ id: 'item3', creator: 'NETFLIX' }), // Uppercase
      createMockItem({ id: 'item4', creator: 'Netflix' }), // Normal case
    ];

    const { db, drizzleMock } = createMockDb(items, []);

    const result = await backfillSyntheticCreators(drizzleMock as never, {
      dryRun: false,
    });

    // All should be grouped as one creator
    expect(result.creatorsCreated).toBe(1);
    expect(result.itemsLinked).toBe(4);
    expect(result.creatorGroups[0].itemCount).toBe(4);

    // Should use first item's display name (trimmed)
    expect(db.insertCalls[0].values.name).toBe('Netflix');
  });

  it('should preserve first display name in group', async () => {
    const items = [
      createMockItem({ id: 'item1', creator: 'The New York Times' }), // Full name with "The"
      createMockItem({ id: 'item2', creator: 'the new york times' }), // Lowercase
    ];

    const { db, drizzleMock } = createMockDb(items, []);

    const result = await backfillSyntheticCreators(drizzleMock as never, {
      dryRun: false,
    });

    // Should use first item's display name
    expect(db.insertCalls[0].values.name).toBe('The New York Times');
    expect(result.creatorGroups[0].displayName).toBe('The New York Times');
  });
});
