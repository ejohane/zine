import { useCallback } from 'react';
import { useRouter } from 'expo-router';

import { OAuthErrorBoundary } from '@/components/oauth-error-boundary';

import { IntegrationConnectScreen } from './_shared';

export default function GmailConnectScreen() {
  const router = useRouter();

  const handleRetry = useCallback(() => {
    router.replace('/subscriptions/connect/gmail' as never);
  }, [router]);

  return (
    <OAuthErrorBoundary provider="GMAIL" onRetry={handleRetry}>
      <IntegrationConnectScreen
        provider="GMAIL"
        subtitle="Connect Gmail to detect newsletters from your inbox and decide which subscriptions should stay active in Zine."
        allowList={[
          {
            title: 'Newsletter metadata',
            description:
              'Read sender, subject, and list headers used to identify newsletter subscriptions.',
          },
          {
            title: 'Recent newsletter messages',
            description: 'Detect new issues so active subscriptions can appear in your inbox.',
          },
          {
            title: 'Sender details',
            description:
              'Show recognizable names and sources while you manage newsletter subscriptions.',
          },
        ]}
        restrictedList={[
          {
            title: 'No email sending',
            description: 'Zine cannot send mail from your account.',
          },
          {
            title: 'No inbox edits',
            description: 'Zine does not archive, delete, or modify your Gmail messages.',
          },
        ]}
        ctaLabel="Connect Gmail"
      />
    </OAuthErrorBoundary>
  );
}
