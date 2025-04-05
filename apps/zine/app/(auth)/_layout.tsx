import { useAuth } from "@clerk/clerk-expo";
import { Redirect, Stack } from "expo-router";

export default function AuthLayout() {
  // const { isLoaded, isSignedIn } = useAuth();
  //
  // if (!isLoaded) return null;
  //
  // if (isSignedIn) {
  //   return <Redirect href={"/"} />;
  // }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="index" options={{ title: "Authentication" }} />
    </Stack>
  );
}
