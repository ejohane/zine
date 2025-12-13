import { View, Text } from 'react-native';
import { Link, Stack } from 'expo-router';
import { Button } from 'heroui-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View className="flex-1 items-center justify-center bg-white dark:bg-slate-900 p-6">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
          Page Not Found
        </Text>
        <Text className="text-slate-600 dark:text-slate-400 text-center mb-8">
          The page you're looking for doesn't exist.
        </Text>
        <Link href="/" asChild>
          <Button.Root variant="primary">
            <Button.Label>Go to Home</Button.Label>
          </Button.Root>
        </Link>
      </View>
    </>
  );
}
