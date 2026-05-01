import type { Colors } from '@/constants/theme';
import type { Creator } from '@/hooks/use-creator';
import type { useItem, useItemEnrichment } from '@/hooks/use-items-trpc';

export type ItemDetailItem = NonNullable<ReturnType<typeof useItem>['data']>;
export type ItemDetailEnrichment = ReturnType<typeof useItemEnrichment>['data'];
export type ItemDetailCreator = Creator | undefined;
export type ItemDetailColors = typeof Colors.dark;
