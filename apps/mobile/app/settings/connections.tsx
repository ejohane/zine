import { useEffect } from 'react';
import { useRouter } from 'expo-router';

import { LoadingState } from '@/components/list-states';
import { Surface } from '@/components/primitives';

export default function IntegrationsRedirectScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/subscriptions');
  }, [router]);

  return (
    <Surface tone="canvas" style={{ flex: 1 }}>
      <LoadingState message="Integrations moved into Subscriptions…" />
    </Surface>
  );
}
