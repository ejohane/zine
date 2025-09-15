// @ts-nocheck
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <FontAwesome name="search" size={20} color="#a3a3a3" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search bookmarks and feeds..."
            placeholderTextColor="#a3a3a3"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <FontAwesome name="times" size={20} color="#a3a3a3" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView style={styles.content}>
        {searchQuery.length === 0 ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Popular Searches</Text>
              <TouchableOpacity style={styles.searchSuggestion}>
                <Text style={styles.suggestionText}>React Native</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.searchSuggestion}>
                <Text style={styles.suggestionText}>Web Development</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.searchSuggestion}>
                <Text style={styles.suggestionText}>Design Systems</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Searches</Text>
              <TouchableOpacity style={styles.searchSuggestion}>
                <FontAwesome name="clock-o" size={16} color="#737373" style={styles.historyIcon} />
                <Text style={styles.suggestionText}>TypeScript tutorials</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.searchSuggestion}>
                <FontAwesome name="clock-o" size={16} color="#737373" style={styles.historyIcon} />
                <Text style={styles.suggestionText}>Cloudflare Workers</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Search Results</Text>
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>No results found</Text>
              <Text style={styles.resultDescription}>
                Try searching for something else or check your spelling
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#171717',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#262626',
    marginBottom: 12,
  },
  searchSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  historyIcon: {
    marginRight: 12,
  },
  suggestionText: {
    fontSize: 16,
    color: '#525252',
  },
  resultCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#171717',
    marginBottom: 4,
  },
  resultDescription: {
    fontSize: 14,
    color: '#737373',
  },
});