import type { Colors } from '@/constants/theme';
import type { Creator } from '@/hooks/use-creator';
import type { useItem } from '@/hooks/use-items-trpc';

export type ItemDetailItem = NonNullable<ReturnType<typeof useItem>['data']>;
export type ItemDetailCreator = Creator | undefined;
export type ItemDetailColors = typeof Colors.dark;
