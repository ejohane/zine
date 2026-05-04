import { keepPreviousData } from '@tanstack/react-query';

import { trpc } from '@/lib/trpc';
import type { RouterOutputs } from '@/lib/trpc-types';

export type PeopleListOutput = RouterOutputs['people']['list'];
export type PersonListItem = PeopleListOutput['people'][number];
export type PersonProfile = RouterOutputs['people']['get'];
export type PersonItem = RouterOutputs['people']['listItems']['items'][number];

export function usePeople(options?: { query?: string; limit?: number; sort?: 'count' | 'recent' }) {
  return trpc.people.list.useInfiniteQuery(
    {
      query: options?.query,
      limit: options?.limit ?? 20,
      sort: options?.sort ?? 'count',
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      placeholderData: keepPreviousData,
    }
  );
}

export function usePerson(personId: string) {
  return trpc.people.get.useQuery(
    { personId },
    {
      enabled: !!personId,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    }
  );
}

export function usePersonItems(personId: string, options?: { limit?: number }) {
  return trpc.people.listItems.useInfiniteQuery(
    { personId, limit: options?.limit ?? 20 },
    {
      enabled: !!personId,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      placeholderData: keepPreviousData,
    }
  );
}
