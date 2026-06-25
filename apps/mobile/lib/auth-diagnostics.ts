import { AppState } from 'react-native';

import { captureError } from '@/lib/error-tracking';

type AuthDiagnosticLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';
type AuthDiagnosticExtra = Record<string, unknown>;

const AUTH_DIAGNOSTIC_PREFIX = 'auth.';

export function captureAuthDiagnostic(
  event: string,
  extra: AuthDiagnosticExtra = {},
  level: AuthDiagnosticLevel = 'warning'
): void {
  captureError(`${AUTH_DIAGNOSTIC_PREFIX}${event}`, {
    level,
    message: `${AUTH_DIAGNOSTIC_PREFIX}${event}`,
    logger: 'auth-diagnostics',
    tags: {
      module: 'Auth',
      authEvent: event,
    },
    extra: {
      ...extra,
      appState: AppState.currentState,
      capturedAt: new Date().toISOString(),
    },
    fingerprint: ['auth-diagnostics', event],
  });
}
