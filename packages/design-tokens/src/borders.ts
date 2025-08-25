const borderRadius = {
  none: '0px',
  sm: '0.125rem',
  DEFAULT: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  '3xl': '1.5rem',
  full: '9999px',
} as const;

const borderWidth = {
  DEFAULT: '1px',
  0: '0px',
  2: '2px',
  4: '4px',
  8: '8px',
} as const;

export type BorderRadius = typeof borderRadius;
export type BorderWidth = typeof borderWidth;

export { borderRadius, borderWidth };