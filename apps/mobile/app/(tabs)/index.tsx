import { View, Text, ScrollView } from 'react-native';
import { Button } from 'heroui-native';

export default function HomeScreen() {
  return (
    <ScrollView className="flex-1 bg-white dark:bg-slate-900">
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
          Welcome to Zine
        </Text>
        <Text className="text-slate-600 dark:text-slate-400 text-center mb-8">
          Your personal content feed. Re-entry and discovery starts here.
        </Text>
        <View className="bg-red-500 p-4 rounded-lg mb-4">
          <Text className="text-white font-semibold">
            Uniwind Test: This should be red
          </Text>
        </View>
        <Button.Root variant="primary" size="lg">
          <Button.Label>Get Started</Button.Label>
        </Button.Root>
      </View>
    </ScrollView>
  );
}
