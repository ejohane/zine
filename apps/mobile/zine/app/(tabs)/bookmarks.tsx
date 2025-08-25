import { ScrollView, View, Text, TouchableOpacity } from 'react-native';
import { Search } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

export default function BookmarksScreen() {
  const [bookmarks] = useState([
    {
      id: '1',
      title: 'How to Build Better Mobile Apps with React Native',
      description: 'A comprehensive guide to React Native best practices and performance optimization techniques.',
      url: 'https://example.com/react-native-guide',
      imageUrl: 'https://picsum.photos/200/200?random=1',
      source: 'Dev.to',
      sourcePlatform: 'default' as const,
      createdAt: new Date().toISOString(),
      tags: ['React Native', 'Mobile', 'Tutorial'],
      isBookmarked: true,
    },
    {
      id: '2',
      title: 'The Future of AI in Software Development',
      description: 'Exploring how artificial intelligence is transforming the way we write and maintain code.',
      url: 'https://example.com/ai-development',
      imageUrl: 'https://picsum.photos/200/200?random=2',
      source: 'Medium',
      sourcePlatform: 'default' as const,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      tags: ['AI', 'Future', 'Development'],
      isBookmarked: true,
    },
    {
      id: '3',
      title: 'Design Systems at Scale',
      description: 'Learn how top companies build and maintain design systems that work across thousands of products.',
      url: 'https://example.com/design-systems',
      imageUrl: 'https://picsum.photos/200/200?random=3',
      source: 'Spotify',
      sourcePlatform: 'spotify' as const,
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      tags: ['Design', 'Scale', 'Systems'],
      isBookmarked: true,
    },
  ]);

  const handleCardPress = (id: string) => {
    console.log('Open bookmark:', id);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1">
        <View className="flex-row items-center justify-between p-4">
          <Text className="text-2xl font-bold">Bookmarks</Text>
          <TouchableOpacity className="p-2">
            <Search size={24} color="#000" />
          </TouchableOpacity>
        </View>
        
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
          <View className="gap-3">
            {bookmarks.map((bookmark) => (
              <TouchableOpacity
                key={bookmark.id}
                className="bg-white rounded-lg p-4"
                onPress={() => handleCardPress(bookmark.id)}
              >
                <Text className="text-lg font-semibold mb-1">{bookmark.title}</Text>
                <Text className="text-gray-600 text-sm mb-2" numberOfLines={2}>
                  {bookmark.description}
                </Text>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-gray-500">{bookmark.source}</Text>
                  <View className="flex-row gap-1">
                    {bookmark.tags.slice(0, 2).map((tag, index) => (
                      <View key={index} className="bg-gray-100 px-2 py-1 rounded">
                        <Text className="text-xs text-gray-700">{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}