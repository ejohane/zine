import { Stack } from 'expo-router';

import {
  createNativeLargeTitleScreenOptions,
  nativeLargeTitleStackScreenOptions,
} from '@/lib/native-large-title-header';

export default function LibraryLayout() {
  return (
    <Stack screenOptions={nativeLargeTitleStackScreenOptions}>
      <Stack.Screen
        name="index"
        options={createNativeLargeTitleScreenOptions({ title: 'Library' })}
      />
    </Stack>
  );
}
