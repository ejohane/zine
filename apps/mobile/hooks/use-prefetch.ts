/**
 * Prefetch strategy hooks for high-value queries.
 */

import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useIsRestoring } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';

type ListQueryKey = 'home' | 'inbox' | 'library';
export type PrefetchTab = 'home' | 'inbox' | 'library';

const TAB_PREFETCH_TARGETS: Record<PrefetchTab, readonly ListQueryKey[]> = {
  home: ['inbox', 'library'],
  inbox: ['home', 'library'],
  library: ['home', 'inbox'],
};

export function getTabPrefetchTargets(tab: PrefetchTab): readonly ListQueryKey[] {
  return TAB_PREFETCH_TARGETS[tab];
}

function prefetchSafely(prefetcher: () => Promise<unknown>) {
  void prefetcher().catch(() => undefined);
}

function prefetchListQueries(
  utils: ReturnType<typeof trpc.useUtils>,
  targets: readonly ListQueryKey[]
) {
  const listPrefetchers: Record<ListQueryKey, () => Promise<unknown>> = {
    home: () => utils.items.home.prefetch(),
    inbox: () => utils.items.inbox.prefetch(),
    library: () => utils.items.library.prefetch(),
  };

  targets.forEach((target) => {
    prefetchSafely(listPrefetchers[target]);
  });
}

export function useBaselinePrefetchOnFocus() {
  const utils = trpc.useUtils();
  const isRestoring = useIsRestoring();
  const hasHydratedRef = useRef(false);

  const prefetchBaseline = useCallback(() => {
    if (isRestoring) return;

    prefetchListQueries(utils, ['home', 'inbox', 'library']);
    prefetchSafely(() => (utils as any).subscriptions.list.prefetch({}));
    prefetchSafely(() => (utils as any).subscriptions.connections.list.prefetch(undefined));
  }, [isRestoring, utils]);

  useEffect(() => {
    if (isRestoring || hasHydratedRef.current) return;
    hasHydratedRef.current = true;
    prefetchBaseline();
  }, [isRestoring, prefetchBaseline]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        prefetchBaseline();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => subscription.remove();
  }, [prefetchBaseline]);
}

export function useTabPrefetch(tab: PrefetchTab) {
  const utils = trpc.useUtils();
  const targets = getTabPrefetchTargets(tab);

  const prefetchTabTargets = useCallback(() => {
    prefetchListQueries(utils, targets);
  }, [utils, targets]);

  useFocusEffect(
    useCallback(() => {
      prefetchTabTargets();
    }, [prefetchTabTargets])
  );
}

export function usePrefetchItemDetail() {
  const utils = trpc.useUtils();

  return useCallback(
    (id: string) => {
      if (!id) return;
      prefetchSafely(() => utils.items.get.prefetch({ id }));
    },
    [utils]
  );
}
