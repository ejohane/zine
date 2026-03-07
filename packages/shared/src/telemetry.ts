import { z } from 'zod';
import { ZINE_VERSION } from './constants';

export const TELEMETRY_TRACE_HEADER = 'X-Trace-ID';
export const TELEMETRY_REQUEST_HEADER = 'X-Request-ID';
export const TELEMETRY_CLIENT_REQUEST_HEADER = 'X-Client-Request-ID';

const TELEMETRY_ID_PATTERN = /^[A-Za-z0-9:_-]{6,128}$/;

export const TelemetryServiceSchema = z.enum(['mobile', 'worker']);
export type TelemetryService = z.infer<typeof TelemetryServiceSchema>;

export const TelemetryLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export type TelemetryLevel = z.infer<typeof TelemetryLevelSchema>;

export const TelemetryStatusSchema = z.enum(['ok', 'error']);
export type TelemetryStatus = z.infer<typeof TelemetryStatusSchema>;

export const TraceContextSchema = z.object({
  traceId: z.string().min(1),
  requestId: z.string().min(1).optional(),
  clientRequestId: z.string().min(1).optional(),
  spanId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
});
export type TraceContext = z.infer<typeof TraceContextSchema>;

export const ReleaseContextSchema = z.object({
  version: z.string().min(1).default(ZINE_VERSION),
  gitSha: z.string().min(1).optional(),
  buildId: z.string().min(1).optional(),
  deployedAt: z.string().datetime().optional(),
  channel: z.string().min(1),
  ring: z.string().min(1).optional(),
});
export type ReleaseContext = z.infer<typeof ReleaseContextSchema>;

export const TelemetryErrorSchema = z.object({
  type: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  classification: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  retryable: z.boolean().optional(),
});
export type TelemetryError = z.infer<typeof TelemetryErrorSchema>;

export const TelemetryEnvelopeSchema = z.object({
  ts: z.string().datetime(),
  level: TelemetryLevelSchema,
  service: TelemetryServiceSchema,
  env: z.string().min(1),
  operation: z.string().min(1),
  event: z.string().min(1),
  traceId: z.string().min(1),
  spanId: z.string().min(1).optional(),
  requestId: z.string().min(1).optional(),
  clientRequestId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  userIdHash: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  durationMs: z.number().nonnegative().optional(),
  status: TelemetryStatusSchema.optional(),
  error: TelemetryErrorSchema.optional(),
  release: ReleaseContextSchema.optional(),
  attrs: z.record(z.string(), z.unknown()).optional(),
});
export type TelemetryEnvelope = z.infer<typeof TelemetryEnvelopeSchema>;

function createRandomSegment(): string {
  const globalCrypto = globalThis.crypto;
  if (globalCrypto?.getRandomValues) {
    const bytes = new Uint8Array(10);
    globalCrypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }

  return Math.random().toString(36).slice(2).padEnd(20, '0').slice(0, 20);
}

function createPrefixedId(prefix: 'trc' | 'req' | 'crq' | 'job' | 'spn'): string {
  return `${prefix}_${Date.now().toString(36)}${createRandomSegment()}`;
}

export function createTraceId(): string {
  return createPrefixedId('trc');
}

export function createRequestId(): string {
  return createPrefixedId('req');
}

export function createClientRequestId(): string {
  return createPrefixedId('crq');
}

export function createSpanId(): string {
  return createPrefixedId('spn');
}

export function sanitizeTelemetryId(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || !TELEMETRY_ID_PATTERN.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

export function buildTraceHeaders(
  context: Pick<TraceContext, 'traceId'> &
    Partial<Pick<TraceContext, 'clientRequestId' | 'requestId'>>
): Record<string, string> {
  const headers: Record<string, string> = {
    [TELEMETRY_TRACE_HEADER]: context.traceId,
  };

  if (context.clientRequestId) {
    headers[TELEMETRY_CLIENT_REQUEST_HEADER] = context.clientRequestId;
  }

  if (context.requestId) {
    headers[TELEMETRY_REQUEST_HEADER] = context.requestId;
  }

  return headers;
}

export function buildReleaseContext(
  context: Omit<ReleaseContext, 'version'> & { version?: string }
): ReleaseContext {
  return ReleaseContextSchema.parse({
    version: context.version ?? ZINE_VERSION,
    gitSha: context.gitSha,
    buildId: context.buildId,
    deployedAt: context.deployedAt,
    channel: context.channel,
    ring: context.ring,
  });
}
