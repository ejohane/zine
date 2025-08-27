/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Platform detection utilities for unified components
 */

export type PlatformType = 'web' | 'ios' | 'android' | 'native';

/**
 * Check if code is running in React Native environment
 */
export const isReactNative = (): boolean => {
  // Check for React Native using multiple methods for better reliability
  if (typeof global !== 'undefined' && (global as any).__DEV__ !== undefined) {
    return true;
  }
  if (typeof navigator !== 'undefined' && (navigator as any).product === 'ReactNative') {
    return true;
  }
  // Check for React Native's global object
  if (typeof global !== 'undefined' && (global as any).nativePerformanceNow) {
    return true;
  }
  return false;
};

/**
 * Check if code is running in web browser environment
 */
export const isWeb = (): boolean => {
  return !isReactNative();
};

/**
 * Check if code is running on iOS
 */
export const isIOS = (): boolean => {
  if (!isReactNative()) return false;
  try {
    const { Platform } = require('react-native');
    return Platform.OS === 'ios';
  } catch {
    return false;
  }
};

/**
 * Check if code is running on Android
 */
export const isAndroid = (): boolean => {
  if (!isReactNative()) return false;
  try {
    const { Platform } = require('react-native');
    return Platform.OS === 'android';
  } catch {
    return false;
  }
};

/**
 * Get current platform type
 */
export const getPlatform = (): PlatformType => {
  if (isWeb()) return 'web';
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  return 'native';
};

/**
 * Platform-specific value selector
 * Similar to Platform.select in React Native
 */
export function platformSelect<T>(values: {
  web?: T;
  ios?: T;
  android?: T;
  native?: T;
  default?: T;
}): T | undefined {
  const platform = getPlatform();
  
  if (platform === 'web' && values.web !== undefined) {
    return values.web;
  }
  if (platform === 'ios' && values.ios !== undefined) {
    return values.ios;
  }
  if (platform === 'android' && values.android !== undefined) {
    return values.android;
  }
  if (platform === 'native' && values.native !== undefined) {
    return values.native;
  }
  
  return values.default;
}