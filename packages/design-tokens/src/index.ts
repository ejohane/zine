export * from './colors';
export * from './spacing';
export * from './typography';
export * from './breakpoints';
export * from './shadows';
export * from './borders';

import { colors } from './colors';
import { spacing } from './spacing';
import { typography } from './typography';
import { breakpoints } from './breakpoints';
import { shadows } from './shadows';
import { borderRadius, borderWidth } from './borders';

export const tokens = {
  colors,
  spacing,
  typography,
  breakpoints,
  shadows,
  borderRadius,
  borderWidth,
} as const;

export type Tokens = typeof tokens;

export default tokens;