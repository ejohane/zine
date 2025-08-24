import { ScrollView, YStack, H1, XStack } from 'tamagui';
import { Search } from '@tamagui/lucide-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookmarkCard } from '../../components/cards/BookmarkCard';
import { Button } from '../../components/ui/Button';
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

  const handleBookmark = (id: string) => {
    console.log('Toggle bookmark:', id);
  };

  const handleShare = (bookmark: any) => {
    console.log('Share bookmark:', bookmark);
  };

  const handleCardPress = (id: string) => {
    console.log('Open bookmark:', id);
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <YStack f={1} backgroundColor="$background">
        <XStack padding="$4" alignItems="center" justifyContent="space-between">
          <H1 size="$8">Bookmarks</H1>
          <Button 
            size="sm" 
            variant="ghost" 
            icon={Search}
          />
        </XStack>
        
        <ScrollView flex={1} contentContainerStyle={{ padding: 16 }}>
          <YStack gap="$3">
            {bookmarks.map((bookmark) => (
              <BookmarkCard
                key={bookmark.id}
                bookmark={bookmark}
                onPress={() => handleCardPress(bookmark.id)}
                onBookmark={handleBookmark}
                onShare={handleShare}
              />
            ))}
          </YStack>
        </ScrollView>
      </YStack>
    </SafeAreaView>
  );
}
