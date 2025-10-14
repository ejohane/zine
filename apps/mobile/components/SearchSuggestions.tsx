import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/theme';

interface SearchSuggestionsProps {
  onSelectQuery?: (query: string) => void;
  suggestions?: string[];
}

const DEFAULT_SUGGESTIONS = [
  'JavaScript tutorials',
  'React Native tips',
  'TypeScript best practices',
  'Web development',
  'Mobile development',
  'API design',
  'Database optimization',
  'CSS animations',
];

export function SearchSuggestions({ 
  onSelectQuery, 
  suggestions = DEFAULT_SUGGESTIONS 
}: SearchSuggestionsProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.secondary, borderBottomColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.mutedForeground }]}>Popular Searches</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.suggestionsList}
      >
        {suggestions.map((suggestion, index) => (
          <TouchableOpacity
            key={`${suggestion}-${index}`}
            style={[styles.suggestionItem, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelectQuery?.(suggestion);
            }}
          >
            <Text style={[styles.suggestionText, { color: colors.foreground }]}>💡 {suggestion}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  suggestionsList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  suggestionItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  suggestionText: {
    fontSize: 14,
  },
});
