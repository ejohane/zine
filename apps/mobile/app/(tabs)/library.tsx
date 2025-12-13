import { View, Text, ScrollView } from 'react-native';

export default function LibraryScreen() {
  return (
    <ScrollView className="flex-1 bg-white dark:bg-slate-900">
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
          Library
        </Text>
        <Text className="text-slate-600 dark:text-slate-400 text-center">
          Your long-term bookmark storage. Saved content lives here.
        </Text>
      </View>
    </ScrollView>
  );
}
