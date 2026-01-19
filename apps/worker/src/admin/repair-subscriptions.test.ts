/**
 * Tests for Subscription Data Repair Module
 *
 * Tests the repair logic for corrupted subscription lastPublishedAt watermarks.
 *
 * @vitest-environment miniflare
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  findCorruptedSubscriptions,
  generateRepairReport,
  repairCorruptedSubscriptions,
  verifyRepairs,
  type FindCorruptedResult,
} from './repair-subscriptions';

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
// Mock Database
// ============================================================================

interface MockSubscriptionRow {
  id: string;
  userId: string;
  name: string;
  provider: string;
  lastPublishedAt: number | null;
  newestItemAt: number | null;
}

interface MockDb {
  subscriptionData: MockSubscriptionRow[];
  updateCalls: Array<{ id: string; values: Record<string, unknown> }>;
}

function createMockDb(subscriptionData: MockSubscriptionRow[]): MockDb {
  return {
    subscriptionData,
    updateCalls: [],
  };
}

// Create a mock database implementation
function createDrizzleMock(mockDb: MockDb) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          // Return the subscription data with computed newestItemAt
          return Promise.resolve(mockDb.subscriptionData);
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn((condition: { value: string }) => {
          mockDb.updateCalls.push({ id: condition.value, values });
          return Promise.resolve();
        }),
      })),
    })),
  };
}

// ============================================================================
// Test Fixtures
// ============================================================================

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Create a healthy subscription (no corruption)
 */
function createHealthySubscription(
  overrides: Partial<MockSubscriptionRow> = {}
): MockSubscriptionRow {
  const newestItemAt = MOCK_NOW - ONE_DAY_MS; // 1 day ago
  return {
    id: 'sub_healthy_123',
    userId: 'user_test_123',
    name: 'Healthy Podcast',
    provider: 'SPOTIFY',
    lastPublishedAt: newestItemAt, // Matches newest item
    newestItemAt,
    ...overrides,
  };
}

/**
 * Create a corrupted subscription (watermark ahead of newest item)
 */
function createCorruptedSubscription(
  overrides: Partial<MockSubscriptionRow> = {}
): MockSubscriptionRow {
  return {
    id: 'sub_corrupted_456',
    userId: 'user_test_123',
    name: 'Corrupted Podcast',
    provider: 'SPOTIFY',
    lastPublishedAt: MOCK_NOW, // Today
    newestItemAt: MOCK_NOW - 18 * ONE_DAY_MS, // 18 days ago - large gap!
    ...overrides,
  };
}

/**
 * Create a subscription with watermark but no items (severely corrupted)
 */
function createNoItemsSubscription(
  overrides: Partial<MockSubscriptionRow> = {}
): MockSubscriptionRow {
  return {
    id: 'sub_noitems_789',
    userId: 'user_test_123',
    name: 'Empty Podcast',
    provider: 'SPOTIFY',
    lastPublishedAt: MOCK_NOW - 5 * ONE_DAY_MS, // Has watermark
    newestItemAt: null, // But no items!
    ...overrides,
  };
}

/**
 * Create a subscription with no watermark (never polled, healthy)
 */
function createNoWatermarkSubscription(
  overrides: Partial<MockSubscriptionRow> = {}
): MockSubscriptionRow {
  return {
    id: 'sub_nopoll_000',
    userId: 'user_test_123',
    name: 'New Podcast',
    provider: 'SPOTIFY',
    lastPublishedAt: null, // Never polled
    newestItemAt: null,
    ...overrides,
  };
}

// ============================================================================
// findCorruptedSubscriptions Tests
// ============================================================================

