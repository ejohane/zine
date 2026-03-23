import { useCallback } from 'react';
import { useRouter } from 'expo-router';

import { OAuthErrorBoundary } from '@/components/oauth-error-boundary';

import { IntegrationConnectScreen } from './_shared';

export default function YouTubeConnectScreen() {
  const router = useRouter();

  const handleRetry = useCallback(() => {
    router.replace('/subscriptions/connect/youtube' as never);
  }, [router]);

  return (
    <OAuthErrorBoundary provider="YOUTUBE" onRetry={handleRetry}>
      <IntegrationConnectScreen
        provider="YOUTUBE"
        subtitle="Connect YouTube to import the channels you already follow and keep new videos flowing into your inbox."
        allowList={[
          {
            title: 'Your existing subscriptions',
            description:
              'Import channel subscriptions so you can choose what stays active in Zine.',
          },
          {
            title: 'Channel names and artwork',
            description: 'Show the right titles and avatars while you manage subscriptions.',
          },
          {
            title: 'New video updates',
            description: 'Sync newly published videos from the subscriptions you keep active.',
          },
        ]}
        restrictedList={[
          {
            title: 'No posting or commenting',
            description: 'Zine never publishes videos, comments, or interactions on your behalf.',
          },
          {
            title: 'No YouTube edits',
            description:
              'Zine does not change your YouTube subscriptions, playlists, or account settings.',
          },
        ]}
        ctaLabel="Connect YouTube"
      />
    </OAuthErrorBoundary>
  );
}
