import { lightweightHeaderStackScreenOptions } from '@/lib/native-large-title-header';
import { Stack } from 'expo-router';

export default function SearchLayout() {
  return (
    <Stack screenOptions={lightweightHeaderStackScreenOptions}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
