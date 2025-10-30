import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/theme';

interface SaveBookmarkButtonProps {
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function SaveBookmarkButton({
  onPress,
  isLoading = false,
  disabled = false,
  style,
}: SaveBookmarkButtonProps) {
  const { colors } = useTheme();

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: colors.primary },
        (disabled || isLoading) && styles.disabled,
        style,
      ]}
      onPress={handlePress}
      disabled={disabled || isLoading}
      activeOpacity={0.8}
      accessibilityLabel="Save to bookmarks"
      accessibilityHint="Creates a bookmark from this content"
      accessibilityRole="button"
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.primaryForeground || '#fff'} />
      ) : (
        <Feather name="bookmark" size={20} color={colors.primaryForeground || '#fff'} />
      )}
      <Text style={[styles.buttonText, { color: colors.primaryForeground || '#fff' }]}>
        Save to Bookmarks
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
});
