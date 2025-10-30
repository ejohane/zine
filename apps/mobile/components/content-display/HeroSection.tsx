import { View, Image, Text, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../contexts/theme';
import { useState } from 'react';

interface HeroSectionProps {
  thumbnailUrl?: string;
  contentType?: string;
  duration?: number;
  scrollY: Animated.Value;
}

export function HeroSection({ 
  thumbnailUrl, 
  contentType, 
  duration, 
  scrollY 
}: HeroSectionProps) {
  const { colors } = useTheme();
  const [imageError, setImageError] = useState(false);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${secs}s`;
  };

  const formattedDuration = formatDuration(duration);
  const HEADER_HEIGHT = 300;
  
  const imageTranslateY = scrollY.interpolate({
    inputRange: [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
    outputRange: [-HEADER_HEIGHT / 2, 0, HEADER_HEIGHT * 0.75],
    extrapolate: 'clamp',
  });

  const imageScale = scrollY.interpolate({
    inputRange: [-HEADER_HEIGHT, 0],
    outputRange: [2, 1],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View 
      style={[
        styles.heroSection, 
        { 
          transform: [
            { translateY: imageTranslateY },
            { scale: imageScale }
          ] 
        }
      ]}
    >
      {thumbnailUrl && !imageError ? (
        <Image
          source={{ uri: thumbnailUrl }}
          style={styles.heroImage}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <View style={[styles.heroPlaceholder, { backgroundColor: colors.secondary }]}>
          <Feather name="image" size={48} color={colors.mutedForeground} />
        </View>
      )}
      {formattedDuration && (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formattedDuration}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  heroSection: {
    width: '100%',
    height: 300,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    width: '100%',
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  durationText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
