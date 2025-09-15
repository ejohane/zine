// Type declarations for expo-router native tabs
// This is a workaround for the experimental native tabs API

declare module 'expo-router/unstable-native-tabs' {
  import { ReactNode } from 'react';
  import { ColorValue, TextStyle } from 'react-native';

  export type NativeTabsBlurEffect = 
    | "none"
    | "systemDefault"
    | "extraLight"
    | "light"
    | "dark"
    | "regular"
    | "prominent"
    | "systemUltraThinMaterial"
    | "systemThinMaterial"
    | "systemMaterial"
    | "systemThickMaterial"
    | "systemChromeMaterial"
    | "systemUltraThinMaterialLight"
    | "systemThinMaterialLight"
    | "systemMaterialLight"
    | "systemThickMaterialLight"
    | "systemChromeMaterialLight"
    | "systemUltraThinMaterialDark"
    | "systemThinMaterialDark"
    | "systemMaterialDark"
    | "systemThickMaterialDark"
    | "systemChromeMaterialDark";

  export interface NativeTabsProps {
    children?: ReactNode;
    tintColor?: ColorValue;
    backgroundColor?: ColorValue | null;
    blurEffect?: NativeTabsBlurEffect;
    shadowColor?: ColorValue;
    disableTransparentOnScrollEdge?: boolean;
    labelStyle?: {
      color?: ColorValue;
      fontSize?: number;
      fontFamily?: string;
      fontWeight?: string | number;
    };
  }

  export interface NativeTabTriggerProps {
    name: string;
    children?: ReactNode;
    hidden?: boolean;
    disablePopToTop?: boolean;
    disableScrollToTop?: boolean;
  }

  export interface IconProps {
    sf?: string | { default?: string; selected: string };
    drawable?: string;
    src?: any;
    selectedColor?: ColorValue;
  }

  export interface LabelProps {
    children?: string;
    hidden?: boolean;
  }

  export interface BadgeProps {
    children?: string;
    hidden?: boolean;
  }

  export const NativeTabs: React.FC<NativeTabsProps> & {
    Trigger: React.FC<NativeTabTriggerProps>;
  };

  export const Icon: React.FC<IconProps>;
  export const Label: React.FC<LabelProps>;
  export const Badge: React.FC<BadgeProps>;
}