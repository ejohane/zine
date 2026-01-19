/**
 * Admin tRPC Router
 *
 * Protected endpoints for administrative operations like data repair.
 * These endpoints require authentication and should be used with caution.
 *
 * @module trpc/routers/admin
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { ProviderSchema } from '@zine/shared';
import {
  findCorruptedSubscriptions,
  repairCorruptedSubscriptions,
  verifyRepairs,
  generateRepairReport,
} from '../../admin/repair-subscriptions';
import { logger } from '../../lib/logger';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

const adminLogger = logger.child('admin');

// ============================================================================
// Input Schemas
// ============================================================================

/**
 * Input for finding corrupted subscriptions
 */
const FindCorruptedInputSchema = z.object({
  /** Provider to scan (default: SPOTIFY) */
  provider: ProviderSchema.optional(),
});

/**
 * Input for repair operation
 */
const RepairInputSchema = z.object({
  /** Provider to repair (default: SPOTIFY) */
  provider: ProviderSchema.optional(),
  /** If true, only report what would be done (default: true) */
  dryRun: z.boolean().default(true),
  /** Specific subscription IDs to repair (optional) */
  subscriptionIds: z.array(z.string()).optional(),
});

/**
 * Input for verification
 */
const VerifyInputSchema = z.object({
  /** Provider to verify (default: SPOTIFY) */
  provider: ProviderSchema.optional(),
});

// ============================================================================
// Router
// ============================================================================

export const adminRouter = router({
  /**
   * Find corrupted subscriptions for the current user
   *
   * Scans user's subscriptions for lastPublishedAt corruption:
   * - Watermark exists but no items ingested
   * - Watermark is > 1 day ahead of newest actual item
   *
   * @returns List of corrupted subscriptions with details
   */
  findCorrupted: protectedProcedure
    .input(FindCorruptedInputSchema.optional())
    .query(async ({ ctx, input }) => {
      adminLogger.info('findCorrupted called', {
        userId: ctx.userId,
        provider: input?.provider,
      });

      const result = await findCorruptedSubscriptions(ctx.db as unknown as DrizzleD1Database, {
        provider: input?.provider,
        userId: ctx.userId,
      });

      return {
        totalScanned: result.totalScanned,
        corruptedCount: result.corrupted.length,
        healthyCount: result.healthy + result.noWatermark,
        corrupted: result.corrupted.map((sub) => ({
          id: sub.id,
          providerChannelId: sub.providerChannelId,
          provider: sub.provider,
          lastPublishedAt: sub.lastPublishedAt,
          newestItemAt: sub.newestItemAt,
          gapDays: sub.gapDays,
        })),
      };
    }),

  /**
   * Generate a repair report for corrupted subscriptions
   *
   * @returns Human-readable report of corrupted subscriptions
   */
  repairReport: protectedProcedure
    .input(FindCorruptedInputSchema.optional())
    .query(async ({ ctx, input }) => {
      adminLogger.info('repairReport called', {
        userId: ctx.userId,
        provider: input?.provider,
      });

      const result = await findCorruptedSubscriptions(ctx.db as unknown as DrizzleD1Database, {
        provider: input?.provider,
        userId: ctx.userId,
      });

      return {
        report: generateRepairReport(result),
        corruptedCount: result.corrupted.length,
      };
    }),

  /**
   * Repair corrupted subscriptions
   *
   * By default runs in dry-run mode (dryRun: true) to preview changes.
   * Set dryRun: false to actually execute the repair.
   *
   * @returns Repair operation result with details of each change
   */
  repair: protectedProcedure.input(RepairInputSchema).mutation(async ({ ctx, input }) => {
    adminLogger.info('repair called', {
      userId: ctx.userId,
      provider: input.provider,
      dryRun: input.dryRun,
      subscriptionIds: input.subscriptionIds?.length,
    });

    const result = await repairCorruptedSubscriptions(ctx.db as unknown as DrizzleD1Database, {
      provider: input.provider,
      userId: ctx.userId,
      dryRun: input.dryRun,
      subscriptionIds: input.subscriptionIds,
    });

    adminLogger.info('repair complete', {
      userId: ctx.userId,
      dryRun: result.dryRun,
      repairCount: result.repairCount,
      errorCount: result.errors.length,
    });

    return result;
  }),

  /**
   * Verify repairs were successful
   *
   * Re-runs corruption detection to confirm no corrupted subscriptions remain.
   *
   * @returns Verification result
   */
  verifyRepairs: protectedProcedure
    .input(VerifyInputSchema.optional())
    .query(async ({ ctx, input }) => {
      adminLogger.info('verifyRepairs called', {
        userId: ctx.userId,
        provider: input?.provider,
      });

      const result = await verifyRepairs(ctx.db as unknown as DrizzleD1Database, {
        provider: input?.provider,
        userId: ctx.userId,
      });

      return result;
    }),
});

export type AdminRouter = typeof adminRouter;
