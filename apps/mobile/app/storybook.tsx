import { Redirect } from 'expo-router';

import StorybookUI from '../.rnstorybook';

const isStorybookEnabled = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true';

export default function StorybookScreen() {
  if (!isStorybookEnabled) {
    return <Redirect href="/(tabs)" />;
  }

  return <StorybookUI />;
}