describe('findCorruptedSubscriptions', () => {
  describe('detection logic', () => {
    it('should identify subscription with watermark ahead of newest item', async () => {
      // Create a mock result that simulates what the DB would return
      const corrupted = createCorruptedSubscription();
      const mockDb = createMockDb([corrupted]);
      const drizzleMock = createDrizzleMock(mockDb);

      // We need to mock the actual drizzle query
      // For this test, we'll call the function with a simulated DB
      const result = await findCorruptedSubscriptions(drizzleMock as never, {
        provider: 'SPOTIFY',
      });

      expect(result.corrupted.length).toBe(1);
      expect(result.corrupted[0].id).toBe('sub_corrupted_456');
      expect(result.corrupted[0].gapDays).toBeGreaterThan(1);
    });

    it('should identify subscription with watermark but no items', async () => {
      const noItems = createNoItemsSubscription();
      const mockDb = createMockDb([noItems]);
      const drizzleMock = createDrizzleMock(mockDb);

      const result = await findCorruptedSubscriptions(drizzleMock as never, {
        provider: 'SPOTIFY',
      });

      expect(result.corrupted.length).toBe(1);
      expect(result.corrupted[0].id).toBe('sub_noitems_789');
      expect(result.corrupted[0].newestItemAt).toBeNull();
    });

    it('should NOT flag healthy subscription with matching watermark', async () => {
      const healthy = createHealthySubscription();
      const mockDb = createMockDb([healthy]);
      const drizzleMock = createDrizzleMock(mockDb);

      const result = await findCorruptedSubscriptions(drizzleMock as never, {
        provider: 'SPOTIFY',
      });

      expect(result.corrupted.length).toBe(0);
      expect(result.healthy).toBe(1);
    });

    it('should NOT flag subscription without watermark', async () => {
      const noWatermark = createNoWatermarkSubscription();
      const mockDb = createMockDb([noWatermark]);
      const drizzleMock = createDrizzleMock(mockDb);

      const result = await findCorruptedSubscriptions(drizzleMock as never, {
        provider: 'SPOTIFY',
      });

      expect(result.corrupted.length).toBe(0);
      expect(result.noWatermark).toBe(1);
    });

    it('should handle mixed subscription states', async () => {
      const subscriptions = [
        createHealthySubscription({ id: 'healthy1' }),
        createCorruptedSubscription({ id: 'corrupted1' }),
        createNoItemsSubscription({ id: 'noitems1' }),
        createNoWatermarkSubscription({ id: 'nowatermark1' }),
        createHealthySubscription({ id: 'healthy2' }),
        createCorruptedSubscription({ id: 'corrupted2' }),
      ];

      const mockDb = createMockDb(subscriptions);
      const drizzleMock = createDrizzleMock(mockDb);

      const result = await findCorruptedSubscriptions(drizzleMock as never, {
        provider: 'SPOTIFY',
      });

      expect(result.totalScanned).toBe(6);
      expect(result.corrupted.length).toBe(3); // corrupted1, noitems1, corrupted2
      expect(result.healthy).toBe(2); // healthy1, healthy2
      expect(result.noWatermark).toBe(1); // nowatermark1
    });
  });

  describe('threshold handling', () => {
    it('should NOT flag subscription with gap less than 1 day', async () => {
      const slightlyAhead = createHealthySubscription({
        id: 'slight_gap',
        lastPublishedAt: MOCK_NOW - 12 * 60 * 60 * 1000, // 12 hours ago
        newestItemAt: MOCK_NOW - 36 * 60 * 60 * 1000, // 36 hours ago (24h gap, under threshold)
      });

      // 36h - 12h = 24h ago for newest item, watermark is 12h ago
      // Gap is 24 hours, but newestItemAt (36h ago) minus lastPublishedAt (12h ago) gives NEGATIVE
      // Actually: lastPublishedAt - newestItemAt = -12h - (-36h) = 24h
      // Let's recalculate: lastPublishedAt is 12h ago, newestItemAt is 36h ago
      // Gap = lastPublishedAt - newestItemAt = (MOCK_NOW - 12h) - (MOCK_NOW - 36h) = 24h

      // This should be right at the threshold (24h = CORRUPTION_THRESHOLD_MS)
      // The check is: gapMs > CORRUPTION_THRESHOLD_MS (strict greater than)
      // So 24h gap should NOT be flagged

      const mockDb = createMockDb([slightlyAhead]);
      const drizzleMock = createDrizzleMock(mockDb);

      const result = await findCorruptedSubscriptions(drizzleMock as never, {
        provider: 'SPOTIFY',
      });

      expect(result.corrupted.length).toBe(0);
      expect(result.healthy).toBe(1);
    });

    it('should flag subscription with gap slightly over 1 day', async () => {
      const justOver = createHealthySubscription({
        id: 'just_over',
        lastPublishedAt: MOCK_NOW,
        newestItemAt: MOCK_NOW - 25 * 60 * 60 * 1000, // 25 hours ago
      });

      const mockDb = createMockDb([justOver]);
      const drizzleMock = createDrizzleMock(mockDb);

      const result = await findCorruptedSubscriptions(drizzleMock as never, {
        provider: 'SPOTIFY',
      });

      expect(result.corrupted.length).toBe(1);
    });
  });

  describe('filtering', () => {
    it('should filter by userId when provided', async () => {
      const sub1 = createCorruptedSubscription({ id: 'user1_sub', userId: 'user1' });
      createCorruptedSubscription({ id: 'user2_sub', userId: 'user2' });

      // Mock that filters by userId
      const drizzleMock = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => {
              // Simulate filtering by user
              return Promise.resolve([sub1]);
            }),
          })),
        })),
        update: vi.fn(),
      };

      const result = await findCorruptedSubscriptions(drizzleMock as never, {
        provider: 'SPOTIFY',
        userId: 'user1',
      });

      expect(result.corrupted.length).toBe(1);
      expect(result.corrupted[0].userId).toBe('user1');
    });
  });
});

