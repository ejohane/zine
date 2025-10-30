import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/theme';

interface OpenLinkButtonProps {
  onPress: () => void;
  secondary?: boolean;
  style?: ViewStyle;
}

export function OpenLinkButton({ onPress, secondary = false, style }: OpenLinkButtonProps) {
  const { colors } = useTheme();

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <TouchableOpacity
      style={[
        secondary ? styles.secondaryButton : styles.primaryButton,
        secondary
          ? { backgroundColor: colors.secondary }
          : { backgroundColor: colors.primary },
        style,
      ]}
      onPress={handlePress}
      activeOpacity={0.8}
      accessibilityLabel="Open link"
      accessibilityHint="Opens this content in your browser"
      accessibilityRole="button"
    >
      <Feather
        name="external-link"
        size={secondary ? 18 : 20}
        color={secondary ? colors.foreground : colors.primaryForeground || '#fff'}
      />
      <Text
        style={[
          secondary ? styles.secondaryButtonText : styles.primaryButtonText,
          secondary
            ? { color: colors.foreground }
            : { color: colors.primaryForeground || '#fff' },
        ]}
      >
        Open Link
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    marginTop: 12,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
