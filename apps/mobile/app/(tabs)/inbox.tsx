import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Inbox Tab Screen
 *
 * The decision queue for content triage.
 * Users review new items from their subscribed sources and decide to:
 * - Save to Library (bookmark)
 * - Dismiss (remove from inbox)
 * - Snooze (revisit later)
 *
 * Future components to integrate:
 * - InboxList: Virtualized list of inbox items
 * - InboxFilters: Filter by source type, date, status
 * - InboxItem: Individual item card with swipe actions
 * - EmptyState: When inbox is cleared
 */
export default function InboxScreen() {
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
            Inbox
          </Text>
          <Text className="text-slate-500 dark:text-slate-400 mt-1">
            Your decision queue
          </Text>
        </View>

        {/* Placeholder content - will be replaced with InboxList and InboxFilters */}
        <View className="flex-1 items-center justify-center p-6">
          <Text className="text-slate-600 dark:text-slate-400 text-center">
            New content from your sources will appear here for triage.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
