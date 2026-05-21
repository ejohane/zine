import { Stack } from 'expo-router';

import { lightweightHeaderStackScreenOptions } from '@/lib/native-large-title-header';

export default function HomeLayout() {
  return (
    <Stack screenOptions={lightweightHeaderStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Home' }} />
      <Stack.Screen name="collection/[id]" options={{ title: 'Collection', headerBackTitle: '' }} />
      <Stack.Screen name="section/[section]" options={{ title: 'Section', headerBackTitle: '' }} />
    </Stack>
  );
}
