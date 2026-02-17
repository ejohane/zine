import { Platform, DynamicColorIOS } from 'react-native';
import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { AuthGuard } from '@/components/auth-guard';

// =============================================================================
// Tab Layout - iOS 26 Native Tabs with Liquid Glass
// =============================================================================

export default function TabLayout() {
  // Dynamic colors for iOS liquid glass that adapt to light/dark backgrounds
  const dynamicTintColor =
    Platform.OS === 'ios'
      ? DynamicColorIOS({
          dark: 'white',
          light: 'black',
        })
      : '#000000';

  const dynamicLabelColor =
    Platform.OS === 'ios'
      ? DynamicColorIOS({
          dark: 'white',
          light: 'black',
        })
      : '#000000';

  return (
    <AuthGuard>
      <NativeTabs
        // iOS 26 liquid glass minimize behavior - minimizes tab bar when scrolling down
        minimizeBehavior="onScrollDown"
        // Dynamic tint color for selected icons
        tintColor={dynamicTintColor}
        // Dynamic label styling
        labelStyle={{
          color: dynamicLabelColor,
        }}
      >
        <NativeTabs.Trigger name="index">
          <Label>Home</Label>
          <Icon sf={{ default: 'house', selected: 'house.fill' }} drawable="ic_home" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="inbox">
          <Label>Inbox</Label>
          <Icon sf={{ default: 'tray', selected: 'tray.fill' }} drawable="ic_inbox" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="search" role="search">
          <Label>Search</Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="library">
          <Label>Library</Label>
          <Icon
            sf={{ default: 'books.vertical', selected: 'books.vertical.fill' }}
            drawable="ic_library"
          />
        </NativeTabs.Trigger>

        {/* explore tab is hidden - not included in triggers */}
      </NativeTabs>
    </AuthGuard>
  );
}
