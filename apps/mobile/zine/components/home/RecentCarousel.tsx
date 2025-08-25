import React from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { MediaCard } from './MediaCard'

interface RecentItem {
  id: string;
  title: string;
  creator?: string;
  thumbnailUrl?: string;
  contentType: 'video' | 'podcast' | 'article';
  duration?: string;
  url: string;
}

interface RecentCarouselProps {
  items?: RecentItem[];
}

export function RecentCarousel({ items = [] }: RecentCarouselProps) {
  const handleItemPress = (item: RecentItem) => {
    // TODO: Navigate to item or open URL
    console.log('Open item:', item.id);
  };

  const handleSeeAll = () => {
    // TODO: Navigate to bookmarks
    console.log('See all recent');
  };

  // Mock data for demonstration
  const mockItems: RecentItem[] = [
    {
      id: '1',
      title: 'Building Better React Components',
      creator: 'Jack Herrington',
      thumbnailUrl: 'https://picsum.photos/280/160?random=1',
      contentType: 'video',
      duration: '24:15',
      url: 'https://youtube.com',
    },
    {
      id: '2',
      title: 'The Tim Ferriss Show',
      creator: 'Tim Ferriss',
      thumbnailUrl: 'https://picsum.photos/280/160?random=2',
      contentType: 'podcast',
      duration: '1:32:45',
      url: 'https://spotify.com',
    },
    {
      id: '3',
      title: 'Understanding TypeScript Generics',
      creator: 'Dan Abramov',
      thumbnailUrl: 'https://picsum.photos/280/160?random=3',
      contentType: 'article',
      duration: '8 min',
      url: 'https://medium.com',
    },
  ];

  const displayItems = items.length > 0 ? items : mockItems;

  if (displayItems.length === 0) {
    return null;
  }

  return (
    <View className="mb-6">
      <View className="flex-row justify-between items-center px-4 mb-3">
        <Text className="text-xl font-bold text-black">
          Recent
        </Text>
        <Pressable onPress={handleSeeAll}>
          <Text className="text-base text-gray-500 font-medium">
            See all →
          </Text>
        </Pressable>
      </View>
      
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        <View className="flex-row gap-3">
          {displayItems.map((item) => (
            <MediaCard
              key={item.id}
              title={item.title}
              creator={item.creator}
              thumbnailUrl={item.thumbnailUrl}
              contentType={item.contentType}
              duration={item.duration}
              onPress={() => handleItemPress(item)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}