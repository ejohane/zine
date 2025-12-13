import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ScrollView className="flex-1 bg-white dark:bg-slate-900">
      <View className="flex-1 p-6">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
          Item Details
        </Text>
        <Text className="text-slate-600 dark:text-slate-400">
          Viewing item: {id}
        </Text>
      </View>
    </ScrollView>
  );
}
