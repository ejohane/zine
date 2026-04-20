// JSON-safe types and guards
export { isJsonObject, isJsonValue } from './json';
export type { JsonArray, JsonObject, JsonPrimitive, JsonValue } from './json';

// Domain types and enums
export {
  ContentType,
  Provider,
  UserItemState,
  SubscriptionStatus,
  ProviderConnectionStatus,
} from './types/domain';

// Domain interfaces
export type {
  ContentTypeValue,
  ProviderValue,
  UserItemStateValue,
  SubscriptionStatusValue,
  ProviderConnectionStatusValue,
  OAuthProvider,
  SubscriptionSource,
  Creator,
  CreatorWithSubscription,
} from './types/domain';

export { ZINE_VERSION, YOUTUBE_SHORTS_MAX_DURATION_SECONDS } from './constants';

// UI formatting helpers
export { formatDurationTimestamp, isValidUrl, mapContentType, mapProvider } from './format';
export type { UIContentType, UIProvider } from './format';

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

// Query persistence helpers
export {
  QUERY_PERSISTENCE_STORAGE_PREFIX,
  QUERY_PERSISTENCE_MAX_AGE_MS,
  buildQueryPersistenceBuster,
  buildQueryPersistenceKey,
  getQueryPathFromKey,
  isAllowlistedQueryKey,
  shouldPersistQuery,
} from './query-persistence';
