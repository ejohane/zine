export const CARD_STYLES = {
  compact: {
    height: 84,
    padding: 12,
    thumbnailSize: 60,
    thumbnailRadius: 8,
    titleSize: 15,
    titleWeight: '600' as const,
    titleLineHeight: 20,
    metadataSize: 12,
    gap: 12,
  },
  comfortable: {
    height: 100,
    padding: 16,
    thumbnailSize: 80,
    thumbnailRadius: 8,
    titleSize: 16,
    titleWeight: '600' as const,
    titleLineHeight: 22,
    metadataSize: 14,
    gap: 16,
  },
  mediaRich: {
    width: 300,
    height: 240,
    mediaHeight: 169,
    contentPadding: 12,
    thumbnailRadius: 12,
    titleSize: 14,
    titleWeight: '600' as const,
    titleLineHeight: 18,
    metadataSize: 12,
    marginRight: 12,
  },
} as const;

export const BORDER_RADIUS = {
  small: 4,
  medium: 8,
  large: 12,
  xlarge: 14,
  full: 20,
  circle: 999,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
} as const;

export const SHADOWS = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
} as const;

export const ANIMATIONS = {
  spring: {
    stiffness: 300,
    damping: 30,
    mass: 1,
  },
  timing: {
    short: 200,
    medium: 300,
    long: 500,
  },
} as const;
