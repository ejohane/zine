import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@zine/worker/trpc/router';

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type HomeItem = RouterOutputs['items']['home']['recentBookmarks'][number];
export type LibraryItem = RouterOutputs['items']['library']['items'][number];
export type InboxItem = RouterOutputs['items']['inbox']['items'][number];
export type SubscriptionItem = RouterOutputs['subscriptions']['list']['items'][number];
export type DiscoverableSubscription =
  RouterOutputs['subscriptions']['discover']['available']['items'][number];
export type NewsletterItem = RouterOutputs['subscriptions']['newsletters']['list']['items'][number];
export type RssFeed = RouterOutputs['subscriptions']['rss']['list']['items'][number];
export type WeeklyRecap = RouterOutputs['insights']['weeklyRecap'];
export type WeeklyRecapTeaser = RouterOutputs['insights']['weeklyRecapTeaser'];
export type BookmarkPreview = RouterOutputs['bookmarks']['preview'];
export type BookmarkSaveResult = RouterOutputs['bookmarks']['save'];
