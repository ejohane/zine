import { View, Text, StyleSheet } from 'react-native';

import { useTheme } from '../../../contexts/theme';

export default function InboxScreen() {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.foreground }]}>Inbox</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Saved updates and feed activity will live here.</Text>
        <Text style={[styles.helper, { color: colors.mutedForeground }]}>Search now lives in the Search tab with faster bookmark results.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  helper: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
