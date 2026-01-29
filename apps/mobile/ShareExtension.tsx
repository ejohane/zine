import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, close, openHostApp, type InitialProps } from 'expo-share-extension';

const FALLBACK_MESSAGE = 'No valid URL found in this share.';

const isValidUrl = (value: string) => {
  if (!value || value.trim().length === 0) return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export default function ShareExtension({ url, text }: InitialProps) {
  const sharedUrl = useMemo(() => {
    const candidate = url ?? text ?? '';
    const normalized = candidate.trim();
    return isValidUrl(normalized) ? normalized : '';
  }, [text, url]);

  const handleAdd = () => {
    if (!sharedUrl) return;
    openHostApp(`add-link?url=${encodeURIComponent(sharedUrl)}`);
    close();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Save to Zine</Text>
      {sharedUrl ? (
        <Text style={styles.url} numberOfLines={3}>
          {sharedUrl}
        </Text>
      ) : (
        <Text style={styles.message}>{FALLBACK_MESSAGE}</Text>
      )}
      <View style={styles.actions}>
        <Pressable
          onPress={handleAdd}
          disabled={!sharedUrl}
          style={({ pressed }) => [
            styles.button,
            styles.primaryButton,
            !sharedUrl && styles.buttonDisabled,
            pressed && sharedUrl && styles.buttonPressed,
          ]}
          accessibilityLabel="Add to Zine"
          accessibilityRole="button"
          accessibilityState={{ disabled: !sharedUrl }}
        >
          <Text style={styles.primaryButtonText}>Add to Zine</Text>
        </Pressable>
        <Pressable
          onPress={close}
          style={({ pressed }) => [
            styles.button,
            styles.secondaryButton,
            pressed && styles.secondaryButtonPressed,
          ]}
          accessibilityLabel="Cancel"
          accessibilityRole="button"
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 18,
    paddingVertical: 20,
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0F172A',
  },
  url: {
    fontSize: 14,
    lineHeight: 20,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
  },
  actions: {
    gap: 12,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#0F172A',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#E2E8F0',
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#CBD5F5',
  },
  buttonPressed: {
    opacity: 0.9,
  },
  secondaryButtonPressed: {
    opacity: 0.85,
  },
});
