import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { QueueItem } from './QueueItem'

interface QueueItemData {
  id: string;
  title: string;
  creator?: string;
  source?: string;
  thumbnailUrl?: string;
  contentType: 'video' | 'podcast' | 'article';
  url: string;
}

interface QueueListProps {
  items?: QueueItemData[];
}

export function QueueList({ items = [] }: QueueListProps) {
  const handleItemPress = (item: QueueItemData) => {
    // TODO: Navigate to item or open URL
    console.log('Open queue item:', item.id);
  };

  const handleSeeAll = () => {
    // TODO: Navigate to queue page
    console.log('See all queue items');
  };

  // Mock data for demonstration
  const mockItems: QueueItemData[] = [
    {
      id: '1',
      title: 'System Design Interview Basics',
      creator: 'ByteByteGo',
      source: 'YouTube',
      thumbnailUrl: 'https://picsum.photos/64/64?random=4',
      contentType: 'video',
      url: 'https://youtube.com',
    },
    {
      id: '2',
      title: 'How I Built a $100M Company',
      creator: 'My First Million',
      source: 'Spotify',
      thumbnailUrl: 'https://picsum.photos/64/64?random=5',
      contentType: 'podcast',
      url: 'https://spotify.com',
    },
    {
      id: '3',
      title: 'The Future of JavaScript',
      creator: 'Kent C. Dodds',
      source: 'Dev.to',
      thumbnailUrl: 'https://picsum.photos/64/64?random=6',
      contentType: 'article',
      url: 'https://dev.to',
    },
    {
      id: '4',
      title: 'React Server Components Explained',
      creator: 'Theo - t3.gg',
      source: 'YouTube',
      thumbnailUrl: 'https://picsum.photos/64/64?random=7',
      contentType: 'video',
      url: 'https://youtube.com',
    },
  ];

  const displayItems = items.length > 0 ? items : mockItems;

  if (displayItems.length === 0) {
    return null;
  }

  return (
    <View>
      <View className="flex-row justify-between items-center px-4 mb-3">
        <Text className="text-xl font-bold text-black">
          Queue
        </Text>
        <Pressable onPress={handleSeeAll}>
          <Text className="text-base text-gray-500 font-medium">
            See all →
          </Text>
        </Pressable>
      </View>
      
      <View className="px-4 gap-2">
        {displayItems.map((item) => (
          <QueueItem
            key={item.id}
            title={item.title}
            creator={item.creator}
            source={item.source}
            thumbnailUrl={item.thumbnailUrl}
            contentType={item.contentType}
            onPress={() => handleItemPress(item)}
          />
        ))}
      </View>
    </View>
  );
}