import { z } from 'zod';
import { ContentType, Provider } from './types/domain';

export const CollectionSort = {
  NEWEST_SAVED: 'NEWEST_SAVED',
  OLDEST_SAVED: 'OLDEST_SAVED',
  SHORTEST: 'SHORTEST',
  LONGEST: 'LONGEST',
  RECENTLY_OPENED: 'RECENTLY_OPENED',
} as const;

export type CollectionSortValue = (typeof CollectionSort)[keyof typeof CollectionSort];

export const CollectionOverrideAction = {
  PIN: 'PIN',
  HIDE: 'HIDE',
} as const;

export type CollectionOverrideActionValue =
  (typeof CollectionOverrideAction)[keyof typeof CollectionOverrideAction];

export const CollectionItemMembership = {
  INCLUDED_BY_RULES: 'INCLUDED_BY_RULES',
  PINNED: 'PINNED',
  HIDDEN: 'HIDDEN',
  NONE: 'NONE',
} as const;

export type CollectionItemMembershipValue =
  (typeof CollectionItemMembership)[keyof typeof CollectionItemMembership];

export const HomeCollectionLayout = {
  STACK_RAIL: 'STACK_RAIL',
  COVER_RAIL: 'COVER_RAIL',
  ROW_GRID: 'ROW_GRID',
  COMPACT_LIST: 'COMPACT_LIST',
} as const;

export type HomeCollectionLayoutValue =
  (typeof HomeCollectionLayout)[keyof typeof HomeCollectionLayout];

export const CollectionRulesSchema = z
  .object({
    contentTypes: z.array(z.nativeEnum(ContentType)).max(8).optional(),
    providers: z.array(z.nativeEnum(Provider)).max(12).optional(),
    tagIds: z.array(z.string().min(1)).max(24).optional(),
    isFinished: z.boolean().optional(),
    minLengthMinutes: z
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .optional(),
    maxLengthMinutes: z
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .optional(),
    search: z.string().trim().min(1).max(100).optional(),
  })
  .superRefine((rules, ctx) => {
    if (
      rules.minLengthMinutes !== undefined &&
      rules.maxLengthMinutes !== undefined &&
      rules.minLengthMinutes > rules.maxLengthMinutes
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Minimum length cannot be greater than maximum length',
        path: ['minLengthMinutes'],
      });
    }
  });

export type CollectionRules = z.infer<typeof CollectionRulesSchema>;

export const CollectionSortSchema = z.nativeEnum(CollectionSort);
export const CollectionOverrideActionSchema = z.nativeEnum(CollectionOverrideAction);
export const HomeCollectionLayoutSchema = z.nativeEnum(HomeCollectionLayout);
