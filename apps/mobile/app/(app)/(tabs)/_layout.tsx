import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";

const colors = {
  primary: "#3b82f6",
  primaryDark: "#2563eb",
  neutral50: "#fafafa",
  neutral200: "#e5e5e5",
  neutral400: "#a3a3a3",
  neutral900: "#171717",
};

export default function TabLayout() {
  return (
    <NativeTabs
    // tintColor={colors.primary}
    // backgroundColor={null}
    // blurEffect="systemMaterial"
    // labelStyle={{
    //   fontSize: 12,
    // }}
    >
      <NativeTabs.Trigger name="index">
        <Label>Home</Label>
        <Icon
          sf={{ default: "house", selected: "house.fill" }}
          drawable="ic_home"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search">
        <Label>Search</Label>
        <Icon
          sf={{
            default: "magnifyingglass",
            selected: "magnifyingglass.circle.fill",
          }}
          drawable="ic_search"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <Label>Settings</Label>
        <Icon
          sf={{ default: "gearshape", selected: "gearshape.fill" }}
          drawable="ic_settings"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
