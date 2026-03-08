/**
 * @zine/shared - Shared code across Zine apps
 */

// Domain types and enums
export { ContentType, Provider, UserItemState } from './types/domain';

// Domain interfaces
export type { Creator, CreatorWithSubscription } from './types/domain';

// Constants
export { ZINE_VERSION, YOUTUBE_SHORTS_MAX_DURATION_SECONDS } from './constants';

// Schemas (Zod validation for tRPC input)
export { ContentTypeSchema, ProviderSchema, SubscriptionStatusSchema } from './schemas';

// Telemetry contracts and helpers
export {
  TELEMETRY_TRACE_HEADER,
  TELEMETRY_REQUEST_HEADER,
  TELEMETRY_CLIENT_REQUEST_HEADER,
  TelemetryServiceSchema,
  TelemetryLevelSchema,
  TelemetryStatusSchema,
  TraceContextSchema,
  ReleaseContextSchema,
  TelemetryErrorSchema,
  TelemetryEnvelopeSchema,
  createTraceId,
  createRequestId,
  createClientRequestId,
  createSpanId,
  sanitizeTelemetryId,
  buildTraceHeaders,
  buildReleaseContext,
} from './telemetry';
export type {
  TelemetryService,
  TelemetryLevel,
  TelemetryStatus,
  TraceContext,
  ReleaseContext,
  TelemetryError,
  TelemetryEnvelope,
} from './telemetry';
