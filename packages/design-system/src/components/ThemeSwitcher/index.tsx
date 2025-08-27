/* eslint-disable @typescript-eslint/no-require-imports */
import { isWeb } from '../../lib/platform';

// Platform-specific imports
let ThemeSwitcherComponent: any;

if (isWeb()) {
  ThemeSwitcherComponent = require('./ThemeSwitcher.web').ThemeSwitcher;
} else {
  ThemeSwitcherComponent = require('./ThemeSwitcher.native').ThemeSwitcher;
}

export const ThemeSwitcher = ThemeSwitcherComponent;
export type { ThemeSwitcherProps } from './ThemeSwitcher.web';