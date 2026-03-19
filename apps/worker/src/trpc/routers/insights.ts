import { z } from 'zod';

import { getWeeklyRecap, toWeeklyRecapTeaser } from '../../lib/weekly-recap';
import { protectedProcedure, router } from '../trpc';

const WeeklyRecapInputSchema = z
  .object({
    timezone: z.string().trim().min(1).max(100).optional(),
    weekAnchorDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .optional();

export const insightsRouter = router({
  weeklyRecap: protectedProcedure.input(WeeklyRecapInputSchema).query(async ({ input, ctx }) =>
    getWeeklyRecap({
      d1: ctx.env.DB,
      userId: ctx.userId,
      timezone: input?.timezone,
      weekAnchorDate: input?.weekAnchorDate,
    })
  ),

  weeklyRecapTeaser: protectedProcedure
    .input(WeeklyRecapInputSchema)
    .query(async ({ input, ctx }) => {
      const recap = await getWeeklyRecap({
        d1: ctx.env.DB,
        userId: ctx.userId,
        timezone: input?.timezone,
        weekAnchorDate: input?.weekAnchorDate,
      });

      return toWeeklyRecapTeaser(recap);
    }),
});

export type InsightsRouter = typeof insightsRouter;
