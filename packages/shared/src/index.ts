/**
 * @zine/shared - Shared code across Zine apps
 */

// Domain types and enums
export { ContentType, Provider, UserItemState } from './types/domain';

// Constants
export { ZINE_VERSION, YOUTUBE_SHORTS_MAX_DURATION_SECONDS } from './constants';

// Schemas (Zod validation for tRPC input)
export { ContentTypeSchema, ProviderSchema, SubscriptionStatusSchema } from './schemas';
