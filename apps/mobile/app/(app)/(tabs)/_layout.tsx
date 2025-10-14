import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { useTheme } from '../../../contexts/theme';

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <NativeTabs tintColor={colors.primary}>
      <NativeTabs.Trigger name="index">
        <Label>Home</Label>
        <Icon
          sf={{ default: "house", selected: "house.fill" }}
          drawable="ic_home"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="inbox">
        <Label>Inbox</Label>
        <Icon
          sf={{
            default: "tray",
            selected: "tray.fill",
          }}
          drawable="ic_inbox"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <Label>Settings</Label>
        <Icon
          sf={{ default: "gearshape", selected: "gearshape.fill" }}
          drawable="ic_settings"
        />
      </NativeTabs.Trigger>

      {/* @ts-expect-error - role prop exists but types may not be updated */}
      <NativeTabs.Trigger name="search" role="search">
        <Label>Search</Label>
        <Icon
          sf={{
            default: "magnifyingglass",
            selected: "magnifyingglass.circle.fill",
          }}
          drawable="ic_search"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
