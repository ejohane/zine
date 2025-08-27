import { View, ScrollView, SafeAreaView } from 'react-native';
import {
  ThemeProvider,
  ThemeSwitcher,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Input,
  Text,
  MediaCard,
  QueueItem,
  ActionCard,
} from '@zine/design-system';
import { Settings, Plus, Search } from 'lucide-react-native';

export default function TestThemeScreen() {
  return (
    <ThemeProvider defaultTheme="system">
      <SafeAreaView className="flex-1 bg-white dark:bg-neutral-950">
        <ScrollView className="flex-1">
          <View className="p-4 space-y-6">
            {/* Theme Switcher */}
            <View className="mb-6">
              <Text className="text-2xl font-bold mb-4 text-neutral-900 dark:text-neutral-100">
                Theme Test
              </Text>
              <ThemeSwitcher />
            </View>

            {/* Buttons */}
            <View>
              <Text className="text-lg font-semibold mb-3 text-neutral-900 dark:text-neutral-100">
                Buttons
              </Text>
              <View className="flex-row gap-2 flex-wrap">
                <Button variant="default">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
              </View>
            </View>

            {/* Cards */}
            <View>
              <Text className="text-lg font-semibold mb-3 text-neutral-900 dark:text-neutral-100">
                Cards
              </Text>
              <Card variant="elevated" className="mb-3">
                <CardHeader>
                  <CardTitle>Elevated Card</CardTitle>
                  <CardDescription>This card uses elevation for depth</CardDescription>
                </CardHeader>
                <CardContent>
                  <Text>Card content with proper dark mode support</Text>
                </CardContent>
              </Card>
              <Card variant="outlined" className="mb-3">
                <CardHeader>
                  <CardTitle>Outlined Card</CardTitle>
                </CardHeader>
                <CardContent>
                  <Text>This card has a border</Text>
                </CardContent>
              </Card>
            </View>

            {/* Badges */}
            <View>
              <Text className="text-lg font-semibold mb-3 text-neutral-900 dark:text-neutral-100">
                Badges
              </Text>
              <View className="flex-row gap-2 flex-wrap">
                <Badge variant="default">Default</Badge>
                <Badge variant="primary">Primary</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="success">Success</Badge>
                <Badge variant="warning">Warning</Badge>
                <Badge variant="error">Error</Badge>
                <Badge variant="spotify">Spotify</Badge>
                <Badge variant="youtube">YouTube</Badge>
              </View>
            </View>

            {/* Input */}
            <View>
              <Text className="text-lg font-semibold mb-3 text-neutral-900 dark:text-neutral-100">
                Input
              </Text>
              <Input placeholder="Enter text here..." className="mb-2" />
              <Input placeholder="Disabled input" disabled />
            </View>

            {/* Pattern Components */}
            <View>
              <Text className="text-lg font-semibold mb-3 text-neutral-900 dark:text-neutral-100">
                Media Cards
              </Text>
              <MediaCard
                title="Building a Design System"
                creator="Sarah Chen"
                contentType="video"
                duration="12:34"
                className="mb-3"
              />
              <MediaCard
                title="The Future of AI"
                creator="Tech Talks"
                contentType="podcast"
                duration="45:00"
                className="mb-3"
              />
            </View>

            {/* Queue Items */}
            <View>
              <Text className="text-lg font-semibold mb-3 text-neutral-900 dark:text-neutral-100">
                Queue Items
              </Text>
              <QueueItem
                title="React Native Best Practices"
                creator="Mobile Dev Weekly"
                source="YouTube"
                contentType="video"
                className="mb-2"
              />
              <QueueItem
                title="Design Systems Explained"
                creator="UX Podcast"
                source="Spotify"
                contentType="podcast"
                className="mb-2"
              />
            </View>

            {/* Action Cards */}
            <View>
              <Text className="text-lg font-semibold mb-3 text-neutral-900 dark:text-neutral-100">
                Action Cards
              </Text>
              <View className="flex-row gap-2">
                <ActionCard
                  icon={<Plus size={24} className="text-primary-500" />}
                  label="Add Item"
                />
                <ActionCard
                  icon={<Search size={24} className="text-primary-500" />}
                  label="Search"
                />
                <ActionCard
                  icon={<Settings size={24} className="text-primary-500" />}
                  label="Settings"
                  disabled
                />
              </View>
            </View>

            {/* Color Palette */}
            <View>
              <Text className="text-lg font-semibold mb-3 text-neutral-900 dark:text-neutral-100">
                Color Palette
              </Text>
              <View className="flex-row gap-2 flex-wrap">
                <View className="w-16 h-16 bg-primary-500 rounded-lg" />
                <View className="w-16 h-16 bg-neutral-200 dark:bg-neutral-700 rounded-lg" />
                <View className="w-16 h-16 bg-success-500 rounded-lg" />
                <View className="w-16 h-16 bg-warning-500 rounded-lg" />
                <View className="w-16 h-16 bg-error-500 rounded-lg" />
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemeProvider>
  );
}