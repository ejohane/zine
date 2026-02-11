/**
 * Zod Schemas for Zine
 *
 * Runtime validation schemas for tRPC input validation.
 * These schemas wrap TypeScript enums to provide runtime type checking
 * and validation for API boundaries.
 *
 * @module
 */

import { z } from 'zod';
import { ContentType, Provider, SubscriptionStatus } from '../types/domain';

// ============================================================================
// Enum Schemas (used for tRPC input validation)
// ============================================================================

/** Schema for content types (VIDEO, AUDIO, etc.) */
export const ContentTypeSchema = z
  .nativeEnum(ContentType)
  .describe('The type of content item (e.g., VIDEO, AUDIO)');

/** Schema for content provider platforms */
export const ProviderSchema = z
  .nativeEnum(Provider)
  .describe('Content provider platforms supported by Zine (YOUTUBE, SPOTIFY, GMAIL, etc.)');

/** Schema for subscription lifecycle status */
export const SubscriptionStatusSchema = z
  .nativeEnum(SubscriptionStatus)
  .describe('Subscription lifecycle status (ACTIVE, PAUSED, UNSUBSCRIBED)');
