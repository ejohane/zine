import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
  HOME_SCREEN_DEFAULT_BUILT_IN_SECTIONS,
  HomeScreenSectionKind,
  HomeScreenSettingsSectionInputSchema,
} from '@zine/shared';
import {
  getHomeScreenSettings,
  replaceHomeScreenSettings,
  resetHomeScreenSettings,
} from '../../home-screen/layout';
import { protectedProcedure, router } from '../trpc';

const UpdateHomeScreenSettingsInput = z
  .object({
    sections: z.array(HomeScreenSettingsSectionInputSchema).min(1).max(100),
  })
  .superRefine((input, ctx) => {
    const builtIns = new Set<string>();
    const collections = new Set<string>();
    let enabledCount = 0;

    for (const [index, section] of input.sections.entries()) {
      if (section.enabled) enabledCount += 1;

      if (section.kind === HomeScreenSectionKind.BUILT_IN) {
        if (builtIns.has(section.builtInSection)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Built-in sections cannot be duplicated',
            path: ['sections', index, 'builtInSection'],
          });
        }
        builtIns.add(section.builtInSection);
        continue;
      }

      if (collections.has(section.collectionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Collections cannot be duplicated',
          path: ['sections', index, 'collectionId'],
        });
      }
      collections.add(section.collectionId);
    }

    for (const builtInSection of HOME_SCREEN_DEFAULT_BUILT_IN_SECTIONS) {
      if (!builtIns.has(builtInSection)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'All built-in sections must be included',
          path: ['sections'],
        });
        break;
      }
    }

    if (enabledCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one Home section must be visible',
        path: ['sections'],
      });
    }
  });

export const homeSettingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => getHomeScreenSettings(ctx.db, ctx.userId)),

  update: protectedProcedure
    .input(UpdateHomeScreenSettingsInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await replaceHomeScreenSettings(ctx.db, ctx.userId, input.sections);
        return { success: true as const };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === 'One or more collections are unavailable.'
        ) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: error.message });
        }
        throw error;
      }
    }),

  reset: protectedProcedure.mutation(async ({ ctx }) => {
    await resetHomeScreenSettings(ctx.db, ctx.userId);
    return { success: true as const };
  }),
});
