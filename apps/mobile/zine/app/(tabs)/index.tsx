import { ScrollView, YStack, H1, Paragraph, Card, XStack, Button, Spinner } from 'tamagui';
import { RefreshCw, Filter, Bookmark, Share2 } from '@tamagui/lucide-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RefreshControl } from 'react-native';
import { useState } from 'react';
import { useFeed, useRefreshFeed } from '@/hooks/useFeed';
import { useAuth } from '@/hooks/useAuth';

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
            <Button size="$3" circular icon={Filter} chromeless />
            <Button 
              size="$3" 
              circular 
              icon={RefreshCw} 
              chromeless 
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
            <Button marginTop="$3" onPress={handleRefresh}>
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
                  <Card key={item.id} elevate bordered animation="quick">
                    <Card.Header padded>
                      <YStack gap="$2">
                        <Paragraph size="$5" fontWeight="600">
                          {item.title}
                        </Paragraph>
                        <Paragraph size="$3" color="$color" opacity={0.7} numberOfLines={2}>
                          {item.description || 'No description available'}
                        </Paragraph>
                        <XStack gap="$2" justifyContent="space-between" alignItems="center">
                          <Paragraph size="$2" color="$color" opacity={0.5}>
                            {item.source} • {new Date(item.publishedAt).toLocaleDateString()}
                          </Paragraph>
                          <XStack gap="$2">
                            <Button size="$2" icon={Bookmark} chromeless />
                            <Button size="$2" icon={Share2} chromeless />
                          </XStack>
                        </XStack>
                      </YStack>
                    </Card.Header>
                  </Card>
                ))
              ) : (
                // Fallback to placeholder data when API not connected
                [1, 2, 3, 4, 5].map((item) => (
                  <Card key={item} elevate bordered animation="quick">
                    <Card.Header padded>
                      <YStack gap="$2">
                        <Paragraph size="$5" fontWeight="600">
                          Feed Item {item}
                        </Paragraph>
                        <Paragraph size="$3" color="$color" opacity={0.7}>
                          This is a placeholder for a feed item. Connect to the API to see real content.
                        </Paragraph>
                        <XStack gap="$2" justifyContent="space-between" alignItems="center">
                          <Paragraph size="$2" color="$color" opacity={0.5}>
                            Source • 2 hours ago
                          </Paragraph>
                          <XStack gap="$2">
                            <Button size="$2" icon={Bookmark} chromeless />
                            <Button size="$2" icon={Share2} chromeless />
                          </XStack>
                        </XStack>
                      </YStack>
                    </Card.Header>
                  </Card>
                ))
              )}
            </YStack>
          </ScrollView>
        )}
      </YStack>
    </SafeAreaView>
  );
}
