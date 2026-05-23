import { Stack } from 'expo-router';

import { lightweightHeaderStackScreenOptions } from '@/lib/native-large-title-header';

export default function HomeLayout() {
  return (
    <Stack screenOptions={lightweightHeaderStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Home' }} />
    </Stack>
  );
}
