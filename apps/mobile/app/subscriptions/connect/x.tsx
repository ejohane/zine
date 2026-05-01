import { useCallback } from 'react';
import { useRouter } from 'expo-router';

import { OAuthErrorBoundary } from '@/components/oauth-error-boundary';

import { IntegrationConnectScreen } from './_shared';

export default function XConnectScreen() {
  const router = useRouter();

  const handleRetry = useCallback(() => {
    router.replace('/subscriptions/connect/x' as never);
  }, [router]);

  return (
    <OAuthErrorBoundary provider="X" onRetry={handleRetry}>
      <IntegrationConnectScreen
        provider="X"
        subtitle="Connect X to import bookmarked posts into your Zine library with a strict daily sync cap."
        allowList={[
          {
            title: 'Bookmarked posts',
            description: 'Import the latest bookmarked posts from your X account.',
          },
          {
            title: 'Post and author metadata',
            description: 'Read post text, author names, avatars, and basic media previews.',
          },
          {
            title: 'Limited refreshes',
            description: 'Sync is capped to the latest 100 bookmarks and at most once daily.',
          },
        ]}
        restrictedList={[
          {
            title: 'No posting or following',
            description: 'Zine cannot post, reply, repost, follow, or unfollow accounts.',
          },
          {
            title: 'No bookmark edits',
            description: 'Zine does not add, remove, or organize bookmarks in your X account.',
          },
        ]}
        ctaLabel="Connect X"
      />
    </OAuthErrorBoundary>
  );
}
