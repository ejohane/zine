import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { Play, Star, Plus } from 'lucide-react-native'
import { useRouter } from 'expo-router'

interface ActionCardProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

function ActionCard({ icon, label, onPress, disabled }: ActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{ flex: 1, opacity: disabled ? 0.5 : 1 }}
    >
      {({ pressed }) => (
        <View
          className={`${pressed ? 'bg-gray-100' : 'bg-white'} rounded-2xl p-6 items-center justify-center min-h-[130px] shadow-sm border border-gray-100`}
          style={{
            transform: [{ scale: pressed ? 0.97 : 1 }]
          }}
        >
          <View className="items-center justify-center mb-3">
            {icon}
          </View>
          <Text className="text-base font-semibold text-black">
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function QuickActions() {
  const router = useRouter();

  const handleContinue = () => {
    // TODO: Open last viewed item
    console.log('Continue pressed');
  };

  const handleFavorites = () => {
    router.push('/bookmarks?filter=favorites');
  };

  const handleAddNew = () => {
    // TODO: Navigate to save screen
    console.log('Add New pressed');
  };

  return (
    <View className="flex-row gap-4 mb-6">
      <ActionCard
        icon={<Play size={36} color="#000000" strokeWidth={1.5} />}
        label="Continue"
        onPress={handleContinue}
        disabled={false}
      />
      <ActionCard
        icon={<Star size={36} color="#000000" strokeWidth={1.5} />}
        label="Favorites"
        onPress={handleFavorites}
      />
      <ActionCard
        icon={<Plus size={36} color="#000000" strokeWidth={1.5} />}
        label="Add New"
        onPress={handleAddNew}
      />
    </View>
  );
}