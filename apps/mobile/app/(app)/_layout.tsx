import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../contexts/auth';
import { View, ActivityIndicator } from 'react-native';

export default function AppLayout() {
  const { isSignedIn, isLoading } = useAuth();

  if (isLoading) {
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

  return <Stack screenOptions={{ headerShown: false }} />;
}