// ============================================================================
// generateRepairReport Tests
// ============================================================================

describe('generateRepairReport', () => {
  it('should generate report with corrupted subscriptions', () => {
    const result: FindCorruptedResult = {
      corrupted: [
        {
          id: 'sub_1',
          userId: 'user_1',
          providerChannelId: 'show_dithering',
          provider: 'SPOTIFY',
          lastPublishedAt: new Date('2024-01-15T00:00:00Z').getTime(),
          newestItemAt: new Date('2024-01-01T00:00:00Z').getTime(),
          gapMs: 14 * ONE_DAY_MS,
          gapDays: 14,
        },
        {
          id: 'sub_2',
          userId: 'user_1',
          providerChannelId: 'show_red_flags',
          provider: 'SPOTIFY',
          lastPublishedAt: new Date('2024-01-10T00:00:00Z').getTime(),
          newestItemAt: null,
          gapMs: null,
          gapDays: null,
        },
      ],
      totalScanned: 10,
      noWatermark: 3,
      healthy: 5,
    };

    const report = generateRepairReport(result);

    expect(report).toContain('CORRUPTED SUBSCRIPTIONS REPORT');
    expect(report).toContain('Total scanned: 10');
    expect(report).toContain('Corrupted: 2');
    expect(report).toContain('Dithering');
    expect(report).toContain('14 days');
    expect(report).toContain('Red Flags');
    expect(report).toContain('NULL (no items)');
  });

  it('should generate report with no corrupted subscriptions', () => {
    const result: FindCorruptedResult = {
      corrupted: [],
      totalScanned: 5,
      noWatermark: 2,
      healthy: 3,
    };

    const report = generateRepairReport(result);

    expect(report).toContain('No corrupted subscriptions found');
  });
});

// ============================================================================
// repairCorruptedSubscriptions Tests
// ============================================================================

