// @ts-nocheck
import * as React from 'react';
import { View, ScrollView, Text } from 'react-native';
import { CompactBookmarkCard } from '../CompactBookmarkCard';
import type { Bookmark } from '@zine/shared';

// Sample bookmark data for testing
const sampleBookmarks: Bookmark[] = [
  {
    id: '1',
    userId: 'user1',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    originalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up - Rick Astley (Official Video)',
    description: 'The official video for Rick Astley\'s song',
    source: 'youtube',
    contentType: 'video',
    thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    status: 'active',
  },
  {
    id: '2',
    userId: 'user1',
    url: 'https://open.spotify.com/episode/123',
    originalUrl: 'https://open.spotify.com/episode/123',
    title: 'The Joe Rogan Experience #1234 - Interesting Guest with a Very Long Title That Should Be Truncated',
    description: 'Great podcast episode',
    source: 'spotify',
    contentType: 'podcast',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    status: 'active',
  },
  {
    id: '3',
    userId: 'user1',
    url: 'https://substack.com/article',
    originalUrl: 'https://substack.com/article',
    title: 'Understanding the Future of AI and Machine Learning',
    description: 'An in-depth article',
    source: 'substack',
    contentType: 'article',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    status: 'active',
  },
  {
    id: '4',
    userId: 'user1',
    url: 'https://twitter.com/elonmusk/status/123',
    originalUrl: 'https://twitter.com/elonmusk/status/123',
    title: 'Exciting news about the future of space exploration',
    source: 'twitter',
    contentType: 'post',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
    status: 'active',
  },
  {
    id: '5',
    userId: 'user1',
    url: 'https://example.com/blog/post',
    originalUrl: 'https://example.com/blog/post',
    title: 'Generic Web Link with Default Icon',
    source: 'web',
    contentType: 'link',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 1 month ago
    status: 'active',
  },
];

export function TestCompactCardComponent() {
  const [pressedCard, setPressedCard] = React.useState<string | null>(null);
  const [longPressedCard, setLongPressedCard] = React.useState<string | null>(null);
  
  return (
    <View className="flex-1 bg-gray-50">
      <View className="p-4">
        <Text className="text-xl font-bold mb-4">CompactBookmarkCard Test</Text>
        
        {/* Test interaction feedback */}
        {pressedCard && (
          <Text className="text-sm text-gray-600 mb-2">
            Pressed card: {pressedCard}
          </Text>
        )}
        {longPressedCard && (
          <Text className="text-sm text-gray-600 mb-2">
            Long pressed card: {longPressedCard}
          </Text>
        )}
      </View>
      
      {/* Horizontal scrolling list */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        {sampleBookmarks.map((bookmark) => (
          <CompactBookmarkCard
            key={bookmark.id}
            bookmark={bookmark}
            onPress={() => {
              setPressedCard(bookmark.title);
              console.log('Card pressed:', bookmark.title);
            }}
            onLongPress={() => {
              setLongPressedCard(bookmark.title);
              console.log('Card long pressed:', bookmark.title);
            }}
          />
        ))}
      </ScrollView>
      
      {/* Vertical list test */}
      <View className="p-4 mt-4">
        <Text className="text-lg font-semibold mb-2">Vertical Layout Test</Text>
        <ScrollView className="h-48">
          {sampleBookmarks.slice(0, 3).map((bookmark) => (
            <View key={bookmark.id} className="mb-3">
              <CompactBookmarkCard
                bookmark={bookmark}
                onPress={() => console.log('Vertical card pressed:', bookmark.title)}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}