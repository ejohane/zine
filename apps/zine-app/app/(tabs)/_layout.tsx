import React from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Redirect, Tabs } from "expo-router";
import { useClientOnlyValue } from "@/components/useClientOnlyValue";
import { useAuth } from "@clerk/clerk-expo";

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={18} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  if (isLoaded && !isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Expo V4",
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
        }}
      />

      <Tabs.Screen
        name="queue-tab"
        options={{
          title: "Queue",
          tabBarIcon: ({ color }) => <TabBarIcon name="bars" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tab2"
        options={{
          title: "Tab 2",
          tabBarIcon: ({ color }) => <TabBarIcon name="star-o" color={color} />,
        }}
      />
    </Tabs>
  );
}

// // export {
// //   // Catch any errors thrown by the Layout component.
// //   ErrorBoundary,
// // } from "expo-router";
// //
// // export const unstable_settings = {
// //   // Ensure that reloading on `/modal` keeps a back button present.
// //   initialRouteName: "(tabs)",
// // };
// //
// // import { Stack } from "expo-router";
// //
// // export default function AppLayout() {
// //   return (
// //     <Stack>
// //       <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
// //     </Stack>
// //   );
// // }

// import { Redirect, Tabs } from "expo-router";
// import React from "react";
// import { Platform } from "react-native";

// // import { HapticTab } from "@/components/HapticTab";
// // import { IconSymbol } from "@/components/ui/IconSymbol";
// // import TabBarBackground from "@/components/ui/TabBarBackground";
// import { Colors } from "@/constants/Colors";
// import { useColorScheme } from "@/hooks/useColorScheme";
// import { useAuth } from "@clerk/clerk-expo";
// import { EditIcon, Icon } from "@/components/ui/icon/index.web";

// export default function TabLayout() {
//   const colorScheme = useColorScheme();

//   const { isSignedIn, isLoaded } = useAuth();

//   if (isLoaded && !isSignedIn) return <Redirect href="/(auth)/sign-in" />;

//   return (
//     <Tabs
//       screenOptions={{
//         tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
//         headerShown: false,
//         // tabBarButton: HapticTab,
//         // tabBarBackground: TabBarBackground,
//         tabBarStyle: Platform.select({
//           ios: {
//             // Use a transparent background on iOS to show the blur effect
//             position: "absolute",
//           },
//           default: {},
//         }),
//       }}
//     >
//       <Tabs.Screen
//         name="index"
//         options={{
//           title: "Home",
//           tabBarIcon: ({ color }) => (
//             // <IconSymbol size={28} name="house.fill" color={color} />
//             <Icon as={EditIcon} size="md" />
//           ),
//         }}
//       />
//       <Tabs.Screen
//         name="explore"
//         options={{
//           title: "Explore",
//           tabBarIcon: ({ color }) => (
//             <Icon as={EditIcon} size="md" />
//             // <IconSymbol size={28} name="paperplane.fill" color={color} />
//           ),
//         }}
//       />
//     </Tabs>
//   );
// }
