import { z } from 'zod';

import { getWeeklyRecap, toWeeklyRecapTeaser } from '../../lib/weekly-recap';
import { protectedProcedure, router } from '../trpc';

const WeeklyRecapInputSchema = z
  .object({
    timezone: z.string().trim().min(1).max(100).optional(),
  })
  .optional();

export const insightsRouter = router({
  weeklyRecap: protectedProcedure.input(WeeklyRecapInputSchema).query(async ({ input, ctx }) =>
    getWeeklyRecap({
      d1: ctx.env.DB,
      userId: ctx.userId,
      timezone: input?.timezone,
    })
  ),

  weeklyRecapTeaser: protectedProcedure
    .input(WeeklyRecapInputSchema)
    .query(async ({ input, ctx }) => {
      const recap = await getWeeklyRecap({
        d1: ctx.env.DB,
        userId: ctx.userId,
        timezone: input?.timezone,
      });

      return toWeeklyRecapTeaser(recap);
    }),
});

export type InsightsRouter = typeof insightsRouter;
