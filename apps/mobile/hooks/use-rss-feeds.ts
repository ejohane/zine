import { trpc } from '@/lib/trpc';

export type RssFeedStatus = 'ACTIVE' | 'PAUSED' | 'UNSUBSCRIBED' | 'ERROR';

export interface RssFeed {
  id: string;
  feedUrl: string;
  title: string;
  description: string | null;
  siteUrl: string | null;
  imageUrl: string | null;
  status: RssFeedStatus;
  errorCount: number;
  lastError: string | null;
  lastPolledAt: number | null;
  lastSuccessAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export function useRssFeeds() {
  const utils = trpc.useUtils() as any;

  const listQuery = (trpc as any).subscriptions.rss.list.useQuery(
    { limit: 100 },
    {
      staleTime: 60 * 1000,
    }
  );

  const statsQuery = (trpc as any).subscriptions.rss.stats.useQuery(undefined, {
    staleTime: 60 * 1000,
  });

  const addMutation = (trpc as any).subscriptions.rss.add.useMutation({
    onSuccess: () => {
      utils.subscriptions?.rss?.list?.invalidate?.();
      utils.subscriptions?.rss?.stats?.invalidate?.();
      utils.items?.inbox?.invalidate?.();
      utils.items?.home?.invalidate?.();
    },
  });

  const pauseMutation = (trpc as any).subscriptions.rss.pause.useMutation({
    onSuccess: () => {
      utils.subscriptions?.rss?.list?.invalidate?.();
      utils.subscriptions?.rss?.stats?.invalidate?.();
    },
  });

  const resumeMutation = (trpc as any).subscriptions.rss.resume.useMutation({
    onSuccess: () => {
      utils.subscriptions?.rss?.list?.invalidate?.();
      utils.subscriptions?.rss?.stats?.invalidate?.();
    },
  });

  const removeMutation = (trpc as any).subscriptions.rss.remove.useMutation({
    onSuccess: () => {
      utils.subscriptions?.rss?.list?.invalidate?.();
      utils.subscriptions?.rss?.stats?.invalidate?.();
    },
  });

  const syncNowMutation = (trpc as any).subscriptions.rss.syncNow.useMutation({
    onSuccess: () => {
      utils.subscriptions?.rss?.list?.invalidate?.();
      utils.subscriptions?.rss?.stats?.invalidate?.();
      utils.items?.inbox?.invalidate?.();
      utils.items?.home?.invalidate?.();
    },
  });

  const allFeeds = ((listQuery.data as { items?: RssFeed[] } | undefined)?.items ??
    []) as RssFeed[];
  const visibleFeeds = allFeeds.filter((feed) => feed.status !== 'UNSUBSCRIBED');

  return {
    feeds: visibleFeeds,
    stats: statsQuery.data as
      | {
          total: number;
          active: number;
          paused: number;
          unsubscribed: number;
          error: number;
          lastSuccessAt: number | null;
        }
      | undefined,
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
