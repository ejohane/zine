import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

import { Colors } from '@/constants/theme';

export const nativeLargeTitleStackScreenOptions: NativeStackNavigationOptions = {
  headerBackButtonDisplayMode: 'minimal',
  headerLargeTitleShadowVisible: false,
};

export const nativeLargeTitleHeaderAppearance: NativeStackNavigationOptions = {
  headerTintColor: Colors.dark.text,
  headerStyle: {
    backgroundColor: Colors.dark.background,
  },
  headerLargeStyle: {
    backgroundColor: 'transparent',
  },
  headerTitleStyle: {
    color: Colors.dark.text,
  },
  headerLargeTitleStyle: {
    color: Colors.dark.text,
  },
};

export function createNativeLargeTitleScreenOptions(
  options: NativeStackNavigationOptions = {}
): NativeStackNavigationOptions {
  return {
    ...nativeLargeTitleHeaderAppearance,
    headerLargeTitle: true,
    ...options,
  };
}
