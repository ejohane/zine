import { Stack } from 'expo-router';

import { lightweightHeaderStackScreenOptions } from '@/lib/native-large-title-header';

export default function LibraryLayout() {
  return (
    <Stack screenOptions={lightweightHeaderStackScreenOptions}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
