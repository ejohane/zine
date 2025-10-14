import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/theme';

interface SearchFiltersProps {
  activeType?: 'all' | 'bookmarks' | 'feeds' | 'content';
  activeContentType?: 'all' | 'video' | 'podcast' | 'article';
  onTypeChange?: (type: 'all' | 'bookmarks' | 'feeds' | 'content') => void;
  onContentTypeChange?: (contentType: 'all' | 'video' | 'podcast' | 'article') => void;
  onClearFilters?: () => void;
  showClearButton?: boolean;
}

export function SearchFilters({
  activeType = 'all',
  activeContentType = 'all',
  onTypeChange,
  onContentTypeChange,
  onClearFilters,
  showClearButton = false,
}: SearchFiltersProps) {
  const { colors } = useTheme();
  const types = [
    { id: 'all', label: 'All' },
    { id: 'bookmarks', label: 'Bookmarks' },
    { id: 'feeds', label: 'Feed Items' },
  ];

  const contentTypes = [
    { id: 'all', label: 'All Types' },
    { id: 'video', label: 'Videos' },
    { id: 'podcast', label: 'Podcasts' },
    { id: 'article', label: 'Articles' },
  ];

  const hasActiveFilters = activeType !== 'all' || activeContentType !== 'all';

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Filter by Source</Text>
        {showClearButton && hasActiveFilters && (
          <TouchableOpacity onPress={onClearFilters} style={styles.clearButton}>
            <Text style={[styles.clearButtonText, { color: colors.primary }]}>Clear All</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipContainer}
      >
        {types.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[
              styles.chip,
              { backgroundColor: colors.card, borderColor: colors.border },
              activeType === type.id && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onTypeChange?.(type.id as any);
            }}
          >
            <Text
              style={[
                styles.chipText,
                { color: colors.foreground },
                activeType === type.id && { color: colors.primaryForeground },
              ]}
            >
              {type.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Filter by Content Type</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipContainer}
      >
        {contentTypes.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[
              styles.chip,
              { backgroundColor: colors.card, borderColor: colors.border },
              activeContentType === type.id && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onContentTypeChange?.(type.id as any);
            }}
          >
            <Text
              style={[
                styles.chipText,
                { color: colors.foreground },
                activeContentType === type.id && { color: colors.primaryForeground },
              ]}
            >
              {type.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 0,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 0,
    marginBottom: 6,
  },
  clearButton: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipContainer: {
    paddingHorizontal: 0,
    paddingBottom: 6,
    gap: 6,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
