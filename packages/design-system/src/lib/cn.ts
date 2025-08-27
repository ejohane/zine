import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { isReactNative } from './platform';

/**
 * Utility for merging className strings with Tailwind CSS support.
 * Works for both web and React Native (with NativeWind).
 */
export function cn(...inputs: ClassValue[]) {
  // For React Native, we don't need tailwind-merge as NativeWind handles it
  if (isReactNative()) {
    return clsx(inputs);
  }
  
  // For web, use tailwind-merge to properly handle Tailwind class conflicts
  return twMerge(clsx(inputs));
}

/**
 * Type-safe className prop that works for both web and React Native
 */
export type ClassName = string | undefined;