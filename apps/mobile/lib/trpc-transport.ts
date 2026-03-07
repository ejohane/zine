import {
  buildTraceHeaders,
  createClientRequestId,
  createTraceId,
  TELEMETRY_CLIENT_REQUEST_HEADER,
  TELEMETRY_REQUEST_HEADER,
  TELEMETRY_TRACE_HEADER,
} from '@zine/shared';
import { trpcLogger } from './logger';

export interface NetworkTraceRecord {
  url: string;
  method: string;
  traceId?: string;
  clientRequestId?: string;
  workerRequestId?: string;
  httpStatus?: number;
  ok?: boolean;
  error?: string;
  startedAt: string;
  finishedAt: string;
}

type TelemetryHeaderSeed = {
  traceId?: string;
  clientRequestId?: string;
};

export interface MobileActionTraceContext {
  traceId: string;
}

const RECENT_NETWORK_TRACE_LIMIT = 50;
const recentNetworkTraces: NetworkTraceRecord[] = [];
const activeActionTraceStack: MobileActionTraceContext[] = [];

function recordNetworkTrace(trace: NetworkTraceRecord): void {
  recentNetworkTraces.unshift(trace);
  if (recentNetworkTraces.length > RECENT_NETWORK_TRACE_LIMIT) {
    recentNetworkTraces.length = RECENT_NETWORK_TRACE_LIMIT;
  }
}

function toUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function sanitizeTraceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.split('?')[0]?.split('#')[0] ?? url;
  }
}

function getActiveActionTraceId(): string | undefined {
  return activeActionTraceStack[activeActionTraceStack.length - 1]?.traceId;
}

function readHeader(headers: HeadersInit | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  if (Array.isArray(headers)) {
    const match = headers.find(([headerName]) => headerName.toLowerCase() === name.toLowerCase());
    return match?.[1];
  }

  const directMatch = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === name.toLowerCase()
  );
  return directMatch?.[1];
}

function resolveHeaders(input: RequestInfo | URL, init?: RequestInit): HeadersInit | undefined {
  if (init?.headers) {
    return init.headers;
  }

  return input instanceof Request ? input.headers : undefined;
}

export function getRecentNetworkTraces(): NetworkTraceRecord[] {
  return [...recentNetworkTraces];
}

export function createMobileActionTraceContext(
  seed?: Pick<TelemetryHeaderSeed, 'traceId'>
): MobileActionTraceContext {
  return {
    traceId: seed?.traceId ?? createTraceId(),
  };
}

export async function runWithMobileActionTrace<T>(
  context: MobileActionTraceContext,
  operation: () => Promise<T> | T
): Promise<T> {
  activeActionTraceStack.push(context);

  try {
    return await operation();
  } finally {
    const index = activeActionTraceStack.lastIndexOf(context);
    if (index >= 0) {
      activeActionTraceStack.splice(index, 1);
    }
  }
}

export function buildMobileTelemetryHeaders(
  headers: Record<string, string>,
  seed?: TelemetryHeaderSeed
): Record<string, string> {
  const traceId = seed?.traceId ?? getActiveActionTraceId() ?? createTraceId();
  const clientRequestId = seed?.clientRequestId ?? createClientRequestId();

  return {
    ...headers,
    ...buildTraceHeaders({
      traceId,
      clientRequestId,
    }),
  };
}

export async function telemetryFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const requestHeaders = resolveHeaders(input, init);
  const traceId = readHeader(requestHeaders, TELEMETRY_TRACE_HEADER);
  const clientRequestId = readHeader(requestHeaders, TELEMETRY_CLIENT_REQUEST_HEADER);
  const startedAt = new Date().toISOString();
  const url = sanitizeTraceUrl(toUrl(input));
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

  try {
    const response = await fetch(input, init);
    const workerRequestId = response.headers.get(TELEMETRY_REQUEST_HEADER) ?? undefined;
    const responseTraceId = response.headers.get(TELEMETRY_TRACE_HEADER) ?? traceId;
    const transportOk = response.ok && response.status !== 207;

    const trace: NetworkTraceRecord = {
      url,
      method,
      traceId: responseTraceId,
      clientRequestId,
      workerRequestId,
      httpStatus: response.status,
      ok: transportOk,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
    recordNetworkTrace(trace);

    if (!transportOk) {
      trpcLogger.warn('tRPC transport received degraded response', {
        url,
        method,
        httpStatus: response.status,
        statusKind: response.status === 207 ? 'partial' : 'error',
        traceId: responseTraceId,
        clientRequestId,
        workerRequestId,
      });
    }

    return response;
  } catch (error) {
    const trace: NetworkTraceRecord = {
      url,
      method,
      traceId,
      clientRequestId,
      error: error instanceof Error ? error.message : String(error),
      startedAt,
      finishedAt: new Date().toISOString(),
    };
    recordNetworkTrace(trace);

    trpcLogger.error('tRPC transport request failed', {
      error,
      url,
      method,
      traceId,
      clientRequestId,
    });

    throw error;
  }
}
