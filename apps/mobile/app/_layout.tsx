import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { HeroUINativeProvider, ToastProvider } from 'heroui-native';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider } from '@/providers/auth-provider';
import { TRPCProvider } from '@/providers/trpc-provider';
import { useBaselinePrefetchOnFocus } from '@/hooks/use-prefetch';
import '../global.css';

export const unstable_settings = {
  anchor: '(tabs)',
};

function PrefetchManager() {
  useBaselinePrefetchOnFocus();
  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isStorybookEnabled = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true';

  return (
    <GestureHandlerRootView style={styles.root}>
      <AuthProvider>
        <TRPCProvider>
          <PrefetchManager />
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <HeroUINativeProvider>
              <ToastProvider defaultProps={{ placement: 'bottom' }} maxVisibleToasts={3}>
                <Stack>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  {isStorybookEnabled && (
                    <Stack.Screen name="storybook" options={{ headerShown: false }} />
                  )}
                  <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                  <Stack.Screen name="settings" options={{ headerShown: false }} />
                  <Stack.Screen
                    name="subscriptions"
                    options={{
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                  <Stack.Screen
                    name="item/[id]"
                    options={{ headerShown: true, headerBackTitle: '' }}
                  />
                  <Stack.Screen
                    name="add-link"
                    options={{
                      presentation: 'modal',
                      headerShown: true,
                      title: 'Add Link',
                    }}
                  />
                  <Stack.Screen
                    name="item-tags/[id]"
                    options={{
                      presentation: 'modal',
                      headerShown: true,
                      title: 'Tags',
                    }}
                  />
                </Stack>
                <StatusBar style="auto" />
              </ToastProvider>
            </HeroUINativeProvider>
          </ThemeProvider>
        </TRPCProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
