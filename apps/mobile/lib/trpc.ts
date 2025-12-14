import { Platform } from 'react-native';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../worker/src/trpc/router';

export const trpc = createTRPCReact<AppRouter>();

// API URL for the worker
// - iOS Simulator: localhost works
// - Android Emulator: needs 10.0.2.2 (special alias for host machine)
// - Physical device: needs actual IP address (set via EXPO_PUBLIC_API_URL)
function getDefaultApiUrl(): string {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8787';
  }
  return 'http://localhost:8787';
}

export const API_URL = process.env.EXPO_PUBLIC_API_URL || getDefaultApiUrl();
