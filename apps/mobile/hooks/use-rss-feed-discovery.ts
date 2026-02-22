import { trpc } from '@/lib/trpc';
import type { RssDiscoverOutput } from '@/lib/trpc-types';

export type DiscoveredRssCandidate = RssDiscoverOutput['candidates'][number];

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function useRssFeedDiscovery(url: string, enabled: boolean) {
  const utils = trpc.useUtils();
  const normalizedUrl = url.trim();
  const shouldDiscover = enabled && isHttpUrl(normalizedUrl);

  const discoverQuery = trpc.subscriptions.rss.discover.useQuery(
    { url: normalizedUrl },
    {
      enabled: shouldDiscover,
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    }
  );

  const addMutation = trpc.subscriptions.rss.add.useMutation({
    onSuccess: () => {
      utils.subscriptions.rss.list.invalidate();
      utils.subscriptions.rss.stats.invalidate();
      utils.items.inbox.invalidate();
      utils.items.home.invalidate();
    },
  });

  const candidates = discoverQuery.data?.candidates ?? [];

  return {
    sourceUrl: discoverQuery.data?.sourceUrl ?? normalizedUrl,
    sourceOrigin: discoverQuery.data?.sourceOrigin ?? null,
    candidates,
    checkedAt: discoverQuery.data?.checkedAt ?? null,
    cached: discoverQuery.data?.cached ?? false,
    isDiscovering: discoverQuery.isLoading || discoverQuery.isFetching,
    discoveryError: discoverQuery.error,
    subscribeToFeed: addMutation.mutate,
    subscribeToFeedAsync: addMutation.mutateAsync,
    isSubscribing: addMutation.isPending,
    subscribeError: addMutation.error,
    refetchDiscovery: discoverQuery.refetch,
  };
}
