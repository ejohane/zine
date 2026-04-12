export type SubscriptionSource = 'YOUTUBE' | 'SPOTIFY' | 'GMAIL' | 'RSS';
export type IntegrationState = 'connected' | 'needsAttention' | 'notConnected' | 'manual';
export type ConnectionStatus = string | null;

export const SUBSCRIPTION_SOURCES: SubscriptionSource[] = ['YOUTUBE', 'SPOTIFY', 'GMAIL', 'RSS'];

const SOURCE_CONFIG = {
  YOUTUBE: {
    name: 'YouTube',
    integrationName: 'YouTube integration',
    providerLabel: 'YouTube',
    subscriptionNoun: 'subscription',
    route: '/subscriptions/youtube',
    searchPlaceholder: 'Search channels',
    sourceDescription: 'Videos from your subscribed channels land in the inbox after sync.',
    integrationDescription: 'Connect your YouTube account to import channels you already follow.',
  },
  SPOTIFY: {
    name: 'Spotify',
    integrationName: 'Spotify integration',
    providerLabel: 'Spotify',
    subscriptionNoun: 'subscription',
    route: '/subscriptions/spotify',
    searchPlaceholder: 'Search podcasts',
    sourceDescription: 'New episodes from your followed shows show up in the inbox.',
    integrationDescription: 'Connect Spotify to import the podcasts and shows you already follow.',
  },
  GMAIL: {
    name: 'Newsletters',
    integrationName: 'Gmail integration',
    providerLabel: 'Gmail',
    subscriptionNoun: 'newsletter',
    route: '/subscriptions/gmail',
    searchPlaceholder: 'Search newsletters',
    sourceDescription: 'Active newsletters render like articles and arrive in the inbox.',
    integrationDescription:
      'Connect Gmail to detect newsletters in your inbox and keep the ones you want in Zine.',
  },
  RSS: {
    name: 'RSS',
    integrationName: 'No integration required',
    providerLabel: 'RSS',
    subscriptionNoun: 'feed',
    route: '/subscriptions/rss',
    searchPlaceholder: 'Search feeds',
    sourceDescription: 'Paste feed URLs directly into Zine and sync articles on demand.',
    integrationDescription:
      'RSS is manual — add feeds directly without connecting an external account.',
  },
} as const;

export function getSubscriptionSourceConfig(source: SubscriptionSource) {
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

export function formatSourceCount(source: SubscriptionSource, count: number) {
  const noun = SOURCE_CONFIG[source].subscriptionNoun;
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function getHubStatusText(
  source: SubscriptionSource,
  integrationState: IntegrationState,
  count: number
) {
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
) {
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

export function getIntegrationCardCopy(source: SubscriptionSource, state: IntegrationState) {
  const config = SOURCE_CONFIG[source];

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
