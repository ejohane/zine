import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../worker/src/trpc/router';

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export type SubscriptionsListInput = RouterInputs['subscriptions']['list'];
export type SubscriptionsListOutput = RouterOutputs['subscriptions']['list'];
export type SubscriptionListItemOutput = SubscriptionsListOutput['items'][number];
export type AddSubscriptionInput = RouterInputs['subscriptions']['add'];
export type RemoveSubscriptionInput = RouterInputs['subscriptions']['remove'];
export type SyncSubscriptionInput = RouterInputs['subscriptions']['syncNow'];
export type SyncSubscriptionOutput = RouterOutputs['subscriptions']['syncNow'];

export type ConnectionsListOutput = RouterOutputs['subscriptions']['connections']['list'];
export type DisconnectConnectionInput = RouterInputs['subscriptions']['connections']['disconnect'];

export type DiscoverAvailableInput = RouterInputs['subscriptions']['discover']['available'];
export type DiscoverAvailableOutput = RouterOutputs['subscriptions']['discover']['available'];

export type NewslettersListInput = RouterInputs['subscriptions']['newsletters']['list'];
export type NewslettersListOutput = RouterOutputs['subscriptions']['newsletters']['list'];
export type NewslettersStatsOutput = RouterOutputs['subscriptions']['newsletters']['stats'];

export type RssListInput = RouterInputs['subscriptions']['rss']['list'];
export type RssListOutput = RouterOutputs['subscriptions']['rss']['list'];
export type RssStatsOutput = RouterOutputs['subscriptions']['rss']['stats'];
