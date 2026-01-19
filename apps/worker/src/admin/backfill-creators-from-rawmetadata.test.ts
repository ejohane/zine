/**
 * Tests for Backfill Creators from rawMetadata
 *
 * Tests the backfill logic for creating creator records from item rawMetadata.
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  backfillCreatorsFromRawMetadata,
  generateBackfillReport,
  type BackfillCreatorsFromRawMetadataResult,
} from './backfill-creators-from-rawmetadata';

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
  rawMetadata: string | null;
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
  updateCalls: Array<{ table: string; values: Record<string, unknown>; id: string }>;
}

// ============================================================================
// Test Fixtures - Sample rawMetadata
// ============================================================================

const YOUTUBE_RAW_METADATA = JSON.stringify({
  snippet: {
    channelId: 'UC1234567890',
    channelTitle: 'Test YouTube Channel',
    title: 'Test Video Title',
    description: 'Test video description',
    publishedAt: '2024-01-01T00:00:00Z',
  },
});

const SPOTIFY_RAW_METADATA = JSON.stringify({
  show: {
    id: 'spotify_show_123',
    name: 'Test Podcast Show',
    images: [{ url: 'https://spotify.com/image.jpg', height: 300, width: 300 }],
    description: 'A great podcast about testing',
  },
  name: 'Episode Title',
  duration_ms: 3600000,
});

const X_RAW_METADATA = JSON.stringify({
  author: {
    id: 'x_user_12345',
    name: 'Test X User',
    username: 'testxuser',
  },
  text: 'Test tweet content',
  created_at: '2024-01-01T12:00:00.000Z',
});

const INCOMPLETE_YOUTUBE_METADATA = JSON.stringify({
  snippet: {
    title: 'Video without channel info',
    // Missing channelId and channelTitle
  },
});

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockItem(overrides: Partial<MockItem> = {}): MockItem {
  return {
    id: 'item_test_123',
    title: 'Test Video Title',
    provider: 'YOUTUBE',
    rawMetadata: YOUTUBE_RAW_METADATA,
    creatorId: null,
    ...overrides,
  };
}

function createMockCreator(overrides: Partial<MockCreator> = {}): MockCreator {
  return {
    id: 'creator_test_123',
    provider: 'YOUTUBE',
    providerCreatorId: 'UC1234567890',
    name: 'Test YouTube Channel',
    normalizedName: 'test youtube channel',
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
              .map((i) => ({
                id: i.id,
                title: i.title,
                provider: i.provider,
                rawMetadata: i.rawMetadata,
                creatorId: i.creatorId,
              }))
          )
        ),
      })),
    })),
    query: {
      creators: {
        findFirst: vi.fn(() => {
          // Simulate finding a creator
          return Promise.resolve(db.creators.length > 0 ? db.creators[0] : null);
        }),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => {
        db.insertCalls.push({ table: 'creators', values });
        // Add to creators array to simulate insertion
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
          db.updateCalls.push({ table: 'items', values, id: 'unknown' });
          return Promise.resolve();
        }),
      })),
    })),
  };
}

// ============================================================================
// backfillCreatorsFromRawMetadata Tests
// ============================================================================

describe('backfillCreatorsFromRawMetadata', () => {
  describe('dry run mode', () => {
    it('should not create creators or link items in dry run mode', async () => {
      const item = createMockItem();
      const { db, drizzleMock } = createMockDb([item], []);

      // No existing creators
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
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

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
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

      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.dryRun).toBe(false);
      expect(result.creatorsCreated).toBe(1);
      expect(result.creatorsExisted).toBe(0);
      expect(result.itemsLinked).toBe(1);
      expect(db.insertCalls.length).toBe(1);
      expect(db.updateCalls.length).toBe(1); // One update to link item

      // Verify the inserted creator data from YouTube metadata
      const insertedCreator = db.insertCalls[0].values;
      expect(insertedCreator.provider).toBe('YOUTUBE');
      expect(insertedCreator.providerCreatorId).toBe('UC1234567890');
      expect(insertedCreator.name).toBe('Test YouTube Channel');
      expect(insertedCreator.normalizedName).toBe('test youtube channel');
    });

    it('should link items to existing creators', async () => {
      const item = createMockItem();
      const existingCreator = createMockCreator();
      const { db, drizzleMock } = createMockDb([item], [existingCreator]);

      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(existingCreator));

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.creatorsCreated).toBe(0);
      expect(result.creatorsExisted).toBe(1);
      expect(result.itemsLinked).toBe(1);
      expect(db.insertCalls.length).toBe(0); // No new creators
      expect(db.updateCalls.length).toBe(1); // Item linked
    });
  });

  describe('provider-specific extraction', () => {
    it('should extract creator from YouTube rawMetadata', async () => {
      const item = createMockItem({
        provider: 'YOUTUBE',
        rawMetadata: YOUTUBE_RAW_METADATA,
      });
      const { db, drizzleMock } = createMockDb([item], []);
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.itemsLinked).toBe(1);
      expect(db.insertCalls[0].values.provider).toBe('YOUTUBE');
      expect(db.insertCalls[0].values.providerCreatorId).toBe('UC1234567890');
      expect(db.insertCalls[0].values.name).toBe('Test YouTube Channel');
    });

    it('should extract creator from Spotify rawMetadata', async () => {
      const item = createMockItem({
        id: 'item_spotify_123',
        provider: 'SPOTIFY',
        rawMetadata: SPOTIFY_RAW_METADATA,
      });
      const { db, drizzleMock } = createMockDb([item], []);
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.itemsLinked).toBe(1);
      expect(db.insertCalls[0].values.provider).toBe('SPOTIFY');
      expect(db.insertCalls[0].values.providerCreatorId).toBe('spotify_show_123');
      expect(db.insertCalls[0].values.name).toBe('Test Podcast Show');
      expect(db.insertCalls[0].values.imageUrl).toBe('https://spotify.com/image.jpg');
    });

    it('should extract creator from X rawMetadata', async () => {
      const item = createMockItem({
        id: 'item_x_123',
        provider: 'X',
        rawMetadata: X_RAW_METADATA,
      });
      const { db, drizzleMock } = createMockDb([item], []);
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.itemsLinked).toBe(1);
      expect(db.insertCalls[0].values.provider).toBe('X');
      expect(db.insertCalls[0].values.providerCreatorId).toBe('x_user_12345');
      expect(db.insertCalls[0].values.name).toBe('Test X User');
      expect(db.insertCalls[0].values.handle).toBe('testxuser');
    });
  });

  describe('skip cases', () => {
    it('should skip items without rawMetadata', async () => {
      const item = createMockItem({ rawMetadata: null });
      const { drizzleMock } = createMockDb([item], []);

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.skipped).toBe(1);
      expect(result.itemsLinked).toBe(0);
      expect(result.results[0].skipReason).toBe('no_rawmetadata');
    });

    it('should skip items with invalid JSON in rawMetadata', async () => {
      const item = createMockItem({ rawMetadata: 'not valid json {{{' });
      const { drizzleMock } = createMockDb([item], []);

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.skipped).toBe(1);
      expect(result.itemsLinked).toBe(0);
      expect(result.results[0].skipReason).toBe('json_parse_error');
    });

    it('should skip items with incomplete rawMetadata', async () => {
      const item = createMockItem({
        rawMetadata: INCOMPLETE_YOUTUBE_METADATA,
      });
      const { drizzleMock } = createMockDb([item], []);

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.skipped).toBe(1);
      expect(result.itemsLinked).toBe(0);
      expect(result.results[0].skipReason).toBe('extraction_failed');
    });

    it('should skip items from unsupported providers', async () => {
      const item = createMockItem({
        provider: 'RSS',
        rawMetadata: JSON.stringify({ some: 'data' }),
      });
      const { drizzleMock } = createMockDb([item], []);

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.skipped).toBe(1);
      expect(result.results[0].skipReason).toBe('extraction_failed');
    });
  });

  describe('filtering', () => {
    it('should filter by provider', async () => {
      const items = [
        createMockItem({ id: 'item1', provider: 'YOUTUBE' }),
        createMockItem({ id: 'item2', provider: 'SPOTIFY', rawMetadata: SPOTIFY_RAW_METADATA }),
        createMockItem({ id: 'item3', provider: 'YOUTUBE' }),
      ];
      const { drizzleMock } = createMockDb(items, []);
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
        dryRun: true,
        provider: 'YOUTUBE',
      });

      expect(result.totalProcessed).toBe(2);
    });

    it('should limit number of items', async () => {
      const items = Array.from({ length: 10 }, (_, i) => createMockItem({ id: `item${i}` }));
      const { drizzleMock } = createMockDb(items, []);
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
        dryRun: true,
        limit: 5,
      });

      expect(result.totalProcessed).toBe(5);
    });
  });

  describe('by provider statistics', () => {
    it('should track statistics per provider', async () => {
      const items = [
        createMockItem({ id: 'item1', provider: 'YOUTUBE' }),
        createMockItem({ id: 'item2', provider: 'YOUTUBE' }),
        createMockItem({ id: 'item3', provider: 'SPOTIFY', rawMetadata: SPOTIFY_RAW_METADATA }),
      ];
      const { drizzleMock } = createMockDb(items, []);
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
        dryRun: true,
      });

      expect(result.byProvider.YOUTUBE.processed).toBe(2);
      expect(result.byProvider.YOUTUBE.linked).toBe(2);
      expect(result.byProvider.SPOTIFY.processed).toBe(1);
      expect(result.byProvider.SPOTIFY.linked).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully and continue processing', async () => {
      const items = [createMockItem({ id: 'item1' }), createMockItem({ id: 'item2' })];
      const { drizzleMock } = createMockDb(items, []);

      // Track calls to fail only item1
      let callCount = 0;
      drizzleMock.query.creators.findFirst = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Database error'));
        }
        return Promise.resolve(null);
      });

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.errorCount).toBe(1);
      expect(result.itemsLinked).toBe(1);
      expect(result.results.find((r) => r.itemId === 'item1')?.error).toBeDefined();
      expect(result.results.find((r) => r.itemId === 'item2')?.error).toBeUndefined();
    });
  });

  describe('defaults', () => {
    it('should default to dry run mode', async () => {
      const { drizzleMock } = createMockDb([], []);

      const result = await backfillCreatorsFromRawMetadata(drizzleMock as never);

      expect(result.dryRun).toBe(true);
    });
  });
});

// ============================================================================
// generateBackfillReport Tests
// ============================================================================

describe('generateBackfillReport', () => {
  it('should generate report with linked items and created creators', () => {
    const result: BackfillCreatorsFromRawMetadataResult = {
      dryRun: false,
      totalProcessed: 10,
      itemsLinked: 8,
      creatorsCreated: 3,
      creatorsExisted: 5,
      skipped: 2,
      errorCount: 0,
      results: [],
      byProvider: {
        YOUTUBE: { processed: 6, linked: 5, created: 2, existed: 3, skipped: 1, errors: 0 },
        SPOTIFY: { processed: 4, linked: 3, created: 1, existed: 2, skipped: 1, errors: 0 },
      },
    };

    const report = generateBackfillReport(result);

    expect(report).toContain('CREATOR BACKFILL FROM RAWMETADATA REPORT');
    expect(report).toContain('Mode: EXECUTED');
    expect(report).toContain('Total items processed: 10');
    expect(report).toContain('Items linked to creators: 8');
    expect(report).toContain('New creators created: 3');
    expect(report).toContain('Creators already existed: 5');
    expect(report).toContain('Skipped: 2');
    expect(report).toContain('YOUTUBE:');
    expect(report).toContain('SPOTIFY:');
  });

  it('should generate dry run report', () => {
    const result: BackfillCreatorsFromRawMetadataResult = {
      dryRun: true,
      totalProcessed: 5,
      itemsLinked: 4,
      creatorsCreated: 2,
      creatorsExisted: 2,
      skipped: 1,
      errorCount: 0,
      results: [],
      byProvider: {
        YOUTUBE: { processed: 5, linked: 4, created: 2, existed: 2, skipped: 1, errors: 0 },
      },
    };

    const report = generateBackfillReport(result);

    expect(report).toContain('Mode: DRY RUN');
  });

  it('should include skip reasons in report', () => {
    const result: BackfillCreatorsFromRawMetadataResult = {
      dryRun: false,
      totalProcessed: 5,
      itemsLinked: 2,
      creatorsCreated: 1,
      creatorsExisted: 1,
      skipped: 3,
      errorCount: 0,
      results: [
        {
          itemId: 'item1',
          itemTitle: 'No metadata item',
          provider: 'YOUTUBE',
          created: false,
          linked: false,
          skipReason: 'no_rawmetadata',
        },
        {
          itemId: 'item2',
          itemTitle: 'Bad JSON item',
          provider: 'YOUTUBE',
          created: false,
          linked: false,
          skipReason: 'json_parse_error',
        },
        {
          itemId: 'item3',
          itemTitle: 'Extraction failed item',
          provider: 'RSS',
          created: false,
          linked: false,
          skipReason: 'extraction_failed',
        },
      ],
      byProvider: {
        YOUTUBE: { processed: 4, linked: 2, created: 1, existed: 1, skipped: 2, errors: 0 },
        RSS: { processed: 1, linked: 0, created: 0, existed: 0, skipped: 1, errors: 0 },
      },
    };

    const report = generateBackfillReport(result);

    expect(report).toContain('Skip Reasons');
    expect(report).toContain('no_rawmetadata: 1');
    expect(report).toContain('json_parse_error: 1');
    expect(report).toContain('extraction_failed: 1');
  });

  it('should include errors in report', () => {
    const result: BackfillCreatorsFromRawMetadataResult = {
      dryRun: false,
      totalProcessed: 3,
      itemsLinked: 1,
      creatorsCreated: 1,
      creatorsExisted: 0,
      skipped: 0,
      errorCount: 2,
      results: [
        {
          itemId: 'item1',
          itemTitle: 'Success item',
          provider: 'YOUTUBE',
          created: true,
          creatorId: 'creator1',
          linked: true,
        },
        {
          itemId: 'item2',
          itemTitle: 'Failed item 1',
          provider: 'YOUTUBE',
          created: false,
          linked: false,
          error: 'Database connection error',
        },
        {
          itemId: 'item3',
          itemTitle: 'Failed item 2',
          provider: 'SPOTIFY',
          created: false,
          linked: false,
          error: 'Unknown error',
        },
      ],
      byProvider: {
        YOUTUBE: { processed: 2, linked: 1, created: 1, existed: 0, skipped: 0, errors: 1 },
        SPOTIFY: { processed: 1, linked: 0, created: 0, existed: 0, skipped: 0, errors: 1 },
      },
    };

    const report = generateBackfillReport(result);

    expect(report).toContain('Errors: 2');
    expect(report).toContain('--- Errors ---');
    expect(report).toContain('Failed item 1');
    expect(report).toContain('Database connection error');
    expect(report).toContain('Failed item 2');
    expect(report).toContain('Unknown error');
  });
});

// ============================================================================
// Integration Scenarios
// ============================================================================

describe('Integration Scenarios', () => {
  it('should handle real-world item data with multiple providers', async () => {
    const items = [
      createMockItem({
        id: 'item_yt_1',
        title: 'Lex Fridman Podcast #123',
        provider: 'YOUTUBE',
        rawMetadata: JSON.stringify({
          snippet: {
            channelId: 'UCSHZKyawb77ixDdsGog4iWA',
            channelTitle: 'Lex Fridman',
            title: 'Lex Fridman Podcast #123',
          },
        }),
      }),
      createMockItem({
        id: 'item_sp_1',
        title: 'JRE Episode 1000',
        provider: 'SPOTIFY',
        rawMetadata: JSON.stringify({
          show: {
            id: '4rOoJ6Egrf8K2IrywzwOMk',
            name: 'The Joe Rogan Experience',
            images: [{ url: 'https://i.scdn.co/image/jre' }],
          },
          name: 'JRE Episode 1000',
        }),
      }),
      createMockItem({
        id: 'item_x_1',
        title: '@elonmusk tweeted',
        provider: 'X',
        rawMetadata: JSON.stringify({
          author: {
            id: '44196397',
            name: 'Elon Musk',
            username: 'elonmusk',
          },
          text: 'Test tweet',
        }),
      }),
    ];

    const { db, drizzleMock } = createMockDb(items, []);
    drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

    const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
      dryRun: false,
    });

    expect(result.totalProcessed).toBe(3);
    expect(result.itemsLinked).toBe(3);
    expect(result.creatorsCreated).toBe(3);

    // Verify creators were created with correct data
    const lexCreator = db.insertCalls.find((c) => c.values.name === 'Lex Fridman');
    expect(lexCreator).toBeDefined();
    expect(lexCreator!.values.provider).toBe('YOUTUBE');

    const jreCreator = db.insertCalls.find((c) => c.values.name === 'The Joe Rogan Experience');
    expect(jreCreator).toBeDefined();
    expect(jreCreator!.values.provider).toBe('SPOTIFY');

    const elonCreator = db.insertCalls.find((c) => c.values.name === 'Elon Musk');
    expect(elonCreator).toBeDefined();
    expect(elonCreator!.values.provider).toBe('X');
    expect(elonCreator!.values.handle).toBe('elonmusk');
  });

  it('should handle mixed existing and new creators', async () => {
    // Two items with different creators - one exists, one needs to be created
    const items = [
      createMockItem({ id: 'item1', provider: 'YOUTUBE' }), // Uses UC1234567890 (existing)
      createMockItem({
        id: 'item2',
        provider: 'SPOTIFY',
        rawMetadata: SPOTIFY_RAW_METADATA, // Uses spotify_show_123 (new)
      }),
    ];

    const existingCreator = createMockCreator({
      provider: 'YOUTUBE',
      providerCreatorId: 'UC1234567890',
      name: 'Test YouTube Channel',
    });

    const { db, drizzleMock } = createMockDb(items, [existingCreator]);

    // For YouTube item: returns existingCreator (exists)
    // For Spotify item: returns null (doesn't exist, will be created)
    let callCount = 0;
    drizzleMock.query.creators.findFirst = vi.fn(() => {
      callCount++;
      // First two calls are for item1 (YouTube) - existingBefore check + findOrCreateCreator
      if (callCount <= 2) {
        return Promise.resolve(existingCreator);
      }
      // Remaining calls are for item2 (Spotify) - new creator
      return Promise.resolve(null);
    });

    const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
      dryRun: false,
    });

    // Both items should be linked
    expect(result.itemsLinked).toBe(2);
    // One creator existed (YouTube), one created (Spotify)
    expect(result.creatorsExisted).toBe(1);
    expect(result.creatorsCreated).toBe(1);
    expect(db.updateCalls.length).toBe(2); // Both items linked
    expect(db.insertCalls.length).toBe(1); // One new creator (Spotify)
  });

  it('should handle mixed valid and invalid items', async () => {
    const items = [
      createMockItem({ id: 'valid1', provider: 'YOUTUBE' }),
      createMockItem({ id: 'no_meta', provider: 'YOUTUBE', rawMetadata: null }),
      createMockItem({ id: 'valid2', provider: 'SPOTIFY', rawMetadata: SPOTIFY_RAW_METADATA }),
      createMockItem({ id: 'bad_json', provider: 'YOUTUBE', rawMetadata: 'not json' }),
      createMockItem({
        id: 'incomplete',
        provider: 'YOUTUBE',
        rawMetadata: INCOMPLETE_YOUTUBE_METADATA,
      }),
    ];

    const { drizzleMock } = createMockDb(items, []);
    drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

    const result = await backfillCreatorsFromRawMetadata(drizzleMock as never, {
      dryRun: true,
    });

    expect(result.totalProcessed).toBe(5);
    expect(result.itemsLinked).toBe(2); // valid1 and valid2
    expect(result.skipped).toBe(3); // no_meta, bad_json, incomplete
  });
});
