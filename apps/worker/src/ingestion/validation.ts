/**
 * Validation Layer for Canonical Items
 *
 * Provides Zod schemas and custom error types for validating transformed items
 * before database insertion. This prevents silent data corruption by ensuring
 * required fields are present and valid.
 *
 * @see Issue zine-g0b: Add Validation Layer Before DB Inserts
 */

import { z } from 'zod';
import { ContentType, Provider } from '@zine/shared';

// ============================================================================
// Custom Validation Error
// ============================================================================

/**
 * Custom error for validation failures.
 * Provides structured context about which field failed and why.
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Maximum duration in seconds (24 hours).
 * Used as a sanity check - no episode/video should exceed this.
 */
const MAX_DURATION_SECONDS = 86400;

/**
 * Maximum reasonable timestamp - year 2100.
 * Catches obviously invalid future dates.
 */
const MAX_TIMESTAMP_MS = 4102444800000;

/**
 * Minimum reasonable timestamp - year 2000.
 * Catches obviously invalid past dates (Unix epoch = 0 is invalid).
 */
const MIN_TIMESTAMP_MS = 946684800000;

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Custom URL validator that only accepts http/https URLs.
 * Standard Zod url() accepts any valid URL scheme including ftp://, mailto:, etc.
 */
const httpUrl = (message: string) =>
  z.string().refine(
    (val) => {
      try {
        const url = new URL(val);
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message }
  );

/**
 * Schema for validating canonical items before database insertion.
 *
 * Validates:
 * - Required fields: providerId, title, canonicalUrl, provider, contentType
 * - URL format for canonicalUrl (http/https only)
 * - Optional field formats when present
 * - Duration sanity check (0-24h in seconds)
 * - Timestamp range validation
 */
export const canonicalItemSchema = z.object({
  // Required fields - must be non-empty strings
  id: z.string().min(1, 'Item ID is required'),
  providerId: z.string().min(1, 'Provider ID is required'),
  provider: z.nativeEnum(Provider, { message: 'Invalid provider type' }),
  contentType: z.nativeEnum(ContentType, { message: 'Invalid content type' }),
  title: z.string().min(1, 'Title is required'),
  canonicalUrl: httpUrl('Valid HTTP/HTTPS URL required for canonicalUrl'),
  creator: z.string().min(1, 'Creator is required'),

  // Required timestamps with range validation
  publishedAt: z
    .number()
    .int('publishedAt must be an integer')
    .min(MIN_TIMESTAMP_MS, 'publishedAt is too far in the past (before year 2000)')
    .max(MAX_TIMESTAMP_MS, 'publishedAt is too far in the future (after year 2100)'),
  createdAt: z
    .number()
    .int('createdAt must be an integer')
    .min(MIN_TIMESTAMP_MS, 'createdAt is too far in the past')
    .max(MAX_TIMESTAMP_MS, 'createdAt is too far in the future'),

  // Optional fields - validated when present
  description: z.string().optional(),
  creatorId: z.string().optional(),
  creatorImageUrl: httpUrl('Invalid creator image URL').optional().nullable(),
  imageUrl: httpUrl('Invalid image URL').optional().nullable(),

  // Duration in seconds - sanity check (0-24h)
  durationSeconds: z
    .number()
    .int('Duration must be an integer')
    .nonnegative('Duration cannot be negative')
    .max(MAX_DURATION_SECONDS, 'Duration exceeds 24 hours - likely invalid')
    .optional()
    .nullable(),
});

/**
 * Type inferred from the Zod schema for type safety.
 */
export type ValidatedCanonicalItem = z.infer<typeof canonicalItemSchema>;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a transformed item before database insertion.
 *
 * Uses Zod for comprehensive validation with detailed error messages.
 * On failure, throws a ValidationError with structured context for debugging.
 *
 * @param item - The transformed item to validate
 * @param rawData - Optional raw data for context in error messages
 * @returns The validated item (same as input if valid)
 * @throws ValidationError if validation fails
 *
 * @example
 * ```typescript
 * try {
 *   const validItem = validateCanonicalItem(transformedItem, rawApiResponse);
 *   // Proceed with DB insert
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     logger.warn('Validation failed', {
 *       field: error.field,
 *       value: error.value,
 *       context: error.context,
 *     });
 *   }
 *   throw error;
 * }
 * ```
 */
export function validateCanonicalItem(item: unknown, rawData?: unknown): ValidatedCanonicalItem {
  const result = canonicalItemSchema.safeParse(item);

  if (!result.success) {
    const firstError = result.error.errors[0];
    const fieldPath = firstError.path.join('.');

    // Extract the invalid value for context
    let invalidValue: unknown;
    if (item && typeof item === 'object') {
      const itemObj = item as Record<string, unknown>;
      invalidValue = firstError.path.reduce<unknown>(
        (obj, key) =>
          obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined,
        itemObj
      );
    }

    throw new ValidationError(
      `Invalid item: ${firstError.message}`,
      fieldPath || 'unknown',
      invalidValue,
      {
        providerId:
          item && typeof item === 'object'
            ? (item as Record<string, unknown>).providerId
            : undefined,
        allErrors: result.error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
        rawData: rawData !== undefined ? rawData : undefined,
      }
    );
  }

  return result.data;
}

/**
 * Check if an error is a ValidationError.
 * Useful for error classification in the DLQ.
 */
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}
