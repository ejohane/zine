import { ScrollView, YStack, H1, Paragraph, Card, XStack, Button, Input } from 'tamagui';
import { Search, Plus, Music, Youtube, Rss } from '@tamagui/lucide-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DiscoverScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <YStack f={1} backgroundColor="$background">
        <YStack padding="$4" gap="$3">
          <XStack alignItems="center" justifyContent="space-between">
            <H1 size="$8">Discover</H1>
            <Button size="$3" circular icon={Plus} chromeless />
          </XStack>
          <XStack gap="$2">
            <Input 
              flex={1} 
              placeholder="Search for podcasts, YouTube channels..." 
              size="$4"
            />
            <Button size="$4" icon={Search} />
          </XStack>
        </YStack>
        
        <ScrollView flex={1} contentContainerStyle={{ padding: 16 }}>
          <YStack gap="$4">
            <YStack gap="$2">
              <Paragraph size="$5" fontWeight="600">Platform Filters</Paragraph>
              <XStack gap="$2">
                <Button size="$3" icon={Music} variant="outlined">Spotify</Button>
                <Button size="$3" icon={Youtube} variant="outlined">YouTube</Button>
                <Button size="$3" icon={Rss} variant="outlined">RSS</Button>
              </XStack>
            </YStack>

            <YStack gap="$3">
              <Paragraph size="$5" fontWeight="600">Suggested Subscriptions</Paragraph>
              {['Tech Podcast', 'Design Channel', 'News Feed'].map((item, index) => (
                <Card key={index} elevate bordered animation="quick">
                  <Card.Header padded>
                    <XStack gap="$3" alignItems="center">
                      <YStack f={1} gap="$2">
                        <Paragraph size="$4" fontWeight="600">{item}</Paragraph>
                        <Paragraph size="$2" color="$color" opacity={0.7}>
                          Platform • 100k subscribers
                        </Paragraph>
                      </YStack>
                      <Button size="$3">Subscribe</Button>
                    </XStack>
                  </Card.Header>
                </Card>
              ))}
            </YStack>
          </YStack>
        </ScrollView>
      </YStack>
    </SafeAreaView>
  );
}