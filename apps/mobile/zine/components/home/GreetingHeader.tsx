import React from 'react'
import { View, Text } from 'react-native'

export function GreetingHeader() {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <View className="mb-6">
      <Text className="text-4xl font-extrabold text-black mb-2">
        {getGreeting()}
      </Text>
      <Text className="text-lg text-gray-500 font-normal">
        Welcome back to your personalized content hub
      </Text>
    </View>
  );
}