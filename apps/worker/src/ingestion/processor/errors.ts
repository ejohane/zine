import { TransformError } from '../transformers';
import { isValidationError } from '../validation';

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Error types for dead-letter queue classification.
 * Helps with understanding failure patterns and retry strategies.
 */
export type DLQErrorType = 'transform' | 'database' | 'validation' | 'timeout' | 'unknown';

/**
 * Classify an error into a category for dead-letter queue tracking.
 * This helps with understanding failure patterns and determining retry strategies:
 * - transform: Data transformation failed (likely needs manual fix)
 * - database: DB operation failed (often transient, safe to retry)
 * - validation: Data validation failed (likely needs manual fix)
 * - timeout: Operation timed out (transient, safe to retry)
 * - unknown: Unclassified error
 *
 * @param error - The error to classify
 * @returns The error type classification
 */
export function classifyError(error: unknown): DLQErrorType {
  if (error instanceof TransformError) {
    return 'transform';
  }

  if (isValidationError(error)) {
    return 'validation';
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    // Database errors (D1, SQLite, Drizzle)
    if (
      name.includes('database') ||
      name.includes('sql') ||
      name.includes('d1') ||
      message.includes('database') ||
      message.includes('sqlite') ||
      message.includes('constraint') ||
      message.includes('unique') ||
      message.includes('foreign key')
    ) {
      return 'database';
    }

    // Timeout errors
    if (
      name.includes('timeout') ||
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('deadline exceeded')
    ) {
      return 'timeout';
    }

    // Validation errors
    if (
      name.includes('validation') ||
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required field') ||
      message.includes('missing')
    ) {
      return 'validation';
    }
  }

  return 'unknown';
}
