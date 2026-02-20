import { trpc } from '@/lib/trpc';
import type { RssListOutput, RssStatsOutput } from '@/lib/trpc-types';

export type RssFeed = RssListOutput['items'][number];
export type RssFeedStatus = RssFeed['status'];

export function useRssFeeds() {
  const utils = trpc.useUtils();

  const listQuery = trpc.subscriptions.rss.list.useQuery(
    { limit: 100 },
    {
      staleTime: 60 * 1000,
    }
  );

  const statsQuery = trpc.subscriptions.rss.stats.useQuery(undefined, {
    staleTime: 60 * 1000,
  });

  const addMutation = trpc.subscriptions.rss.add.useMutation({
    onSuccess: () => {
      utils.subscriptions.rss.list.invalidate();
      utils.subscriptions.rss.stats.invalidate();
      utils.items.inbox.invalidate();
      utils.items.home.invalidate();
    },
  });

  const pauseMutation = trpc.subscriptions.rss.pause.useMutation({
    onSuccess: () => {
      utils.subscriptions.rss.list.invalidate();
      utils.subscriptions.rss.stats.invalidate();
    },
  });

  const resumeMutation = trpc.subscriptions.rss.resume.useMutation({
    onSuccess: () => {
      utils.subscriptions.rss.list.invalidate();
      utils.subscriptions.rss.stats.invalidate();
    },
  });

  const removeMutation = trpc.subscriptions.rss.remove.useMutation({
    onSuccess: () => {
      utils.subscriptions.rss.list.invalidate();
      utils.subscriptions.rss.stats.invalidate();
    },
  });

  const syncNowMutation = trpc.subscriptions.rss.syncNow.useMutation({
    onSuccess: () => {
      utils.subscriptions.rss.list.invalidate();
      utils.subscriptions.rss.stats.invalidate();
      utils.items.inbox.invalidate();
      utils.items.home.invalidate();
    },
  });

  const allFeeds = listQuery.data?.items ?? [];
  const visibleFeeds = allFeeds.filter((feed) => feed.status !== 'UNSUBSCRIBED');

  return {
    feeds: visibleFeeds,
    stats: statsQuery.data as RssStatsOutput | undefined,
    isLoading: listQuery.isLoading || statsQuery.isLoading,
    isSyncing: syncNowMutation.isPending,
    addingFeed: addMutation.isPending,
    listQuery,
    statsQuery,
    addFeed: addMutation.mutate,
    pauseFeed: pauseMutation.mutate,
    resumeFeed: resumeMutation.mutate,
    removeFeed: removeMutation.mutate,
    syncFeedNow: syncNowMutation.mutate,
  };
}
