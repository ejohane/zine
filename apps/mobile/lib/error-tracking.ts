/**
 * Error Tracking (Sentry-compatible HTTP ingestion)
 *
 * Lightweight, JS-only integration that works in Expo Go and production builds
 * without native SDKs. Sends events to a Sentry-compatible store endpoint using
 * the public DSN key.
 */

type ErrorTrackingLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

interface ErrorTrackingContext {
  message?: string;
  level?: ErrorTrackingLevel;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  fingerprint?: string[];
  logger?: string;
}

interface ParsedDsn {
  endpoint: string;
  publicKey: string;
}

const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV === 'development';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const SENTRY_ENVIRONMENT =
  process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ?? (IS_DEV ? 'development' : 'production');
const SENTRY_RELEASE = process.env.EXPO_PUBLIC_SENTRY_RELEASE;

const ENABLED = Boolean(SENTRY_DSN) && !IS_DEV;

function parseDsn(dsn: string): ParsedDsn | null {
  const match = dsn.match(/^(https?):\/\/([^@]+)@([^/]+)\/(.+)$/);
  if (!match) return null;

  const [, protocol, auth, host, path] = match;
  const publicKey = auth.split(':')[0];
  const projectId = path.split('/')[0];

  if (!publicKey || !projectId) return null;

  return {
    endpoint: `${protocol}://${host}/api/${projectId}/store/`,
    publicKey,
  };
}

function generateEventId(): string {
  let id = '';
  for (let i = 0; i < 32; i += 1) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
  return id;
}

function normalizeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || 'Unknown error',
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return { name: 'Error', message: error };
  }

  try {
    return { name: 'Error', message: JSON.stringify(error) };
  } catch {
    return { name: 'Error', message: String(error) };
  }
}

function normalizeExtra(extra?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!extra) return undefined;
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) continue;

    if (value instanceof Error) {
      normalized[key] = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
      continue;
    }

    if (typeof value === 'object' && value !== null) {
      try {
        normalized[key] = JSON.parse(JSON.stringify(value));
      } catch {
        normalized[key] = String(value);
      }
      continue;
    }

    normalized[key] = value;
  }

  return normalized;
}

function sendEvent(payload: Record<string, unknown>, dsn: ParsedDsn): void {
  if (typeof fetch !== 'function') return;
  const authHeader = `Sentry sentry_version=7, sentry_client=zine-mobile/1.0, sentry_key=${dsn.publicKey}`;

  void fetch(dsn.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': authHeader,
    },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export function captureError(error: unknown, context: ErrorTrackingContext = {}): void {
  if (!ENABLED || !SENTRY_DSN) return;

  const parsed = parseDsn(SENTRY_DSN);
  if (!parsed) return;

  const normalized = normalizeError(error);
  const extra = normalizeExtra(context.extra);

  const payload: Record<string, unknown> = {
    event_id: generateEventId(),
    timestamp: new Date().toISOString(),
    platform: 'javascript',
    level: context.level ?? 'error',
    environment: SENTRY_ENVIRONMENT,
    release: SENTRY_RELEASE,
    logger: context.logger,
    tags: context.tags,
    fingerprint: context.fingerprint,
    message: context.message ?? normalized.message,
    exception: {
      values: [
        {
          type: normalized.name,
          value: normalized.message,
        },
      ],
    },
    extra: {
      ...extra,
      stack: normalized.stack,
    },
  };

  sendEvent(payload, parsed);
}
