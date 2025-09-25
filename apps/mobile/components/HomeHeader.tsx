import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from 'heroui-native';
import { useAuth } from '../contexts/auth';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../contexts/theme';

interface HomeHeaderProps {
  userAvatar?: string;
  userName?: string;
}

export function HomeHeader({ userAvatar, userName }: HomeHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isSignedIn, user } = useAuth();
  const { colors } = useTheme();

  const handleAvatarPress = () => {
    router.push('/(app)/(tabs)/settings');
  };

  const handleAddPress = () => {
    router.push('/(app)/add-bookmark');
  };

  // Get initials for fallback avatar
  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name[0].toUpperCase();
  };

  const displayName = userName || user?.username || user?.emailAddresses?.[0]?.emailAddress;
  const avatarUrl = userAvatar || user?.imageUrl;
  const initials = getInitials(displayName);

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Bookmark</Text>
        
        <View style={styles.rightButtons}>
          <TouchableOpacity 
            onPress={handleAddPress} 
            activeOpacity={0.7}
            style={styles.addButton}
          >
            <View style={[styles.iconButton, { backgroundColor: colors.primary }]}>
              <Feather name="plus" size={24} color={colors.primaryForeground || '#ffffff'} />
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.7}>
            {isSignedIn ? (
              <Avatar size="md" color="default" alt={displayName || 'User avatar'}>
                {avatarUrl ? (
                  <Avatar.Image source={{ uri: avatarUrl }} />
                ) : (
                  <Avatar.Fallback>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </Avatar.Fallback>
                )}
              </Avatar>
            ) : (
              <View style={[styles.iconButton, { backgroundColor: colors.secondary }]}>
                <Feather name="user" size={20} color={colors.mutedForeground} />
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#171717',
    letterSpacing: -0.5,
  },
  rightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addButton: {
    marginRight: 4,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f4f4f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#525252',
  },
});