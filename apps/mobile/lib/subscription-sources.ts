import type { Href } from 'expo-router';

import type { ConnectionStatus } from '@/lib/connection-status';

export type SubscriptionSource = 'YOUTUBE' | 'SPOTIFY' | 'GMAIL' | 'RSS';
export type IntegrationState = 'connected' | 'needsAttention' | 'notConnected' | 'manual';

type SourceConfig = {
  key: SubscriptionSource;
  name: string;
  integrationName: string;
  integrationDescription: string;
  sourceDescription: string;
  providerLabel: string;
  subscriptionNoun: string;
  searchPlaceholder: string;
  route: Href;
};

const SOURCE_CONFIG: Record<SubscriptionSource, SourceConfig> = {
  YOUTUBE: {
    key: 'YOUTUBE',
    name: 'YouTube',
    integrationName: 'YouTube integration',
    integrationDescription: 'Connect your YouTube account to import channels you already follow.',
    sourceDescription: 'Videos from your subscribed channels appear in the inbox after sync.',
    providerLabel: 'YouTube',
    subscriptionNoun: 'subscription',
    searchPlaceholder: 'Search channels',
    route: '/subscriptions/youtube',
  },
  SPOTIFY: {
    key: 'SPOTIFY',
    name: 'Spotify',
    integrationName: 'Spotify integration',
    integrationDescription: 'Connect Spotify to import the podcasts and shows you follow there.',
    sourceDescription: 'New podcast episodes from your subscriptions appear in the inbox.',
    providerLabel: 'Spotify',
    subscriptionNoun: 'subscription',
    searchPlaceholder: 'Search podcasts',
    route: '/subscriptions/spotify',
  },
  GMAIL: {
    key: 'GMAIL',
    name: 'Newsletters',
    integrationName: 'Gmail integration',
    integrationDescription:
      'Connect Gmail to detect newsletters in your inbox and keep the ones you want in Zine.',
    sourceDescription: 'Newsletter issues render like articles and land in the inbox when active.',
    providerLabel: 'Gmail',
    subscriptionNoun: 'newsletter',
    searchPlaceholder: 'Search newsletters',
    route: '/subscriptions/gmail',
  },
  RSS: {
    key: 'RSS',
    name: 'RSS',
    integrationName: 'No integration required',
    integrationDescription: 'Paste feed URLs directly into Zine. No external account is required.',
    sourceDescription: 'RSS feeds sync directly and add new articles to the inbox.',
    providerLabel: 'RSS',
    subscriptionNoun: 'feed',
    searchPlaceholder: 'Search feeds',
    route: '/subscriptions/rss',
  },
};

export function getSubscriptionSourceConfig(source: SubscriptionSource): SourceConfig {
  return SOURCE_CONFIG[source];
}

export function getIntegrationState(
  source: SubscriptionSource,
  status: ConnectionStatus
): IntegrationState {
  if (source === 'RSS') {
    return 'manual';
  }

  if (status === 'ACTIVE') {
    return 'connected';
  }

  if (status === 'EXPIRED' || status === 'REVOKED') {
    return 'needsAttention';
  }

  return 'notConnected';
}

export function formatSourceCount(source: SubscriptionSource, count: number): string {
  const noun = getSubscriptionSourceConfig(source).subscriptionNoun;
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function getHubStatusText(
  source: SubscriptionSource,
  integrationState: IntegrationState,
  count: number
): string {
  if (integrationState === 'manual') {
    return count > 0
      ? `No integration required · ${formatSourceCount(source, count)}`
      : 'No integration required';
  }

  const integrationText =
    integrationState === 'connected'
      ? 'Integration connected'
      : integrationState === 'needsAttention'
        ? 'Integration needs attention'
        : 'Integration not connected';

  return count > 0 ? `${integrationText} · ${formatSourceCount(source, count)}` : integrationText;
}

export function buildSubscriptionsSummary(
  totalActiveCount: number,
  connectedIntegrations: number,
  attentionCount: number
): string {
  const parts = [
    totalActiveCount > 0
      ? `${totalActiveCount} active subscription${totalActiveCount === 1 ? '' : 's'}`
      : 'No active subscriptions yet',
    connectedIntegrations > 0
      ? `${connectedIntegrations} integration${connectedIntegrations === 1 ? '' : 's'} connected`
      : 'No integrations connected yet',
  ];

  if (attentionCount > 0) {
    parts.push(
      `${attentionCount} integration${attentionCount === 1 ? '' : 's'} ${
        attentionCount === 1 ? 'needs' : 'need'
      } attention`
    );
  }

  return parts.join(' · ');
}

export function getIntegrationBadgeLabel(state: IntegrationState): string {
  switch (state) {
    case 'connected':
      return 'Connected';
    case 'needsAttention':
      return 'Needs attention';
    case 'manual':
      return 'No integration required';
    case 'notConnected':
    default:
      return 'Not connected';
  }
}

export function getIntegrationCardCopy(
  source: SubscriptionSource,
  state: IntegrationState
): {
  title: string;
  description: string;
  actionLabel: string | null;
} {
  const config = getSubscriptionSourceConfig(source);

  if (state === 'manual') {
    return {
      title: 'No integration required',
      description: config.integrationDescription,
      actionLabel: null,
    };
  }

  if (state === 'connected') {
    return {
      title: 'Integration connected',
      description: config.sourceDescription,
      actionLabel: 'Disconnect',
    };
  }

  if (state === 'needsAttention') {
    return {
      title: 'Integration needs attention',
      description: `Reconnect ${config.providerLabel} to keep subscriptions syncing into your inbox.`,
      actionLabel: 'Reconnect',
    };
  }

  return {
    title: 'Integration not connected',
    description: config.integrationDescription,
    actionLabel: 'Connect',
  };
}
