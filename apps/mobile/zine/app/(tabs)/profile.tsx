import { ScrollView, View, Text, TouchableOpacity, Alert } from 'react-native';
import { Settings, LogOut, BookOpen, Clock, Star, Moon, Sun, Smartphone } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

export default function ProfileScreen() {
  const { isSignedIn, userEmail, userFullName, signOut } = useAuth();
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
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="flex-1 items-center justify-center p-4">
          <Text className="text-2xl font-bold mb-4">Profile</Text>
          <Text className="text-base text-gray-600 text-center">
            Please sign in to view your profile
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1">
        <View className="flex-row items-center justify-between p-4">
          <Text className="text-2xl font-bold">Profile</Text>
          <TouchableOpacity className="p-2">
            <Settings size={24} color="#000" />
          </TouchableOpacity>
        </View>
        
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
          <View className="gap-4">
            {/* User Info Card */}
            <View className="bg-white rounded-lg p-4">
              <View className="flex-row items-center gap-3">
                <View className="w-16 h-16 rounded-full bg-primary-500 items-center justify-center">
                  <Text className="text-white text-2xl font-bold">
                    {userFullName?.charAt(0) || userEmail?.charAt(0) || 'U'}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-semibold">
                    {userFullName || 'User'}
                  </Text>
                  <Text className="text-sm text-gray-600">
                    {userEmail || 'No email'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Statistics */}
            <View className="gap-3">
              <Text className="text-lg font-semibold">Statistics</Text>
              <View className="flex-row gap-2">
                <View className="flex-1 bg-white rounded-lg p-3 items-center">
                  <BookOpen size={20} color="#3b82f6" />
                  <Text className="text-xl font-semibold mt-1">42</Text>
                  <Text className="text-xs text-gray-600">Bookmarks</Text>
                </View>
                <View className="flex-1 bg-white rounded-lg p-3 items-center">
                  <Clock size={20} color="#3b82f6" />
                  <Text className="text-xl font-semibold mt-1">128</Text>
                  <Text className="text-xs text-gray-600">Read</Text>
                </View>
                <View className="flex-1 bg-white rounded-lg p-3 items-center">
                  <Star size={20} color="#3b82f6" />
                  <Text className="text-xl font-semibold mt-1">15</Text>
                  <Text className="text-xs text-gray-600">Subscriptions</Text>
                </View>
              </View>
            </View>

            {/* Theme Settings */}
            <View className="gap-3">
              <Text className="text-lg font-semibold">Theme</Text>
              <View className="bg-white rounded-lg p-1 flex-row">
                <TouchableOpacity 
                  className={`flex-1 flex-row items-center justify-center p-3 rounded-md ${theme === 'light' ? 'bg-primary-100' : ''}`}
                  onPress={() => handleThemeChange('light')}
                >
                  <Sun size={16} color={theme === 'light' ? '#3b82f6' : '#6b7280'} />
                  <Text className={`ml-2 ${theme === 'light' ? 'text-primary-600 font-semibold' : 'text-gray-600'}`}>
                    Light
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  className={`flex-1 flex-row items-center justify-center p-3 rounded-md ${theme === 'dark' ? 'bg-primary-100' : ''}`}
                  onPress={() => handleThemeChange('dark')}
                >
                  <Moon size={16} color={theme === 'dark' ? '#3b82f6' : '#6b7280'} />
                  <Text className={`ml-2 ${theme === 'dark' ? 'text-primary-600 font-semibold' : 'text-gray-600'}`}>
                    Dark
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  className={`flex-1 flex-row items-center justify-center p-3 rounded-md ${theme === 'system' ? 'bg-primary-100' : ''}`}
                  onPress={() => handleThemeChange('system')}
                >
                  <Smartphone size={16} color={theme === 'system' ? '#3b82f6' : '#6b7280'} />
                  <Text className={`ml-2 ${theme === 'system' ? 'text-primary-600 font-semibold' : 'text-gray-600'}`}>
                    System
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Sign Out Button */}
            <TouchableOpacity 
              className="bg-red-500 rounded-lg p-3 flex-row items-center justify-center mt-4"
              onPress={handleSignOut}
            >
              <LogOut size={20} color="#fff" />
              <Text className="text-white font-semibold ml-2">Sign Out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}