import { ScrollView, View, Text, TextInput } from 'react-native';
import { Search } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1">
        <View className="p-4 bg-white border-b border-gray-200">
          <Text className="text-2xl font-bold mb-3">Search</Text>
          <View className="flex-row items-center bg-gray-50 rounded-lg px-3 h-11">
            <Search size={20} color="#737373" />
            <TextInput
              className="flex-1 ml-2"
              placeholder="Search bookmarks, creators, topics..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#737373"
            />
          </View>
        </View>
        
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
          <View className="gap-4">
            {searchQuery ? (
              <View className="items-center justify-center py-8">
                <Text className="opacity-50">Search results for "{searchQuery}"</Text>
                <Text className="opacity-30 text-xs mt-2">No results found</Text>
              </View>
            ) : (
              <>
                <View className="gap-3">
                  <Text className="font-semibold">Recent Searches</Text>
                  <View className="bg-white rounded-lg p-3">
                    <Text className="opacity-50">No recent searches</Text>
                  </View>
                </View>
                
                <View className="gap-3">
                  <Text className="font-semibold">Popular Topics</Text>
                  <View className="bg-white rounded-lg p-3 gap-2">
                    <Text>JavaScript</Text>
                    <Text>React Native</Text>
                    <Text>Design Systems</Text>
                    <Text>Productivity</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}