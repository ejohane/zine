import '../global.css';
import { Stack } from 'expo-router';

export default function RootLayout() {
  console.log('App starting...');
  console.log('CLERK KEY:', process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ? 'Found' : 'Missing');
  console.log('API URL:', process.env.EXPO_PUBLIC_API_URL || 'Missing');
  
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
