/**
 * Platform detection utilities for unified components
 */

// Check if we're in a React Native environment
export const isReactNative = (): boolean => {
  // Use multiple checks for React Native detection
  return (
    typeof navigator !== 'undefined' &&
    // @ts-ignore - navigator.product might not exist in all environments
    (navigator.product === 'ReactNative' ||
     // Alternative check for React Native
     // @ts-ignore - global might not exist in all environments
     (typeof global !== 'undefined' && 
      // @ts-ignore - global.HermesInternal is specific to React Native
      (global as any).HermesInternal !== undefined))
  );
};

// Check if we're in a web environment
export const isWeb = (): boolean => {
  return !isReactNative() && typeof window !== 'undefined';
};

// Check if we're on iOS
export const isIOS = (): boolean => {
  if (!isReactNative()) return false;
  try {
    const { Platform } = require('react-native');
    return Platform.OS === 'ios';
  } catch {
    return false;
  }
};

// Check if we're on Android
export const isAndroid = (): boolean => {
  if (!isReactNative()) return false;
  try {
    const { Platform } = require('react-native');
    return Platform.OS === 'android';
  } catch {
    return false;
  }
};

// Get the current platform
export type PlatformType = 'web' | 'ios' | 'android' | 'unknown';

export const getPlatform = (): PlatformType => {
  if (isWeb()) return 'web';
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  return 'unknown';
};

// Platform-specific style helpers
export const platformSelect = <T>(options: {
  web?: T;
  ios?: T;
  android?: T;
  native?: T;
  default?: T;
}): T | undefined => {
  const platform = getPlatform();
  
  if (platform === 'web' && options.web !== undefined) {
    return options.web;
  }
  
  if (platform === 'ios' && options.ios !== undefined) {
    return options.ios;
  }
  
  if (platform === 'android' && options.android !== undefined) {
    return options.android;
  }
  
  if ((platform === 'ios' || platform === 'android') && options.native !== undefined) {
    return options.native;
  }
  
  return options.default;
};