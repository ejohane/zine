import { Stack } from 'expo-router';

import {
  createNativeLargeTitleScreenOptions,
  nativeLargeTitleStackScreenOptions,
} from '@/lib/native-large-title-header';

export default function InboxLayout() {
  return (
    <Stack screenOptions={nativeLargeTitleStackScreenOptions}>
      <Stack.Screen
        name="index"
        options={createNativeLargeTitleScreenOptions({ title: 'Inbox' })}
      />
    </Stack>
  );
}
