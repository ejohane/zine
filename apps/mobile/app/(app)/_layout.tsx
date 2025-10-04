import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../contexts/auth';
import { View, ActivityIndicator } from 'react-native';

export default function AppLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  // Redirect to auth if not signed in
  if (!isSignedIn) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="add-bookmark"
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="bookmark/[id]"
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: false,
        }}
      />
      <Stack.Screen
        name="recent-bookmarks"
        options={{
          headerShown: true,
          headerBackButtonDisplayMode: 'minimal',
          headerTransparent: false,
        }}
      />
    </Stack>
  );
}