import { View, Text, ScrollView } from 'react-native';

export default function InboxScreen() {
  return (
    <ScrollView className="flex-1 bg-white dark:bg-slate-900">
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
          Inbox
        </Text>
        <Text className="text-slate-600 dark:text-slate-400 text-center">
          Your decision queue. Triage new content here.
        </Text>
      </View>
    </ScrollView>
  );
}
