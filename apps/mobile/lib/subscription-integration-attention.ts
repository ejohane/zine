import { isReconnectRequired } from '@/lib/connection-status';
import type { ConnectionProvider, ConnectionStatus } from '@/hooks/use-connections';
import type { SubscriptionProvider, SubscriptionStatus } from '@/hooks/use-subscriptions-query';

type IntegrationProvider = ConnectionProvider | SubscriptionProvider;

type IntegrationConnection = {
  provider: IntegrationProvider;
  status: ConnectionStatus;
};

type IntegrationSubscription = {
  provider: SubscriptionProvider;
  status: SubscriptionStatus;
};

export function getSubscriptionIntegrationAttention(
  connections: readonly IntegrationConnection[] | undefined,
  subscriptions: readonly IntegrationSubscription[] | undefined
) {
  const providersNeedingAttention = new Set<IntegrationProvider>();
  const connectionStatusByProvider = new Map<IntegrationProvider, ConnectionStatus>();

  for (const connection of connections ?? []) {
    connectionStatusByProvider.set(connection.provider, connection.status);

    if (isReconnectRequired(connection.status)) {
      providersNeedingAttention.add(connection.provider);
    }
  }

  for (const subscription of subscriptions ?? []) {
    if (subscription.status !== 'DISCONNECTED') {
      continue;
    }

    if (connectionStatusByProvider.get(subscription.provider) === 'ACTIVE') {
      continue;
    }

    providersNeedingAttention.add(subscription.provider);
  }

  return {
    attentionCount: providersNeedingAttention.size,
    hasAttention: providersNeedingAttention.size > 0,
    providers: Array.from(providersNeedingAttention),
  };
}
