import { useCallback } from 'react';
import { useRouter } from 'expo-router';

import { OAuthErrorBoundary } from '@/components/oauth-error-boundary';

import { IntegrationConnectScreen } from './_shared';

export default function SpotifyConnectScreen() {
  const router = useRouter();

  const handleRetry = useCallback(() => {
    router.replace('/subscriptions/connect/spotify' as never);
  }, [router]);

  return (
    <OAuthErrorBoundary provider="SPOTIFY" onRetry={handleRetry}>
      <IntegrationConnectScreen
        provider="SPOTIFY"
        subtitle="Connect Spotify to import the shows you already follow and keep new podcast episodes flowing into your inbox."
        allowList={[
          {
            title: 'Shows and podcasts you follow',
            description: 'Import the subscriptions you already keep in Spotify.',
          },
          {
            title: 'Podcast metadata',
            description:
              'Read show titles, descriptions, and artwork for clean subscription management.',
          },
          {
            title: 'Episode updates',
            description:
              'Sync new podcast episodes from the subscriptions you keep active in Zine.',
          },
        ]}
        restrictedList={[
          {
            title: 'No playback control',
            description: 'Zine cannot play audio, queue tracks, or control your Spotify app.',
          },
          {
            title: 'No library changes',
            description: 'Zine never edits your Spotify follows, saves, or account settings.',
          },
        ]}
        ctaLabel="Connect Spotify"
      />
    </OAuthErrorBoundary>
  );
}
