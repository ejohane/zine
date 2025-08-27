import { ScrollView, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Search, Plus, Music, Video, Rss } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DiscoverScreen() {
  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1">
        <View className="p-4 gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-bold">Discover</Text>
            <TouchableOpacity className="p-2">
              <Plus size={24} color="#000" />
            </TouchableOpacity>
          </View>
          <View className="flex-row gap-2">
            <TextInput 
              className="flex-1 bg-white rounded-lg px-3 py-2"
              placeholder="Search for podcasts, YouTube channels..." 
              placeholderTextColor="#9ca3af"
            />
            <TouchableOpacity className="bg-primary-500 px-4 py-2 rounded-lg">
              <Search size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
          <View className="gap-4">
            <View className="gap-2">
              <Text className="text-lg font-semibold">Platform Filters</Text>
              <View className="flex-row gap-2">
                <TouchableOpacity className="flex-row items-center border border-gray-300 px-3 py-2 rounded-lg">
                  <Music size={16} color="#6b7280" />
                  <Text className="ml-2">Spotify</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-row items-center border border-gray-300 px-3 py-2 rounded-lg">
                  <Video size={16} color="#6b7280" />
                  <Text className="ml-2">YouTube</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-row items-center border border-gray-300 px-3 py-2 rounded-lg">
                  <Rss size={16} color="#6b7280" />
                  <Text className="ml-2">RSS</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View className="gap-3">
              <Text className="text-lg font-semibold">Suggested Subscriptions</Text>
              {['Tech Podcast', 'Design Channel', 'News Feed'].map((item, index) => (
                <View key={index} className="bg-white rounded-lg p-4">
                  <View className="flex-row items-center">
                    <View className="flex-1 gap-1">
                      <Text className="font-semibold">{item}</Text>
                      <Text className="text-xs text-gray-600">
                        Platform • 100k subscribers
                      </Text>
                    </View>
                    <TouchableOpacity className="bg-primary-500 px-3 py-1.5 rounded">
                      <Text className="text-white text-sm">Subscribe</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}