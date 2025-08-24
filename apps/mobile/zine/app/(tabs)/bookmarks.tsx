import { ScrollView, YStack, H1, Paragraph, Card, XStack, Button } from 'tamagui';
import { Bookmark, Search } from '@tamagui/lucide-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function BookmarksScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <YStack f={1} backgroundColor="$background">
        <XStack padding="$4" alignItems="center" justifyContent="space-between">
          <H1 size="$8">Bookmarks</H1>
          <Button size="$3" circular icon={Search} chromeless />
        </XStack>
        
        <ScrollView flex={1} contentContainerStyle={{ padding: 16 }}>
          <YStack gap="$3">
            {[1, 2, 3].map((item) => (
              <Card key={item} elevate bordered animation="quick">
                <Card.Header padded>
                  <YStack gap="$2">
                    <Paragraph size="$5" fontWeight="600">
                      Bookmark {item}
                    </Paragraph>
                    <Paragraph size="$3" color="$color" opacity={0.7}>
                      This is a saved bookmark. You can manage your saved content here.
                    </Paragraph>
                    <XStack gap="$2" alignItems="center">
                      <Bookmark size={14} color="$primary" />
                      <Paragraph size="$2" color="$color" opacity={0.5}>
                        Saved yesterday
                      </Paragraph>
                    </XStack>
                  </YStack>
                </Card.Header>
              </Card>
            ))}
          </YStack>
        </ScrollView>
      </YStack>
    </SafeAreaView>
  );
}
