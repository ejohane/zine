import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/theme';

export type CategoryType = 'all' | 'videos' | 'podcasts' | 'articles' | 'posts';

interface CategoryTabsProps {
  selectedCategory: CategoryType;
  onCategoryChange: (category: CategoryType) => void;
}

const categories: { key: CategoryType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'videos', label: 'Videos' },
  { key: 'podcasts', label: 'Podcasts' },
  { key: 'articles', label: 'Articles' },
  { key: 'posts', label: 'Posts' },
];

export function CategoryTabs({ selectedCategory, onCategoryChange }: CategoryTabsProps) {
  const { colors } = useTheme();
  
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {categories.map((category) => (
          <TouchableOpacity
            key={category.key}
            style={[
              styles.tab,
              { backgroundColor: colors.secondary },
              selectedCategory === category.key && [styles.tabActive, { backgroundColor: colors.primary }],
            ]}
            onPress={() => onCategoryChange(category.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabText,
                { color: colors.mutedForeground },
                selectedCategory === category.key && [styles.tabTextActive, { color: colors.primaryForeground }],
              ]}
            >
              {category.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    paddingBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f4f4f5',
    marginRight: 8,
  },
  tabActive: {
    backgroundColor: '#f97316',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#525252',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
});