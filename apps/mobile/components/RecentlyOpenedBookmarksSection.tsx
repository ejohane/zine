import * as React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useRecentlyOpenedBookmarks } from '../hooks/useRecentlyOpenedBookmarks';
import { RecentlyOpenedBookmarkCard } from './RecentlyOpenedBookmarkCard';
import { useTheme } from '../contexts/theme';

const { width: screenWidth } = Dimensions.get('window');

export const RecentlyOpenedBookmarksSection = React.memo(() => {
  const { data: recentBookmarks = [], isLoading } = useRecentlyOpenedBookmarks();
  const { colors } = useTheme();
  
  if (isLoading || recentBookmarks.length < 4) {
    return null;
  }
  
  const gridItemWidth = (screenWidth - 16 * 2 - 12) / 2;
  
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.foreground }]}>Recently Opened</Text>
      
      <View style={styles.grid}>
        {recentBookmarks.map((bookmark) => (
          <View key={bookmark.id} style={[styles.gridItem, { width: gridItemWidth }]}>
            <RecentlyOpenedBookmarkCard bookmark={bookmark} />
          </View>
        ))}
      </View>
    </View>
  );
});

RecentlyOpenedBookmarksSection.displayName = 'RecentlyOpenedBookmarksSection';

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridItem: {
    height: 80,
  },
});
