import Constants from 'expo-constants';

export const CACHE_VERSION = `v${Constants.expoConfig?.version || '1.0.0'}-cache-v1`;

export function getCacheBuster(): string {
  return CACHE_VERSION;
}
