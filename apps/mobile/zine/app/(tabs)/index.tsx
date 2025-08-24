import { ScrollView, YStack, H1, Paragraph, XStack, Spinner } from 'tamagui';
import { RefreshCw, Filter } from '@tamagui/lucide-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RefreshControl } from 'react-native';
import { useState } from 'react';
import { useFeed, useRefreshFeed } from '@/hooks/useFeed';
import { useAuth } from '@/hooks/useAuth';
import { FeedItemCard } from '@/components/cards/FeedItemCard';
import { Button } from '@/components/ui/Button';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { data: feedData, isLoading, error } = useFeed();
  const refreshFeed = useRefreshFeed();
  const { isSignedIn, userEmail } = useAuth();

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshFeed.mutateAsync();
    setRefreshing(false);
  };

  const handlePlay = (id: string) => {
    console.log('Play item:', id);
  };

  const handleBookmark = (id: string) => {
    console.log('Toggle bookmark:', id);
  };

  const handleMore = (id: string) => {
    console.log('More options for:', id);
  };

  const handleCardPress = (id: string) => {
    console.log('Open feed item:', id);
  };

  // Mock data for demonstration
  const mockFeedItems = [
    {
      id: '1',
      title: 'The Tim Ferriss Show: Derek Sivers on Developing Strong Philosophies',
      description: 'Derek Sivers shares his unconventional approach to life and business.',
      imageUrl: 'https://picsum.photos/200/200?random=4',
      source: 'Tim Ferriss',
      platform: 'spotify' as const,
      duration: '1:45:23',
      publishedAt: new Date().toISOString(),
      isPlayed: false,
      isBookmarked: false,
      episodeNumber: '655',
      contentType: 'podcast' as const,
    },
    {
      id: '2',
      title: 'How to Build a Second Brain',
      description: 'Tiago Forte explains his revolutionary method for organizing your digital life.',
      imageUrl: 'https://picsum.photos/200/200?random=5',
      source: 'Ali Abdaal',
      platform: 'youtube' as const,
      duration: '18:42',
      publishedAt: new Date(Date.now() - 3600000).toISOString(),
      isPlayed: true,
      isBookmarked: false,
      contentType: 'video' as const,
    },
    {
      id: '3',
      title: 'The State of JavaScript 2024',
      description: 'Annual survey results showing the latest trends in JavaScript frameworks.',
      imageUrl: 'https://picsum.photos/200/200?random=6',
      source: 'Dev.to',
      platform: 'default' as const,
      publishedAt: new Date(Date.now() - 7200000).toISOString(),
      isPlayed: false,
      isBookmarked: true,
      contentType: 'article' as const,
    },
  ];

  if (!isSignedIn) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <YStack f={1} backgroundColor="$background" alignItems="center" justifyContent="center" padding="$4">
          <H1 size="$8" marginBottom="$4">Welcome to Zine</H1>
          <Paragraph size="$5" textAlign="center" opacity={0.7}>
            Please sign in to view your personalized feed
          </Paragraph>
        </YStack>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <YStack f={1} backgroundColor="$background">
        <XStack padding="$4" alignItems="center" justifyContent="space-between">
          <YStack>
            <H1 size="$8">Feed</H1>
            {userEmail && (
              <Paragraph size="$2" opacity={0.5}>{userEmail}</Paragraph>
            )}
          </YStack>
          <XStack gap="$2">
            <Button size="sm" variant="ghost" icon={Filter} />
            <Button 
              size="sm" 
              variant="ghost"
              icon={RefreshCw} 
              onPress={handleRefresh}
              disabled={refreshing}
            />
          </XStack>
        </XStack>
        
        {isLoading ? (
          <YStack f={1} alignItems="center" justifyContent="center">
            <Spinner size="large" />
            <Paragraph marginTop="$3" opacity={0.7}>Loading feed...</Paragraph>
          </YStack>
        ) : error ? (
          <YStack f={1} alignItems="center" justifyContent="center" padding="$4">
            <Paragraph size="$5" color="$red10" textAlign="center">
              Failed to load feed
            </Paragraph>
            <Button variant="primary" marginTop="$3" onPress={handleRefresh}>
              Retry
            </Button>
          </YStack>
        ) : (
          <ScrollView 
            flex={1} 
            contentContainerStyle={{ padding: 16 }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
            }
          >
            <YStack gap="$3">
              {(feedData as any)?.items?.length > 0 ? (
                (feedData as any).items.map((item: any) => (
                  <FeedItemCard
                    key={item.id}
                    item={{
                      ...item,
                      platform: item.platform || 'default',
                      contentType: item.contentType || 'article',
                    }}
                    onPress={() => handleCardPress(item.id)}
                    onPlay={handlePlay}
                    onBookmark={handleBookmark}
                    onMore={handleMore}
                  />
                ))
              ) : (
                // Use mock data when API not connected
                mockFeedItems.map((item) => (
                  <FeedItemCard
                    key={item.id}
                    item={item}
                    onPress={() => handleCardPress(item.id)}
                    onPlay={handlePlay}
                    onBookmark={handleBookmark}
                    onMore={handleMore}
                  />
                ))
              )}
            </YStack>
          </ScrollView>
        )}
      </YStack>
    </SafeAreaView>
  );
}