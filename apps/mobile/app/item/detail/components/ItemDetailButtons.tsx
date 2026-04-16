import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { IconButton } from '@/components/primitives';
import type { Colors } from '@/constants/theme';

import { styles } from '../../item-detail-styles';

export function IconActionButton({
  icon,
  color,
  onPress,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  return (
    <IconButton
      onPress={handlePress}
      disabled={disabled}
      size="md"
      variant="ghost"
      style={styles.iconActionButton}
      accessibilityLabel={icon}
    >
      <Ionicons name={icon} size={24} color={color} style={{ fontWeight: '700' }} />
    </IconButton>
  );
}

export function HeaderIconButton({
  icon,
  colors,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  colors: typeof Colors.dark;
  onPress?: () => void;
}) {
  return (
    <IconButton
      onPress={onPress}
      size="md"
      variant="subtle"
      colors={colors}
      style={[styles.headerIconButton, { backgroundColor: colors.backgroundSecondary }]}
      accessibilityLabel={icon}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </IconButton>
  );
}
