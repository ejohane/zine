import { ScrollView, YStack, H1, Paragraph, Card, XStack, Button, Avatar, Label } from 'tamagui';
import { Settings, LogOut, BookOpen, Clock, Star, Moon, Sun, Smartphone } from '@tamagui/lucide-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Alert } from 'react-native';

export default function ProfileScreen() {
  const { isSignedIn, userEmail, userFullName, userImageUrl, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut }
      ]
    );
  };

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
  };

  if (!isSignedIn) {
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <YStack f={1} backgroundColor="$background" alignItems="center" justifyContent="center" padding="$4">
          <H1 size="$8" marginBottom="$4">Profile</H1>
          <Paragraph size="$5" textAlign="center" opacity={0.7}>
            Please sign in to view your profile
          </Paragraph>
        </YStack>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <YStack f={1} backgroundColor="$background">
        <XStack padding="$4" alignItems="center" justifyContent="space-between">
          <H1 size="$8">Profile</H1>
          <Button size="$3" circular icon={Settings} chromeless />
        </XStack>
        
        <ScrollView flex={1} contentContainerStyle={{ padding: 16 }}>
          <YStack gap="$4">
            <Card elevate bordered>
              <Card.Header padded>
                <XStack gap="$3" alignItems="center">
                  <Avatar circular size="$6">
                    {userImageUrl ? (
                      <Avatar.Image source={{ uri: userImageUrl }} />
                    ) : null}
                    <Avatar.Fallback backgroundColor="$primary">
                      <Paragraph size="$7" color="white">
                        {userFullName?.charAt(0) || userEmail?.charAt(0) || 'U'}
                      </Paragraph>
                    </Avatar.Fallback>
                  </Avatar>
                  <YStack f={1} gap="$1">
                    <Paragraph size="$5" fontWeight="600">
                      {userFullName || 'User'}
                    </Paragraph>
                    <Paragraph size="$3" color="$color" opacity={0.7}>
                      {userEmail || 'No email'}
                    </Paragraph>
                  </YStack>
                </XStack>
              </Card.Header>
            </Card>

            <YStack gap="$3">
              <Paragraph size="$5" fontWeight="600">Statistics</Paragraph>
              <XStack gap="$2">
                <Card f={1} padding="$3" bordered>
                  <YStack alignItems="center" gap="$1">
                    <BookOpen size={20} color="$primary" />
                    <Paragraph size="$6" fontWeight="600">42</Paragraph>
                    <Paragraph size="$2" color="$color" opacity={0.7}>Bookmarks</Paragraph>
                  </YStack>
                </Card>
                <Card f={1} padding="$3" bordered>
                  <YStack alignItems="center" gap="$1">
                    <Clock size={20} color="$primary" />
                    <Paragraph size="$6" fontWeight="600">128</Paragraph>
                    <Paragraph size="$2" color="$color" opacity={0.7}>Read</Paragraph>
                  </YStack>
                </Card>
                <Card f={1} padding="$3" bordered>
                  <YStack alignItems="center" gap="$1">
                    <Star size={20} color="$primary" />
                    <Paragraph size="$6" fontWeight="600">15</Paragraph>
                    <Paragraph size="$2" color="$color" opacity={0.7}>Subscriptions</Paragraph>
                  </YStack>
                </Card>
              </XStack>
            </YStack>

            <YStack gap="$3">
              <Paragraph size="$5" fontWeight="600">Appearance</Paragraph>
              <Card bordered>
                <Card.Header padded>
                  <YStack gap="$3">
                    <Label htmlFor="theme-switch">Theme</Label>
                    <XStack gap="$2">
                      <Button
                        size="$3"
                        variant={theme === 'light' ? undefined : 'outlined'}
                        onPress={() => handleThemeChange('light')}
                        icon={Sun}
                      >
                        Light
                      </Button>
                      <Button
                        size="$3"
                        variant={theme === 'dark' ? undefined : 'outlined'}
                        onPress={() => handleThemeChange('dark')}
                        icon={Moon}
                      >
                        Dark
                      </Button>
                      <Button
                        size="$3"
                        variant={theme === 'system' ? undefined : 'outlined'}
                        onPress={() => handleThemeChange('system')}
                        icon={Smartphone}
                      >
                        System
                      </Button>
                    </XStack>
                  </YStack>
                </Card.Header>
              </Card>
            </YStack>

            <YStack gap="$3">
              <Paragraph size="$5" fontWeight="600">Account</Paragraph>
              <Card bordered animation="quick">
                <Card.Header padded>
                  <Button chromeless justifyContent="flex-start" icon={Settings}>
                    Settings
                  </Button>
                </Card.Header>
              </Card>
              <Card bordered animation="quick">
                <Card.Header padded>
                  <Button 
                    chromeless 
                    justifyContent="flex-start" 
                    icon={LogOut} 
                    color="$error"
                    onPress={handleSignOut}
                  >
                    Sign Out
                  </Button>
                </Card.Header>
              </Card>
            </YStack>
          </YStack>
        </ScrollView>
      </YStack>
    </SafeAreaView>
  );
}