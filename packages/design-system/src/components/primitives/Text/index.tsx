import { isReactNative } from '../../../lib/platform';

// Re-export types
export type { TextProps } from './Text.web';

// Import implementations
import { Text as TextWeb } from './Text.web';
import { 
  Text as TextNative, 
  H1 as H1Native,
  H2 as H2Native,
  H3 as H3Native,
  H4 as H4Native,
  H5 as H5Native,
  H6 as H6Native,
  Body as BodyNative,
  Caption as CaptionNative,
  Label as LabelNative
} from './Text.native';

// Export platform-appropriate implementation
const isNative = isReactNative();
export const Text = isNative ? TextNative : TextWeb;

// Export typography helpers (native only for now, web uses Text with variant)
export const H1 = isNative ? H1Native : TextWeb;
export const H2 = isNative ? H2Native : TextWeb;
export const H3 = isNative ? H3Native : TextWeb;
export const H4 = isNative ? H4Native : TextWeb;
export const H5 = isNative ? H5Native : TextWeb;
export const H6 = isNative ? H6Native : TextWeb;
export const Body = isNative ? BodyNative : TextWeb;
export const Caption = isNative ? CaptionNative : TextWeb;
export const Label = isNative ? LabelNative : TextWeb;