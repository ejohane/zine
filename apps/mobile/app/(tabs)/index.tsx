import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Home Tab Screen
 *
 * The primary re-entry and discovery surface for Zine.
 * This screen will display:
 * - Recent activity from followed sources
 * - Discovery recommendations
 * - Quick access to recent bookmarks
 *
 * Layout: Ready for HomeSection components that group content by type/source.
 *
 * Future components to integrate:
 * - HomeSection: Grouped content display
 * - RecentBookmarks: Quick access to saved items
 * - DiscoveryCarousel: Content recommendations
 */
export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-slate-900" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="px-6 pt-4 pb-2">
          <Text className="text-3xl font-bold text-slate-900 dark:text-white">
            Home
          </Text>
        </View>

        {/* Placeholder content - will be replaced with HomeSection components */}
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Welcome to Zine
          </Text>
          <Text className="text-slate-600 dark:text-slate-400 text-center">
            Your personal content feed. Re-entry and discovery starts here.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
