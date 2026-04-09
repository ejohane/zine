import { DarkTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import * as SystemUI from 'expo-system-ui';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { HeroUINativeProvider, ToastProvider } from 'heroui-native';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { Colors } from '@/constants/theme';
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

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.dark.tint,
    background: Colors.dark.background,
    card: Colors.dark.background,
    text: Colors.dark.text,
    border: Colors.dark.borderSubtle,
    notification: Colors.dark.tint,
  },
};

const rootStackScreenOptions = {
  contentStyle: {
    backgroundColor: Colors.dark.background,
  },
  headerStyle: {
    backgroundColor: Colors.dark.background,
  },
  headerTintColor: Colors.dark.text,
};

export default function RootLayout() {
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(Colors.dark.background);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <AuthProvider>
        <TRPCProvider>
          <PrefetchManager />
          <ThemeProvider value={navigationTheme}>
            <HeroUINativeProvider>
              <ToastProvider defaultProps={{ placement: 'bottom' }} maxVisibleToasts={3}>
                <Stack screenOptions={rootStackScreenOptions}>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
                    name="recap/weekly"
                    options={{ headerShown: true, title: 'Weekly Recap', headerBackTitle: '' }}
                  />
                  <Stack.Screen name="handle-share" options={{ headerShown: false }} />
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
                <StatusBar style="light" />
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
    backgroundColor: Colors.dark.background,
  },
});
