import { SafeAreaView } from "@/components/ui/safe-area-view";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { VStack } from "@/components/ui/vstack";
import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";

export default function Settings() {
  const { signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      console.log("Signing out...");
      await signOut();
      console.log("Sign out complete, redirecting to login");
      router.replace("/login");
    } catch (err) {
      console.error("Error signing out:", err);
    }
  };

  return (
    <SafeAreaView className="w-full h-full p-4">
      <VStack space="lg">
        <Text className="text-xl font-bold">Settings</Text>
        
        <Button
          className="bg-red-500"
          onPress={handleSignOut}
        >
          <Text className="text-white font-medium">Sign Out</Text>
        </Button>
      </VStack>
    </SafeAreaView>
  );
}
