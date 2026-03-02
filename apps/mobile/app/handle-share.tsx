import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { type ResolvedSharePayload, type SharePayload, useIncomingShare } from 'expo-sharing';

const isHttpUrl = (value: string | null | undefined): value is string => {
  if (!value || value.trim().length === 0) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const getUrlFromResolvedPayload = (payload: ResolvedSharePayload): string => {
  if (payload.contentType === 'website' && isHttpUrl(payload.contentUri)) {
    return payload.contentUri;
  }
  if (payload.shareType === 'url' && isHttpUrl(payload.value)) {
    return payload.value;
  }
  if (payload.shareType === 'text' && isHttpUrl(payload.value)) {
    return payload.value;
  }
  return '';
};

const getUrlFromSharedPayload = (payload: SharePayload): string => {
  if (payload.shareType === 'url' && isHttpUrl(payload.value)) {
    return payload.value;
  }
  if (payload.shareType === 'text' && isHttpUrl(payload.value)) {
    return payload.value;
  }
  return '';
};

const findSharedUrl = (
  resolvedSharedPayloads: ResolvedSharePayload[],
  sharedPayloads: SharePayload[]
): string => {
  for (const payload of resolvedSharedPayloads) {
    const resolvedUrl = getUrlFromResolvedPayload(payload);
    if (resolvedUrl) return resolvedUrl;
  }

  for (const payload of sharedPayloads) {
    const rawUrl = getUrlFromSharedPayload(payload);
    if (rawUrl) return rawUrl;
  }

  return '';
};

export default function HandleShareScreen() {
  const router = useRouter();
  const hasCompletedRef = useRef(false);
  const { sharedPayloads, resolvedSharedPayloads, isResolving, error, clearSharedPayloads } =
    useIncomingShare();

  const sharedUrl = useMemo(
    () => findSharedUrl(resolvedSharedPayloads, sharedPayloads),
    [resolvedSharedPayloads, sharedPayloads]
  );

  const finish = useCallback(
    (url: string) => {
      if (hasCompletedRef.current) return;
      hasCompletedRef.current = true;

      clearSharedPayloads();

      if (url) {
        router.replace({
          pathname: '/add-link',
          params: { url: encodeURIComponent(url) },
        });
        return;
      }

      router.replace('/add-link');
    },
    [clearSharedPayloads, router]
  );

  useEffect(() => {
    if (hasCompletedRef.current) return;

    if (sharedUrl) {
      finish(sharedUrl);
      return;
    }

    if (isResolving) return;

    if (error) {
      finish('');
      return;
    }

    finish('');
  }, [error, finish, isResolving, sharedUrl]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <ActivityIndicator size="large" />
      <Text style={styles.label}>Importing shared link...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  label: {
    fontSize: 14,
    color: '#64748B',
  },
});