describe('repairCorruptedSubscriptions', () => {
  describe('dry run mode', () => {
    it('should not modify database in dry run mode', async () => {
      const corrupted = createCorruptedSubscription();
      const mockDb = createMockDb([corrupted]);
      const drizzleMock = createDrizzleMock(mockDb);

      const result = await repairCorruptedSubscriptions(drizzleMock as never, {
        dryRun: true,
        provider: 'SPOTIFY',
      });

      expect(result.dryRun).toBe(true);
      expect(result.repairCount).toBe(1);
      expect(result.repairs[0].executed).toBe(false);
      expect(mockDb.updateCalls.length).toBe(0); // No actual updates
    });

    it('should report what would be repaired', async () => {
      const corrupted1 = createCorruptedSubscription({ id: 'sub1' });
      const corrupted2 = createNoItemsSubscription({ id: 'sub2' });
      const mockDb = createMockDb([corrupted1, corrupted2]);
      const drizzleMock = createDrizzleMock(mockDb);

      const result = await repairCorruptedSubscriptions(drizzleMock as never, {
        dryRun: true,
        provider: 'SPOTIFY',
      });

      expect(result.repairCount).toBe(2);
      expect(result.repairs).toHaveLength(2);

      const repair1 = result.repairs.find((r) => r.subscriptionId === 'sub1');
      expect(repair1?.oldWatermark).toBe(corrupted1.lastPublishedAt);
      expect(repair1?.newWatermark).toBe(corrupted1.newestItemAt);

      const repair2 = result.repairs.find((r) => r.subscriptionId === 'sub2');
      expect(repair2?.oldWatermark).toBe(corrupted2.lastPublishedAt);
      expect(repair2?.newWatermark).toBeNull(); // No items, should reset to NULL
    });
  });

  describe('actual repair mode', () => {
    it('should update database when dryRun is false', async () => {
      const corrupted = createCorruptedSubscription();

      // Create a custom mock that tracks update calls
      const updateCalls: Array<{ id: string; values: Record<string, unknown> }> = [];
      const drizzleMock = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve([corrupted])),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn((values: Record<string, unknown>) => ({
            where: vi.fn((condition: { value: string }) => {
              updateCalls.push({ id: condition.value, values });
              return Promise.resolve();
            }),
          })),
        })),
      };

      const result = await repairCorruptedSubscriptions(drizzleMock as never, {
        dryRun: false,
        provider: 'SPOTIFY',
      });

      expect(result.dryRun).toBe(false);
      expect(result.repairCount).toBe(1);
      expect(result.repairs[0].executed).toBe(true);
      expect(updateCalls.length).toBe(1);
      expect(updateCalls[0].values.lastPublishedAt).toBe(corrupted.newestItemAt);
    });

    it('should reset watermark to NULL for subscriptions with no items', async () => {
      const noItems = createNoItemsSubscription();

      const updateCalls: Array<{ id: string; values: Record<string, unknown> }> = [];
      const drizzleMock = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve([noItems])),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn((values: Record<string, unknown>) => ({
            where: vi.fn((condition: { value: string }) => {
              updateCalls.push({ id: condition.value, values });
              return Promise.resolve();
            }),
          })),
        })),
      };

      const result = await repairCorruptedSubscriptions(drizzleMock as never, {
        dryRun: false,
        provider: 'SPOTIFY',
      });

      expect(result.repairs[0].newWatermark).toBeNull();
      expect(updateCalls[0].values.lastPublishedAt).toBeNull();
    });
  });

  describe('filtering by subscription IDs', () => {
    it('should only repair specified subscription IDs', async () => {
      const sub1 = createCorruptedSubscription({ id: 'repair_me' });
      const sub2 = createCorruptedSubscription({ id: 'skip_me' });
      const mockDb = createMockDb([sub1, sub2]);
      const drizzleMock = createDrizzleMock(mockDb);

      const result = await repairCorruptedSubscriptions(drizzleMock as never, {
        dryRun: true,
        provider: 'SPOTIFY',
        subscriptionIds: ['repair_me'],
      });

      expect(result.repairCount).toBe(1);
      expect(result.repairs[0].subscriptionId).toBe('repair_me');
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      const corrupted = createCorruptedSubscription();

      const drizzleMock = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve([corrupted])),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => Promise.reject(new Error('Database error'))),
          })),
        })),
      };

      const result = await repairCorruptedSubscriptions(drizzleMock as never, {
        dryRun: false,
        provider: 'SPOTIFY',
      });

      expect(result.errors.length).toBe(1);
      expect(result.errors[0].error).toContain('Database error');
    });
  });

  describe('defaults', () => {
    it('should default to dry run mode', async () => {
      const mockDb = createMockDb([]);
      const drizzleMock = createDrizzleMock(mockDb);

      const result = await repairCorruptedSubscriptions(drizzleMock as never);

      expect(result.dryRun).toBe(true);
    });

    it('should default to SPOTIFY provider', async () => {
      const spotifySub = createCorruptedSubscription({ provider: 'SPOTIFY' });
      // YouTube subscription would be filtered out by default SPOTIFY filter
      createCorruptedSubscription({ provider: 'YOUTUBE' });

      const drizzleMock = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => {
              // Only return SPOTIFY (simulating default filter)
              return Promise.resolve([spotifySub]);
            }),
          })),
        })),
        update: vi.fn(),
      };

      const result = await repairCorruptedSubscriptions(drizzleMock as never);

      expect(result.repairs.every((r) => r.subscriptionId === spotifySub.id)).toBe(true);
    });
  });
});

// ============================================================================
// verifyRepairs Tests
// ============================================================================

describe('verifyRepairs', () => {
  it('should return success when no corrupted subscriptions remain', async () => {
    const healthy = createHealthySubscription();
    const mockDb = createMockDb([healthy]);
    const drizzleMock = createDrizzleMock(mockDb);

    const result = await verifyRepairs(drizzleMock as never, {
      provider: 'SPOTIFY',
    });

    expect(result.success).toBe(true);
    expect(result.remainingCorrupted).toBe(0);
  });

  it('should return failure when corrupted subscriptions still exist', async () => {
    const stillCorrupted = createCorruptedSubscription();
    const mockDb = createMockDb([stillCorrupted]);
    const drizzleMock = createDrizzleMock(mockDb);

    const result = await verifyRepairs(drizzleMock as never, {
      provider: 'SPOTIFY',
    });

    expect(result.success).toBe(false);
    expect(result.remainingCorrupted).toBe(1);
    expect(result.details.length).toBe(1);
  });
});

// ============================================================================
// Integration Scenarios
// ============================================================================

