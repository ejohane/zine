import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";

export default function TabLayout() {
  return (
    <NativeTabs
      tintColor="#ff6b35"
      backgroundColor={null}
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


