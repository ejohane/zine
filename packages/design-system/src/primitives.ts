export const ButtonSpec = {
  variants: ['primary', 'secondary', 'outline', 'ghost'],
  tones: ['default', 'danger'],
  sizes: ['sm', 'md', 'lg'],
} as const;

export type ButtonVariant = (typeof ButtonSpec.variants)[number];
export type ButtonTone = (typeof ButtonSpec.tones)[number];
export type ButtonSize = (typeof ButtonSpec.sizes)[number];

export const TextSpec = {
  variants: [
    'displayLarge',
    'displayMedium',
    'headlineLarge',
    'headlineMedium',
    'headlineSmall',
    'titleLarge',
    'titleMedium',
    'titleSmall',
    'bodyLarge',
    'bodyMedium',
    'bodySmall',
    'labelLarge',
    'labelMedium',
    'labelSmall',
    'labelSmallPlain',
  ],
  tones: [
    'primary',
    'subheader',
    'secondary',
    'tertiary',
    'inverse',
    'accent',
    'accentMuted',
    'accentForeground',
    'success',
    'warning',
    'warningForeground',
    'error',
    'info',
    'overlay',
    'overlayMuted',
    'overlaySubtle',
  ],
} as const;

export type TextVariant = (typeof TextSpec.variants)[number];
export type TextTone = (typeof TextSpec.tones)[number];

export const SurfaceSpec = {
  tones: [
    'canvas',
    'subtle',
    'elevated',
    'raised',
    'success',
    'warning',
    'error',
    'info',
    'transparent',
  ],
  borders: ['none', 'subtle', 'default', 'tone'],
} as const;

export type SurfaceTone = (typeof SurfaceSpec.tones)[number];
export type SurfaceBorder = (typeof SurfaceSpec.borders)[number];

export const BadgeSpec = {
  tones: ['subtle', 'neutral', 'accent', 'success', 'warning', 'error', 'info', 'overlay'],
  sizes: ['sm', 'md'],
  shapes: ['rounded', 'pill'],
} as const;

export type BadgeTone = (typeof BadgeSpec.tones)[number];
export type BadgeSize = (typeof BadgeSpec.sizes)[number];
export type BadgeShape = (typeof BadgeSpec.shapes)[number];

export const FilterChipSpec = {
  sizes: ['small', 'medium'],
} as const;

export type FilterChipSize = (typeof FilterChipSpec.sizes)[number];
