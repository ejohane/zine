/**
 * Prefetch strategy hooks for high-value queries.
 */

import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useIsRestoring } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { useAuthResumeGate } from '@/providers/auth-resume-gate';

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
    inbox: () =>
      Promise.all([utils.items.inbox.prefetch(), utils.items.inbox.prefetchInfinite(undefined)]),
    library: () =>
      Promise.all([
        utils.items.library.prefetch(),
        utils.items.library.prefetchInfinite(undefined),
      ]),
  };

  targets.forEach((target) => {
    prefetchSafely(listPrefetchers[target]);
  });
}

export function useBaselinePrefetchOnFocus() {
  const utils = trpc.useUtils();
  const isRestoring = useIsRestoring();
  const hasHydratedRef = useRef(false);
  const { ensureFreshAuthToken } = useAuthResumeGate();

  const prefetchBaseline = useCallback(async (): Promise<boolean> => {
    if (isRestoring) return false;
    const shouldPrefetch = await ensureFreshAuthToken();
    if (!shouldPrefetch) {
      return false;
    }

    prefetchListQueries(utils, ['home', 'inbox', 'library']);
    prefetchSafely(() => utils.subscriptions.list.prefetch({}));
    prefetchSafely(() => utils.subscriptions.connections.list.prefetch());
    return true;
  }, [ensureFreshAuthToken, isRestoring, utils]);

  useEffect(() => {
    if (isRestoring || hasHydratedRef.current) return;
    void prefetchBaseline().then((didPrefetch) => {
      if (didPrefetch) {
        hasHydratedRef.current = true;
      }
    });
  }, [isRestoring, prefetchBaseline]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void prefetchBaseline();
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
