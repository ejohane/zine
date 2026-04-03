import { Stack } from 'expo-router';

import {
  createNativeLargeTitleScreenOptions,
  nativeLargeTitleStackScreenOptions,
} from '@/lib/native-large-title-header';

export default function HomeLayout() {
  return (
    <Stack screenOptions={nativeLargeTitleStackScreenOptions}>
      <Stack.Screen name="index" options={createNativeLargeTitleScreenOptions({ title: 'Home' })} />
    </Stack>
  );
}
