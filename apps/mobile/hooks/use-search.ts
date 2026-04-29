import { keepPreviousData } from '@tanstack/react-query';

import { trpc } from '@/lib/trpc';
import type { RouterOutputs } from '@/lib/trpc-types';

export type SearchOutput = RouterOutputs['search']['query'];
export type SearchResult = SearchOutput['results'][number];
export type CreatorSearchResult = Extract<SearchResult, { type: 'creator' }>;
export type ItemSearchResult = Extract<SearchResult, { type: 'item' }>;

export function useSearchResults(
  query: string,
  options?: {
    creatorsLimit?: number;
    itemsLimit?: number;
  }
) {
  const trimmedQuery = query.trim();
  const enabled = trimmedQuery.length > 0;

  return trpc.search.query.useQuery(
    {
      query: enabled ? trimmedQuery : ' ',
      scope: 'library',
      creatorsLimit: options?.creatorsLimit ?? 5,
      itemsLimit: options?.itemsLimit ?? 20,
    },
    {
      enabled,
      placeholderData: keepPreviousData,
    }
  );
}
