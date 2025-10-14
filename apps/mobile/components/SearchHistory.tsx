import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/theme';

const SEARCH_HISTORY_KEY = '@zine_search_history';
const MAX_HISTORY_ITEMS = 20;

interface SearchHistoryItem {
  query: string;
  timestamp: number;
}

interface SearchHistoryProps {
  onSelectQuery?: (query: string) => void;
  currentQuery?: string;
}

export function SearchHistory({ onSelectQuery, currentQuery }: SearchHistoryProps) {
  const { colors } = useTheme();
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const storedHistory = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
      if (storedHistory) {
        const parsed = JSON.parse(storedHistory);
        setHistory(parsed);
      }
    } catch (error) {
      console.error('Failed to load search history:', error);
    }
  };

  const addToHistory = async (query: string) => {
    if (!query || query.trim().length === 0) return;

    try {
      const newItem: SearchHistoryItem = {
        query: query.trim(),
        timestamp: Date.now(),
      };

      const existingIndex = history.findIndex(
        (item) => item.query.toLowerCase() === newItem.query.toLowerCase()
      );

      let updatedHistory: SearchHistoryItem[];
      
      if (existingIndex >= 0) {
        updatedHistory = [...history];
        updatedHistory.splice(existingIndex, 1);
        updatedHistory.unshift(newItem);
      } else {
        updatedHistory = [newItem, ...history].slice(0, MAX_HISTORY_ITEMS);
      }

      setHistory(updatedHistory);
      await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updatedHistory));
    } catch (error) {
      console.error('Failed to save search history:', error);
    }
  };

  const removeFromHistory = async (query: string) => {
    try {
      const updatedHistory = history.filter((item) => item.query !== query);
      setHistory(updatedHistory);
      await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(updatedHistory));
    } catch (error) {
      console.error('Failed to remove from search history:', error);
    }
  };

  const clearHistory = async () => {
    try {
      setHistory([]);
      await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
    } catch (error) {
      console.error('Failed to clear search history:', error);
    }
  };

  useEffect(() => {
    if (currentQuery && currentQuery.trim().length > 0) {
      const timer = setTimeout(() => {
        addToHistory(currentQuery);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [currentQuery]);

  if (history.length === 0) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.secondary, borderBottomColor: colors.border }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.mutedForeground }]}>Recent Searches</Text>
        <TouchableOpacity onPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          clearHistory();
        }}>
          <Text style={[styles.clearButton, { color: colors.destructive }]}>Clear All</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.historyList}
      >
        {history.map((item, index) => (
          <View key={`${item.query}-${index}`} style={styles.historyItemContainer}>
            <TouchableOpacity
              style={[styles.historyItem, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelectQuery?.(item.query);
              }}
            >
              <Text style={[styles.historyText, { color: colors.foreground }]}>🔍 {item.query}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.removeButton, { backgroundColor: colors.mutedForeground }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                removeFromHistory(item.query);
              }}
            >
              <Text style={[styles.removeButtonText, { color: colors.background }]}>×</Text>
            </TouchableOpacity>
          </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearButton: {
    fontSize: 14,
    fontWeight: '600',
  },
  historyList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  historyItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  historyItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyText: {
    fontSize: 14,
  },
  removeButton: {
    marginLeft: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 20,
  },
});
