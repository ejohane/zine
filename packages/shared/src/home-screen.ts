import { z } from 'zod';

export const HomeScreenSectionKind = {
  BUILT_IN: 'BUILT_IN',
  COLLECTION: 'COLLECTION',
} as const;

export type HomeScreenSectionKindValue =
  (typeof HomeScreenSectionKind)[keyof typeof HomeScreenSectionKind];

export const HomeScreenBuiltInSection = {
  JUMP_BACK_IN: 'JUMP_BACK_IN',
  RECENTLY_BOOKMARKED: 'RECENTLY_BOOKMARKED',
  INBOX: 'INBOX',
  PODCASTS: 'PODCASTS',
  ARTICLES: 'ARTICLES',
  VIDEOS: 'VIDEOS',
} as const;

export type HomeScreenBuiltInSectionValue =
  (typeof HomeScreenBuiltInSection)[keyof typeof HomeScreenBuiltInSection];

export const HOME_SCREEN_DEFAULT_BUILT_IN_SECTIONS: HomeScreenBuiltInSectionValue[] = [
  HomeScreenBuiltInSection.JUMP_BACK_IN,
  HomeScreenBuiltInSection.RECENTLY_BOOKMARKED,
  HomeScreenBuiltInSection.INBOX,
  HomeScreenBuiltInSection.PODCASTS,
  HomeScreenBuiltInSection.ARTICLES,
  HomeScreenBuiltInSection.VIDEOS,
];

export const HOME_SCREEN_COLLECTION_INSERT_AFTER = HomeScreenBuiltInSection.INBOX;

export const HomeScreenBuiltInSectionSchema = z.nativeEnum(HomeScreenBuiltInSection);
export const HomeScreenSectionKindSchema = z.nativeEnum(HomeScreenSectionKind);

export const HomeScreenLayoutSectionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal(HomeScreenSectionKind.BUILT_IN),
    builtInSection: HomeScreenBuiltInSectionSchema,
  }),
  z.object({
    kind: z.literal(HomeScreenSectionKind.COLLECTION),
    collectionId: z.string().min(1),
  }),
]);

export type HomeScreenLayoutSection = z.infer<typeof HomeScreenLayoutSectionSchema>;

export const HomeScreenSettingsSectionInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal(HomeScreenSectionKind.BUILT_IN),
    builtInSection: HomeScreenBuiltInSectionSchema,
    enabled: z.boolean(),
  }),
  z.object({
    kind: z.literal(HomeScreenSectionKind.COLLECTION),
    collectionId: z.string().min(1),
    enabled: z.literal(true).default(true),
  }),
]);

export type HomeScreenSettingsSectionInput = z.infer<typeof HomeScreenSettingsSectionInputSchema>;

export function getHomeScreenBuiltInSectionTitle(section: HomeScreenBuiltInSectionValue): string {
  switch (section) {
    case HomeScreenBuiltInSection.JUMP_BACK_IN:
      return 'Jump Back In';
    case HomeScreenBuiltInSection.RECENTLY_BOOKMARKED:
      return 'Recently Bookmarked';
    case HomeScreenBuiltInSection.INBOX:
      return 'Inbox';
    case HomeScreenBuiltInSection.PODCASTS:
      return 'Podcasts';
    case HomeScreenBuiltInSection.ARTICLES:
      return 'Articles';
    case HomeScreenBuiltInSection.VIDEOS:
      return 'Videos';
  }
}

export function getHomeScreenBuiltInSectionSubtitle(
  section: HomeScreenBuiltInSectionValue
): string {
  switch (section) {
    case HomeScreenBuiltInSection.JUMP_BACK_IN:
      return 'Items you opened recently';
    case HomeScreenBuiltInSection.RECENTLY_BOOKMARKED:
      return 'Your latest saves';
    case HomeScreenBuiltInSection.INBOX:
      return 'Fresh items waiting for review';
    case HomeScreenBuiltInSection.PODCASTS:
      return 'Saved audio episodes';
    case HomeScreenBuiltInSection.ARTICLES:
      return 'Saved reads';
    case HomeScreenBuiltInSection.VIDEOS:
      return 'Saved videos';
  }
}
