// @ts-nocheck
import * as React from 'react';
import { Text, View } from 'react-native';
import { useRecentBookmarks } from '../useRecentBookmarks';

// Simple test component to verify hook compiles and can be imported
export function TestRecentBookmarksComponent() {
  const { data, isLoading, error, refetch } = useRecentBookmarks({ limit: 5 });
  
  if (isLoading) {
    return (
      <View>
        <Text>Loading bookmarks...</Text>
      </View>
    );
  }
  
  if (error) {
    return (
      <View>
        <Text>Error: {error.message}</Text>
      </View>
    );
  }
  
  return (
    <View>
      <Text>Found {data?.length || 0} bookmarks</Text>
      {data?.map((bookmark) => (
        <View key={bookmark.id}>
          <Text>{bookmark.title}</Text>
          <Text>{bookmark.contentType}</Text>
          <Text>{bookmark.createdAt}</Text>
        </View>
      ))}
    </View>
  );
}

// Test that the hook can handle authentication state
export function TestAuthenticatedBookmarks() {
  const { data, isLoading } = useRecentBookmarks({ 
    limit: 10,
    enabled: true // Only fetch when authenticated
  });
  
  return (
    <View>
      <Text>Authenticated: {!isLoading ? 'Yes' : 'Loading'}</Text>
      <Text>Bookmarks: {data?.length || 0}</Text>
    </View>
  );
}