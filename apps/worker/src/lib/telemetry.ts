import {
  ZINE_VERSION,
  buildReleaseContext,
  createRequestId,
  createTraceId,
  sanitizeTelemetryId,
  TELEMETRY_CLIENT_REQUEST_HEADER,
  TELEMETRY_TRACE_HEADER,
  type ReleaseContext,
} from '@zine/shared';
import type { Context } from 'hono';
import type { Bindings, Env } from '../types';

const DEFAULT_ENVIRONMENT = 'development';

function normalizeReleaseField(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeReleaseTimestamp(value?: string): string | undefined {
  const trimmed = normalizeReleaseField(value);
  if (!trimmed) {
    return undefined;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return new Date(parsed).toISOString();
}

export interface WorkerRequestTelemetry {
  traceId: string;
  requestId: string;
  clientRequestId?: string;
  service: 'worker';
  env: string;
  release: ReleaseContext;
}

export function getEnvironmentName(env: Pick<Bindings, 'ENVIRONMENT'>): string {
  return env.ENVIRONMENT || DEFAULT_ENVIRONMENT;
}

export function getWorkerRelease(env: Bindings): ReleaseContext {
  return buildReleaseContext({
    version: ZINE_VERSION,
    channel: getEnvironmentName(env),
    gitSha: normalizeReleaseField(env.RELEASE_GIT_SHA),
    buildId: normalizeReleaseField(env.RELEASE_BUILD_ID),
    deployedAt: normalizeReleaseTimestamp(env.RELEASE_DEPLOYED_AT),
    ring: normalizeReleaseField(env.RELEASE_RING),
  });
}

export function createWorkerRequestTelemetry(c: Context<Env>): WorkerRequestTelemetry {
  return {
    service: 'worker',
    env: getEnvironmentName(c.env),
    release: getWorkerRelease(c.env),
    traceId: sanitizeTelemetryId(c.req.header(TELEMETRY_TRACE_HEADER)) ?? createTraceId(),
    requestId: createRequestId(),
    clientRequestId: sanitizeTelemetryId(c.req.header(TELEMETRY_CLIENT_REQUEST_HEADER)),
  };
}
