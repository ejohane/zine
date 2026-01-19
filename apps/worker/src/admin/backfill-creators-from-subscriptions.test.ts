/**
 * Tests for Backfill Creators from Subscriptions
 *
 * Tests the backfill logic for creating creator records from subscriptions.
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  backfillCreatorsFromSubscriptions,
  generateBackfillReport,
  type BackfillCreatorsResult,
} from './backfill-creators-from-subscriptions';

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

interface MockSubscription {
  id: string;
  userId: string;
  provider: string;
  providerChannelId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  externalUrl: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
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
  subscriptions: MockSubscription[];
  creators: MockCreator[];
  insertCalls: Array<{ table: string; values: Record<string, unknown> }>;
  updateCalls: Array<{ table: string; values: Record<string, unknown>; id: string }>;
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockSubscription(overrides: Partial<MockSubscription> = {}): MockSubscription {
  return {
    id: 'sub_test_123',
    userId: 'user_test_123',
    provider: 'YOUTUBE',
    providerChannelId: 'UC1234567890abcdefg',
    name: 'Test YouTube Channel',
    description: 'A test YouTube channel',
    imageUrl: 'https://yt3.ggpht.com/image123',
    externalUrl: 'https://youtube.com/channel/UC1234567890abcdefg',
    status: 'ACTIVE',
    createdAt: MOCK_NOW - 86400000,
    updatedAt: MOCK_NOW - 86400000,
    ...overrides,
  };
}

function createMockCreator(overrides: Partial<MockCreator> = {}): MockCreator {
  return {
    id: 'creator_test_123',
    provider: 'YOUTUBE',
    providerCreatorId: 'UC1234567890abcdefg',
    name: 'Test YouTube Channel',
    normalizedName: 'test youtube channel',
    imageUrl: 'https://yt3.ggpht.com/image123',
    description: 'A test YouTube channel',
    handle: null,
    externalUrl: 'https://youtube.com/channel/UC1234567890abcdefg',
    createdAt: MOCK_NOW - 86400000,
    updatedAt: MOCK_NOW - 86400000,
    ...overrides,
  };
}

// ============================================================================
// Mock Database Factory
// ============================================================================

function createMockDb(
  subscriptions: MockSubscription[] = [],
  creators: MockCreator[] = []
): { db: MockDb; drizzleMock: ReturnType<typeof createDrizzleMock> } {
  const db: MockDb = {
    subscriptions,
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
        $dynamic: vi.fn(() => Promise.resolve(db.subscriptions)),
      })),
    })),
    query: {
      creators: {
        findFirst: vi.fn(() => {
          // Simulate finding a creator by provider + providerCreatorId
          // For simplicity in tests, we'll match on all existing creators
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
        where: vi.fn(() => {
          db.updateCalls.push({ table: 'creators', values, id: 'unknown' });
          return Promise.resolve();
        }),
      })),
    })),
  };
}

// ============================================================================
// backfillCreatorsFromSubscriptions Tests
// ============================================================================

describe('backfillCreatorsFromSubscriptions', () => {
  describe('dry run mode', () => {
    it('should not create creators in dry run mode', async () => {
      const sub = createMockSubscription();
      const { db, drizzleMock } = createMockDb([sub], []);

      // Need to mock findFirst to return null for new creators
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      const result = await backfillCreatorsFromSubscriptions(drizzleMock as never, {
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.creatorsCreated).toBe(1);
      expect(db.insertCalls.length).toBe(0); // No actual inserts in dry run
    });

    it('should report existing creators in dry run mode', async () => {
      const sub = createMockSubscription();
      const existingCreator = createMockCreator({
        provider: sub.provider,
        providerCreatorId: sub.providerChannelId,
      });
      const { drizzleMock } = createMockDb([sub], [existingCreator]);

      // Return existing creator for findFirst
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(existingCreator));

      const result = await backfillCreatorsFromSubscriptions(drizzleMock as never, {
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.creatorsCreated).toBe(0);
      expect(result.creatorsExisted).toBe(1);
    });
  });

  describe('actual backfill mode', () => {
    it('should create new creators when they do not exist', async () => {
      const sub = createMockSubscription();
      const { db, drizzleMock } = createMockDb([sub], []);

      // Return null to indicate creator doesn't exist
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      const result = await backfillCreatorsFromSubscriptions(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.dryRun).toBe(false);
      expect(result.creatorsCreated).toBe(1);
      expect(result.creatorsExisted).toBe(0);
      expect(db.insertCalls.length).toBe(1);

      // Verify the inserted creator data
      const insertedCreator = db.insertCalls[0].values;
      expect(insertedCreator.provider).toBe(sub.provider);
      expect(insertedCreator.providerCreatorId).toBe(sub.providerChannelId);
      expect(insertedCreator.name).toBe(sub.name);
      expect(insertedCreator.normalizedName).toBe(sub.name.toLowerCase().trim());
      expect(insertedCreator.imageUrl).toBe(sub.imageUrl);
      expect(insertedCreator.description).toBe(sub.description);
      expect(insertedCreator.externalUrl).toBe(sub.externalUrl);
    });

    it('should not create duplicate creators', async () => {
      const sub = createMockSubscription();
      const existingCreator = createMockCreator({
        provider: sub.provider,
        providerCreatorId: sub.providerChannelId,
      });
      const { db, drizzleMock } = createMockDb([sub], [existingCreator]);

      // Return existing creator
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(existingCreator));

      const result = await backfillCreatorsFromSubscriptions(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.creatorsCreated).toBe(0);
      expect(result.creatorsExisted).toBe(1);
      expect(db.insertCalls.length).toBe(0); // No new inserts
    });

    it('should process multiple subscriptions', async () => {
      const subs = [
        createMockSubscription({ id: 'sub1', providerChannelId: 'UC111', name: 'Channel One' }),
        createMockSubscription({ id: 'sub2', providerChannelId: 'UC222', name: 'Channel Two' }),
        createMockSubscription({
          id: 'sub3',
          provider: 'SPOTIFY',
          providerChannelId: 'show333',
          name: 'Podcast Three',
        }),
      ];
      const { db, drizzleMock } = createMockDb(subs, []);

      // All new creators
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      const result = await backfillCreatorsFromSubscriptions(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.totalProcessed).toBe(3);
      expect(result.creatorsCreated).toBe(3);
      expect(db.insertCalls.length).toBe(3);
    });
  });

  describe('filtering', () => {
    it('should filter by userId', async () => {
      const subs = [
        createMockSubscription({ id: 'sub1', userId: 'user1' }),
        createMockSubscription({ id: 'sub2', userId: 'user2' }),
      ];
      const { drizzleMock } = createMockDb(subs, []);
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      const result = await backfillCreatorsFromSubscriptions(drizzleMock as never, {
        dryRun: true,
        userId: 'user1',
      });

      expect(result.totalProcessed).toBe(1);
    });

    it('should filter by provider', async () => {
      const subs = [
        createMockSubscription({ id: 'sub1', provider: 'YOUTUBE' }),
        createMockSubscription({ id: 'sub2', provider: 'SPOTIFY' }),
        createMockSubscription({ id: 'sub3', provider: 'YOUTUBE' }),
      ];
      const { drizzleMock } = createMockDb(subs, []);
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      const result = await backfillCreatorsFromSubscriptions(drizzleMock as never, {
        dryRun: true,
        provider: 'YOUTUBE',
      });

      expect(result.totalProcessed).toBe(2);
    });

    it('should limit number of subscriptions', async () => {
      const subs = Array.from({ length: 10 }, (_, i) =>
        createMockSubscription({ id: `sub${i}`, providerChannelId: `UC${i}` })
      );
      const { drizzleMock } = createMockDb(subs, []);
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      const result = await backfillCreatorsFromSubscriptions(drizzleMock as never, {
        dryRun: true,
        limit: 5,
      });

      expect(result.totalProcessed).toBe(5);
    });
  });

  describe('by provider statistics', () => {
    it('should track statistics per provider', async () => {
      const subs = [
        createMockSubscription({ id: 'sub1', provider: 'YOUTUBE', providerChannelId: 'UC111' }),
        createMockSubscription({ id: 'sub2', provider: 'YOUTUBE', providerChannelId: 'UC222' }),
        createMockSubscription({
          id: 'sub3',
          provider: 'SPOTIFY',
          providerChannelId: 'show333',
        }),
      ];
      const { drizzleMock } = createMockDb(subs, []);
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      const result = await backfillCreatorsFromSubscriptions(drizzleMock as never, {
        dryRun: true,
      });

      expect(result.byProvider).toEqual({
        YOUTUBE: { processed: 2, created: 2, existed: 0, errors: 0 },
        SPOTIFY: { processed: 1, created: 1, existed: 0, errors: 0 },
      });
    });
  });

  describe('error handling', () => {
    it('should handle errors gracefully and continue processing', async () => {
      const subs = [
        createMockSubscription({ id: 'sub1', providerChannelId: 'UC111' }),
        createMockSubscription({ id: 'sub2', providerChannelId: 'UC222' }),
      ];
      const { drizzleMock } = createMockDb(subs, []);

      // Track which subscription we're processing to fail only sub1
      let callCount = 0;
      drizzleMock.query.creators.findFirst = vi.fn(() => {
        callCount++;
        // First call is for sub1's existingBefore check - make it fail
        if (callCount === 1) {
          return Promise.reject(new Error('Database error'));
        }
        // All other calls succeed (for sub2)
        return Promise.resolve(null);
      });

      const result = await backfillCreatorsFromSubscriptions(drizzleMock as never, {
        dryRun: false,
      });

      expect(result.errorCount).toBe(1);
      expect(result.creatorsCreated).toBe(1);
      expect(result.results.find((r) => r.subscriptionId === 'sub1')?.error).toBeDefined();
      expect(result.results.find((r) => r.subscriptionId === 'sub2')?.error).toBeUndefined();
    });
  });

  describe('field mapping', () => {
    it('should correctly map subscription fields to creator fields', async () => {
      const sub = createMockSubscription({
        providerChannelId: 'UC_special_123',
        name: 'Test Channel Name',
        description: 'Test description',
        imageUrl: 'https://example.com/image.jpg',
        externalUrl: 'https://youtube.com/channel/UC_special_123',
      });
      const { db, drizzleMock } = createMockDb([sub], []);
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      await backfillCreatorsFromSubscriptions(drizzleMock as never, {
        dryRun: false,
      });

      expect(db.insertCalls.length).toBe(1);
      const creator = db.insertCalls[0].values;

      // Verify field mapping
      expect(creator.providerCreatorId).toBe(sub.providerChannelId);
      expect(creator.name).toBe(sub.name);
      expect(creator.normalizedName).toBe('test channel name');
      expect(creator.imageUrl).toBe(sub.imageUrl);
      expect(creator.description).toBe(sub.description);
      expect(creator.externalUrl).toBe(sub.externalUrl);
      expect(creator.handle).toBeNull(); // Not available from subscriptions
    });

    it('should handle null optional fields', async () => {
      const sub = createMockSubscription({
        description: null,
        imageUrl: null,
        externalUrl: null,
      });
      const { db, drizzleMock } = createMockDb([sub], []);
      drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

      await backfillCreatorsFromSubscriptions(drizzleMock as never, {
        dryRun: false,
      });

      const creator = db.insertCalls[0].values;
      expect(creator.imageUrl).toBeNull();
      expect(creator.description).toBeNull();
      expect(creator.externalUrl).toBeNull();
    });
  });

  describe('defaults', () => {
    it('should default to dry run mode', async () => {
      const { drizzleMock } = createMockDb([], []);

      const result = await backfillCreatorsFromSubscriptions(drizzleMock as never);

      expect(result.dryRun).toBe(true);
    });
  });
});

// ============================================================================
// generateBackfillReport Tests
// ============================================================================

describe('generateBackfillReport', () => {
  it('should generate report with created creators', () => {
    const result: BackfillCreatorsResult = {
      dryRun: false,
      totalProcessed: 5,
      creatorsCreated: 3,
      creatorsExisted: 2,
      errorCount: 0,
      results: [],
      byProvider: {
        YOUTUBE: { processed: 3, created: 2, existed: 1, errors: 0 },
        SPOTIFY: { processed: 2, created: 1, existed: 1, errors: 0 },
      },
    };

    const report = generateBackfillReport(result);

    expect(report).toContain('CREATOR BACKFILL FROM SUBSCRIPTIONS REPORT');
    expect(report).toContain('Mode: EXECUTED');
    expect(report).toContain('Total subscriptions processed: 5');
    expect(report).toContain('Creators created: 3');
    expect(report).toContain('Creators already existed: 2');
    expect(report).toContain('YOUTUBE:');
    expect(report).toContain('SPOTIFY:');
  });

  it('should generate dry run report', () => {
    const result: BackfillCreatorsResult = {
      dryRun: true,
      totalProcessed: 3,
      creatorsCreated: 2,
      creatorsExisted: 1,
      errorCount: 0,
      results: [],
      byProvider: {
        YOUTUBE: { processed: 3, created: 2, existed: 1, errors: 0 },
      },
    };

    const report = generateBackfillReport(result);

    expect(report).toContain('Mode: DRY RUN');
  });

  it('should include errors in report', () => {
    const result: BackfillCreatorsResult = {
      dryRun: false,
      totalProcessed: 2,
      creatorsCreated: 1,
      creatorsExisted: 0,
      errorCount: 1,
      results: [
        {
          subscriptionId: 'sub1',
          subscriptionName: 'Failed Channel',
          provider: 'YOUTUBE',
          providerChannelId: 'UC123',
          created: false,
          creatorId: '',
          error: 'Database connection error',
        },
      ],
      byProvider: {
        YOUTUBE: { processed: 2, created: 1, existed: 0, errors: 1 },
      },
    };

    const report = generateBackfillReport(result);

    expect(report).toContain('Errors: 1');
    expect(report).toContain('--- Errors ---');
    expect(report).toContain('Failed Channel');
    expect(report).toContain('Database connection error');
  });
});

// ============================================================================
// Integration Scenarios
// ============================================================================

describe('Integration Scenarios', () => {
  it('should handle real-world subscription data', async () => {
    // Simulate real subscriptions from YouTube and Spotify
    const subs = [
      createMockSubscription({
        id: 'sub_yt_1',
        provider: 'YOUTUBE',
        providerChannelId: 'UCxxxxxx',
        name: 'Lex Fridman',
        description: 'Conversations about science, technology, and AI',
        imageUrl: 'https://yt3.ggpht.com/lex',
        externalUrl: 'https://youtube.com/c/lexfridman',
      }),
      createMockSubscription({
        id: 'sub_sp_1',
        provider: 'SPOTIFY',
        providerChannelId: '4rOoJ6Egrf8K2IrywzwOMk',
        name: 'The Joe Rogan Experience',
        description: 'The official podcast of comedian Joe Rogan',
        imageUrl: 'https://i.scdn.co/image/jre',
        externalUrl: 'https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk',
      }),
      createMockSubscription({
        id: 'sub_yt_2',
        provider: 'YOUTUBE',
        providerChannelId: 'UCyyyyyy',
        name: 'Veritasium',
        description: 'Science videos about physics and more',
        imageUrl: 'https://yt3.ggpht.com/veritasium',
        externalUrl: 'https://youtube.com/c/veritasium',
      }),
    ];

    const { db, drizzleMock } = createMockDb(subs, []);
    drizzleMock.query.creators.findFirst = vi.fn(() => Promise.resolve(null));

    const result = await backfillCreatorsFromSubscriptions(drizzleMock as never, {
      dryRun: false,
    });

    expect(result.totalProcessed).toBe(3);
    expect(result.creatorsCreated).toBe(3);
    expect(result.byProvider.YOUTUBE.created).toBe(2);
    expect(result.byProvider.SPOTIFY.created).toBe(1);

    // Verify creators were created correctly
    expect(db.insertCalls.length).toBe(3);

    const lexCreator = db.insertCalls.find((c) => c.values.name === 'Lex Fridman');
    expect(lexCreator).toBeDefined();
    expect(lexCreator!.values.provider).toBe('YOUTUBE');
    expect(lexCreator!.values.normalizedName).toBe('lex fridman');
  });

  it('should handle mixed existing and new creators', async () => {
    const subs = [
      createMockSubscription({
        id: 'sub1',
        providerChannelId: 'UC_existing',
        name: 'Existing Channel',
      }),
      createMockSubscription({ id: 'sub2', providerChannelId: 'UC_new', name: 'New Channel' }),
    ];

    const existingCreator = createMockCreator({
      provider: 'YOUTUBE',
      providerCreatorId: 'UC_existing',
      name: 'Existing Channel',
    });

    const { db, drizzleMock } = createMockDb(subs, [existingCreator]);

    // Return existing for first subscription, null for second
    let callCount = 0;
    drizzleMock.query.creators.findFirst = vi.fn(() => {
      callCount++;
      // First two calls are for sub1 (checking existing)
      if (callCount <= 2) {
        return Promise.resolve(existingCreator);
      }
      // Next calls are for sub2 (new creator)
      return Promise.resolve(null);
    });

    const result = await backfillCreatorsFromSubscriptions(drizzleMock as never, {
      dryRun: false,
    });

    expect(result.creatorsCreated).toBe(1);
    expect(result.creatorsExisted).toBe(1);
    expect(db.insertCalls.length).toBe(1);
    expect(db.insertCalls[0].values.providerCreatorId).toBe('UC_new');
  });
});