describe('Integration Scenarios', () => {
  it('should handle full repair workflow: find → repair → verify', async () => {
    // Initial state: corrupted subscriptions
    let subscriptions = [
      createCorruptedSubscription({ id: 'sub1' }),
      createNoItemsSubscription({ id: 'sub2' }),
    ];

    const drizzleMock = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(subscriptions)),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => ({
          where: vi.fn((condition: { value: string }) => {
            // Simulate the repair by updating the subscription
            const sub = subscriptions.find((s) => s.id === condition.value);
            if (sub) {
              sub.lastPublishedAt = values.lastPublishedAt as number | null;
            }
            return Promise.resolve();
          }),
        })),
      })),
    };

    // Step 1: Find corrupted
    const findResult = await findCorruptedSubscriptions(drizzleMock as never, {
      provider: 'SPOTIFY',
    });
    expect(findResult.corrupted.length).toBe(2);

    // Step 2: Dry run
    const dryRunResult = await repairCorruptedSubscriptions(drizzleMock as never, {
      dryRun: true,
      provider: 'SPOTIFY',
    });
    expect(dryRunResult.repairCount).toBe(2);

    // Step 3: Actual repair
    const repairResult = await repairCorruptedSubscriptions(drizzleMock as never, {
      dryRun: false,
      provider: 'SPOTIFY',
    });
    expect(repairResult.repairCount).toBe(2);
    expect(repairResult.errors.length).toBe(0);

    // Simulate post-repair state
    subscriptions = [
      // After repair, sub1's watermark matches its newest item
      {
        ...createHealthySubscription({ id: 'sub1' }),
        lastPublishedAt: subscriptions[0].newestItemAt,
        newestItemAt: subscriptions[0].newestItemAt,
      },
      // After repair, sub2's watermark is NULL (no items)
      {
        ...createNoWatermarkSubscription({ id: 'sub2' }),
      },
    ];

    // Step 4: Verify
    const verifyResult = await verifyRepairs(drizzleMock as never, {
      provider: 'SPOTIFY',
    });
    expect(verifyResult.success).toBe(true);
    expect(verifyResult.remainingCorrupted).toBe(0);
  });

  it('should match production scenario from issue description', async () => {
    // Scenario from zine-8e8:
    // | Show | lastPublishedAt | Newest Item | Gap |
    // |------|-----------------|-------------|-----|
    // | Dithering | Jan 6 | Dec 19 | 18 days |
    // | Red Flags | Jan 5 | NULL | Infinite! |

    const jan6 = new Date('2024-01-06T00:00:00Z').getTime();
    const jan5 = new Date('2024-01-05T00:00:00Z').getTime();
    const dec19 = new Date('2023-12-19T00:00:00Z').getTime();

    const subscriptions = [
      {
        id: 'dithering_sub',
        userId: 'user_erik',
        providerChannelId: 'dithering_show_id',
        provider: 'SPOTIFY',
        lastPublishedAt: jan6,
        newestItemAt: dec19,
      },
      {
        id: 'redflags_sub',
        userId: 'user_erik',
        providerChannelId: 'redflags_show_id',
        provider: 'SPOTIFY',
        lastPublishedAt: jan5,
        newestItemAt: null,
      },
    ];

    const drizzleMock = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve(subscriptions)),
        })),
      })),
      update: vi.fn(),
    };

    const result = await findCorruptedSubscriptions(drizzleMock as never, {
      provider: 'SPOTIFY',
    });

    // Both should be detected as corrupted
    expect(result.corrupted.length).toBe(2);

    // Dithering: 18 day gap
    const dithering = result.corrupted.find((s) => s.providerChannelId === 'dithering_show_id');
    expect(dithering).toBeDefined();
    expect(dithering!.gapDays).toBe(18);

    // Red Flags: no items
    const redFlags = result.corrupted.find((s) => s.providerChannelId === 'redflags_show_id');
    expect(redFlags).toBeDefined();
    expect(redFlags!.newestItemAt).toBeNull();

    // Verify repair strategy
    const repairResult = await repairCorruptedSubscriptions(drizzleMock as never, {
      dryRun: true,
      provider: 'SPOTIFY',
    });

    const ditheringRepair = repairResult.repairs.find((r) => r.subscriptionId === 'dithering_sub');
    expect(ditheringRepair!.newWatermark).toBe(dec19); // Reset to Dec 19

    const redFlagsRepair = repairResult.repairs.find((r) => r.subscriptionId === 'redflags_sub');
    expect(redFlagsRepair!.newWatermark).toBeNull(); // Reset to NULL for full repoll
  });
});
