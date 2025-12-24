/**
 * Tests for adaptive polling interval adjustment
 *
 * Tests calculateOptimalInterval for all 4 tiers:
 * - Very active (7+ items/week) → 3600s (1 hour)
 * - Active (1-6 items/week) → 14400s (4 hours)
 * - Moderate (1+ items/month) → 43200s (12 hours)
 * - Inactive (no items 30+ days) → 86400s (24 hours)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateOptimalInterval,
  shouldAdjustInterval,
  INTERVAL_VERY_ACTIVE,
  INTERVAL_ACTIVE,
  INTERVAL_MODERATE,
  INTERVAL_INACTIVE,
  MIN_CHANGE_THRESHOLD,
  ADJUSTMENT_POLL_FREQUENCY,
  type ActivityMetrics,
  type Subscription,
} from './adaptive';

// ============================================================================
// Constants Tests
// ============================================================================

describe('Polling interval constants', () => {
  it('should have correct values for each tier', () => {
    expect(INTERVAL_VERY_ACTIVE).toBe(3600); // 1 hour
    expect(INTERVAL_ACTIVE).toBe(14400); // 4 hours
    expect(INTERVAL_MODERATE).toBe(43200); // 12 hours
    expect(INTERVAL_INACTIVE).toBe(86400); // 24 hours
  });

  it('should have minimum change threshold of 50%', () => {
    expect(MIN_CHANGE_THRESHOLD).toBe(0.5);
  });

  it('should adjust every 24 polls', () => {
    expect(ADJUSTMENT_POLL_FREQUENCY).toBe(24);
  });
});

// ============================================================================
// calculateOptimalInterval Tests
// ============================================================================

describe('calculateOptimalInterval', () => {
  describe('Very active tier (7+ items/week)', () => {
    it('should return 1 hour for exactly 7 items in 7 days', () => {
      const metrics: ActivityMetrics = {
        itemsLast7Days: 7,
        itemsLast30Days: 15,
        daysSinceLastItem: 0,
      };

      expect(calculateOptimalInterval(metrics)).toBe(INTERVAL_VERY_ACTIVE);
      expect(calculateOptimalInterval(metrics)).toBe(3600);
    });

    it('should return 1 hour for more than 7 items in 7 days', () => {
      const metrics: ActivityMetrics = {
        itemsLast7Days: 14,
        itemsLast30Days: 50,
        daysSinceLastItem: 0,
      };

      expect(calculateOptimalInterval(metrics)).toBe(INTERVAL_VERY_ACTIVE);
    });

    it('should return 1 hour for daily uploaders (7 items)', () => {
      const metrics: ActivityMetrics = {
        itemsLast7Days: 7,
        itemsLast30Days: 28,
        daysSinceLastItem: 0,
      };

      expect(calculateOptimalInterval(metrics)).toBe(3600);
    });

    it('should return 1 hour for multiple-uploads-per-day channels', () => {
      const metrics: ActivityMetrics = {
        itemsLast7Days: 21, // 3 per day
        itemsLast30Days: 90,
        daysSinceLastItem: 0,
      };

      expect(calculateOptimalInterval(metrics)).toBe(3600);
    });
  });

  describe('Active tier (1-6 items/week)', () => {
    it('should return 4 hours for exactly 1 item in 7 days', () => {
      const metrics: ActivityMetrics = {
        itemsLast7Days: 1,
        itemsLast30Days: 4,
        daysSinceLastItem: 2,
      };

      expect(calculateOptimalInterval(metrics)).toBe(INTERVAL_ACTIVE);
      expect(calculateOptimalInterval(metrics)).toBe(14400);
    });

    it('should return 4 hours for 6 items in 7 days', () => {
      const metrics: ActivityMetrics = {
        itemsLast7Days: 6,
        itemsLast30Days: 20,
        daysSinceLastItem: 1,
      };

      expect(calculateOptimalInterval(metrics)).toBe(INTERVAL_ACTIVE);
    });

    it('should return 4 hours for weekly uploaders', () => {
      const metrics: ActivityMetrics = {
        itemsLast7Days: 1,
        itemsLast30Days: 4,
        daysSinceLastItem: 3,
      };

      expect(calculateOptimalInterval(metrics)).toBe(14400);
    });

    it('should return 4 hours for bi-weekly uploaders', () => {
      const metrics: ActivityMetrics = {
        itemsLast7Days: 2,
        itemsLast30Days: 8,
        daysSinceLastItem: 2,
      };

      expect(calculateOptimalInterval(metrics)).toBe(14400);
    });
  });

  describe('Moderate tier (1+ items/month, 0 items/week)', () => {
    it('should return 12 hours for exactly 1 item in 30 days', () => {
      const metrics: ActivityMetrics = {
        itemsLast7Days: 0,
        itemsLast30Days: 1,
        daysSinceLastItem: 15,
      };

      expect(calculateOptimalInterval(metrics)).toBe(INTERVAL_MODERATE);
      expect(calculateOptimalInterval(metrics)).toBe(43200);
    });

    it('should return 12 hours for multiple items in 30 days but none in 7', () => {
      const metrics: ActivityMetrics = {
        itemsLast7Days: 0,
        itemsLast30Days: 4,
        daysSinceLastItem: 10,
      };

      expect(calculateOptimalInterval(metrics)).toBe(INTERVAL_MODERATE);
    });

    it('should return 12 hours for monthly podcasters', () => {
      const metrics: ActivityMetrics = {
        itemsLast7Days: 0,
        itemsLast30Days: 2,
        daysSinceLastItem: 12,
      };

      expect(calculateOptimalInterval(metrics)).toBe(43200);
    });
  });

  describe('Inactive tier (no items in 30+ days)', () => {
    it('should return 24 hours for 0 items in 30 days', () => {
      const metrics: ActivityMetrics = {
        itemsLast7Days: 0,
        itemsLast30Days: 0,
        daysSinceLastItem: 45,
      };

      expect(calculateOptimalInterval(metrics)).toBe(INTERVAL_INACTIVE);
      expect(calculateOptimalInterval(metrics)).toBe(86400);
    });

    it('should return 24 hours for very inactive channels', () => {
      const metrics: ActivityMetrics = {
        itemsLast7Days: 0,
        itemsLast30Days: 0,
        daysSinceLastItem: 180, // 6 months
      };

      expect(calculateOptimalInterval(metrics)).toBe(86400);
    });

    it('should return 24 hours for channels with null daysSinceLastItem', () => {
      const metrics: ActivityMetrics = {
        itemsLast7Days: 0,
        itemsLast30Days: 0,
        daysSinceLastItem: null,
      };

      expect(calculateOptimalInterval(metrics)).toBe(INTERVAL_INACTIVE);
    });

    it('should return 24 hours for newly created subscription with no items', () => {
      const metrics: ActivityMetrics = {
        itemsLast7Days: 0,
        itemsLast30Days: 0,
        daysSinceLastItem: null,
      };

      expect(calculateOptimalInterval(metrics)).toBe(86400);
    });
  });

  describe('boundary conditions', () => {
    it('should correctly classify boundary between very active and active (7 vs 6)', () => {
      // 7 items = very active
      expect(
        calculateOptimalInterval({
          itemsLast7Days: 7,
          itemsLast30Days: 28,
          daysSinceLastItem: 0,
        })
      ).toBe(INTERVAL_VERY_ACTIVE);

      // 6 items = active
      expect(
        calculateOptimalInterval({
          itemsLast7Days: 6,
          itemsLast30Days: 24,
          daysSinceLastItem: 0,
        })
      ).toBe(INTERVAL_ACTIVE);
    });

    it('should correctly classify boundary between active and moderate (1 vs 0 weekly)', () => {
      // 1 item in week = active
      expect(
        calculateOptimalInterval({
          itemsLast7Days: 1,
          itemsLast30Days: 4,
          daysSinceLastItem: 3,
        })
      ).toBe(INTERVAL_ACTIVE);

      // 0 items in week but some in month = moderate
      expect(
        calculateOptimalInterval({
          itemsLast7Days: 0,
          itemsLast30Days: 4,
          daysSinceLastItem: 10,
        })
      ).toBe(INTERVAL_MODERATE);
    });

    it('should correctly classify boundary between moderate and inactive (1 vs 0 monthly)', () => {
      // 1 item in month = moderate
      expect(
        calculateOptimalInterval({
          itemsLast7Days: 0,
          itemsLast30Days: 1,
          daysSinceLastItem: 20,
        })
      ).toBe(INTERVAL_MODERATE);

      // 0 items in month = inactive
      expect(
        calculateOptimalInterval({
          itemsLast7Days: 0,
          itemsLast30Days: 0,
          daysSinceLastItem: 35,
        })
      ).toBe(INTERVAL_INACTIVE);
    });
  });

  describe('daysSinceLastItem does not affect tier', () => {
    it('should classify based on item counts, not recency', () => {
      // Recent last item but no activity counts = inactive
      const recentButInactive: ActivityMetrics = {
        itemsLast7Days: 0,
        itemsLast30Days: 0,
        daysSinceLastItem: 31, // Just over 30 days
      };

      expect(calculateOptimalInterval(recentButInactive)).toBe(INTERVAL_INACTIVE);

      // Old last item but active weekly = active tier
      const oldButActive: ActivityMetrics = {
        itemsLast7Days: 3,
        itemsLast30Days: 10,
        daysSinceLastItem: 5,
      };

      expect(calculateOptimalInterval(oldButActive)).toBe(INTERVAL_ACTIVE);
    });
  });
});

// ============================================================================
// shouldAdjustInterval Tests
// ============================================================================

describe('shouldAdjustInterval', () => {
  const MOCK_NOW = 1705320000000; // 2024-01-15T12:00:00.000Z

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return false for brand new subscription', () => {
    const subscription: Subscription = {
      id: 'sub_1',
      createdAt: MOCK_NOW,
      pollIntervalSeconds: 3600,
    };

    expect(shouldAdjustInterval(subscription)).toBe(false);
  });

  it('should return false for subscription that has not been polled 24 times', () => {
    // With 1 hour polling interval, 23 hours means ~23 polls
    const createdAt = MOCK_NOW - 23 * 3600 * 1000;

    const subscription: Subscription = {
      id: 'sub_1',
      createdAt,
      pollIntervalSeconds: 3600,
    };

    expect(shouldAdjustInterval(subscription)).toBe(false);
  });

  it('should return true after exactly 24 polls', () => {
    // With 1 hour polling interval, 24 hours means exactly 24 polls
    const createdAt = MOCK_NOW - 24 * 3600 * 1000;

    const subscription: Subscription = {
      id: 'sub_1',
      createdAt,
      pollIntervalSeconds: 3600,
    };

    expect(shouldAdjustInterval(subscription)).toBe(true);
  });

  it('should return false after 25 polls (not a multiple of 24)', () => {
    // 25 polls
    const createdAt = MOCK_NOW - 25 * 3600 * 1000;

    const subscription: Subscription = {
      id: 'sub_1',
      createdAt,
      pollIntervalSeconds: 3600,
    };

    expect(shouldAdjustInterval(subscription)).toBe(false);
  });

  it('should return true after 48 polls (2 days, multiple of 24)', () => {
    // 48 hours with 1-hour interval
    const createdAt = MOCK_NOW - 48 * 3600 * 1000;

    const subscription: Subscription = {
      id: 'sub_1',
      createdAt,
      pollIntervalSeconds: 3600,
    };

    expect(shouldAdjustInterval(subscription)).toBe(true);
  });

  it('should account for different poll intervals', () => {
    // With 4-hour polling interval, need 24*4 = 96 hours for 24 polls
    const createdAt = MOCK_NOW - 96 * 3600 * 1000;

    const subscription: Subscription = {
      id: 'sub_1',
      createdAt,
      pollIntervalSeconds: 14400, // 4 hours
    };

    expect(shouldAdjustInterval(subscription)).toBe(true);
  });

  it('should return false for less than expected poll count with longer interval', () => {
    // With 4-hour polling, 80 hours = 20 polls (not 24)
    const createdAt = MOCK_NOW - 80 * 3600 * 1000;

    const subscription: Subscription = {
      id: 'sub_1',
      createdAt,
      pollIntervalSeconds: 14400,
    };

    expect(shouldAdjustInterval(subscription)).toBe(false);
  });
});
