/**
 * Error Serialization and Classification Utilities
 *
 * Provides utilities for properly serializing errors to preserve context,
 * stack traces, and error types for debugging and monitoring.
 *
 * Problem: Using String(error) on Error objects often loses the message,
 * producing "[object Error]" instead of useful information.
 *
 * Solution: Serialize errors to structured objects that preserve:
 * - Full error message
 * - Error type/constructor name
 * - Stack trace
 * - Error code (if present)
 * - Nested cause chain
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A serialized representation of an error that preserves full context.
 */
export interface SerializedError {
  /** The error message */
  message: string;
  /** The error type/constructor name (e.g., "TypeError", "Error") */
  type: string;
  /** The full stack trace (if available) */
  stack?: string;
  /** Error code (e.g., "ETIMEDOUT", "ECONNREFUSED") */
  code?: string;
  /** HTTP status code (if available) */
  status?: number;
  /** Nested cause (for Error.cause) */
  cause?: SerializedError;
}

/**
 * Error classification types for monitoring and aggregation.
 */
export type ErrorClassification =
  | 'type_error'
  | 'syntax_error'
  | 'parse_error'
  | 'timeout'
  | 'connection'
  | 'rate_limit'
  | 'server_error'
  | 'client_error'
  | 'not_found'
  | 'unauthorized'
  | 'forbidden'
  | 'transform'
  | 'database'
  | 'validation'
  | 'unknown';

/**
 * A structured polling error with full context for debugging.
 */
export interface PollingError {
  /** The subscription that encountered the error */
  subscriptionId: string;
  /** The serialized error with full context */
  error: SerializedError;
  /** Unix timestamp when the error occurred */
  timestamp: number;
  /** Error classification for monitoring/aggregation */
  errorType: ErrorClassification;
  /** Additional context for debugging */
  context?: Record<string, unknown>;
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize an error to a structured object preserving full context.
 *
 * Handles:
 * - Error instances (preserves message, type, stack, code, cause)
 * - String errors (wraps in structured format)
 * - Other values (converts to string)
 *
 * @param error - The error to serialize
 * @returns A SerializedError with full context
 *
 * @example
 * ```typescript
 * try {
 *   await fetchData();
 * } catch (error) {
 *   const serialized = serializeError(error);
 *   // {
 *   //   message: "Connection timeout",
 *   //   type: "Error",
 *   //   stack: "Error: Connection timeout\n    at fetchData...",
 *   //   code: "ETIMEDOUT"
 *   // }
 * }
 * ```
 */
export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    const result: SerializedError = {
      message: error.message,
      type: error.constructor.name,
    };

    // Include stack trace if available
    if (error.stack) {
      result.stack = error.stack;
    }

    // Include error code if present (common in Node.js errors)
    const errorWithCode = error as Error & { code?: string };
    if (errorWithCode.code) {
      result.code = errorWithCode.code;
    }

    // Include HTTP status if present (common in HTTP errors)
    const errorWithStatus = error as Error & { status?: number; statusCode?: number };
    if (errorWithStatus.status !== undefined) {
      result.status = errorWithStatus.status;
    } else if (errorWithStatus.statusCode !== undefined) {
      result.status = errorWithStatus.statusCode;
    }

    // Recursively serialize the cause chain
    if (error.cause) {
      result.cause = serializeError(error.cause);
    }

    return result;
  }

  // Handle string errors
  if (typeof error === 'string') {
    return {
      message: error,
      type: 'StringError',
    };
  }

  // Handle null/undefined
  if (error === null || error === undefined) {
    return {
      message: String(error),
      type: error === null ? 'null' : 'undefined',
    };
  }

  // Handle objects with message property (error-like objects)
  if (typeof error === 'object' && 'message' in error) {
    const errorLike = error as { message: string; name?: string; stack?: string };
    return {
      message: String(errorLike.message),
      type: errorLike.name || 'Object',
      stack: errorLike.stack,
    };
  }

  // Fallback for other values
  return {
    message: String(error),
    type: typeof error,
  };
}

// ============================================================================
// Classification
// ============================================================================

/**
 * Classify an error into a category for monitoring and aggregation.
 *
 * This helps with:
 * - Grouping errors by type in dashboards
 * - Determining retry strategies
 * - Identifying trends (e.g., increasing rate limit errors)
 *
 * @param error - The error to classify
 * @returns An ErrorClassification string
 *
 * @example
 * ```typescript
 * const errorType = classifyError(error);
 * if (errorType === 'rate_limit') {
 *   await backoff(60000); // Wait before retry
 * }
 * ```
 */
export function classifyError(error: unknown): ErrorClassification {
  // Handle Error instances
  if (error instanceof TypeError) return 'type_error';
  if (error instanceof SyntaxError) return 'syntax_error';

  if (error instanceof Error) {
    const errorWithProps = error as Error & {
      code?: string;
      status?: number;
      statusCode?: number;
    };

    // Check error codes (Node.js style)
    if (errorWithProps.code) {
      switch (errorWithProps.code) {
        case 'ETIMEDOUT':
        case 'ESOCKETTIMEDOUT':
        case 'ECONNABORTED':
          return 'timeout';
        case 'ECONNREFUSED':
        case 'ECONNRESET':
        case 'ENOTFOUND':
        case 'ENETUNREACH':
          return 'connection';
        case 'EPARSE':
          return 'parse_error';
      }
    }

    // Check HTTP status codes
    const status = errorWithProps.status ?? errorWithProps.statusCode;
    if (status !== undefined) {
      if (status === 401) return 'unauthorized';
      if (status === 403) return 'forbidden';
      if (status === 404) return 'not_found';
      if (status === 429) return 'rate_limit';
      if (status >= 500 && status < 600) return 'server_error';
      if (status >= 400 && status < 500) return 'client_error';
    }

    // Check error message patterns
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'rate_limit';
    }
    if (message.includes('connection') || message.includes('network')) {
      return 'connection';
    }
    if (message.includes('parse') || message.includes('json') || name.includes('parse')) {
      return 'parse_error';
    }
    if (message.includes('transform') || name.includes('transform')) {
      return 'transform';
    }
    if (
      message.includes('database') ||
      message.includes('sqlite') ||
      message.includes('d1') ||
      name.includes('database')
    ) {
      return 'database';
    }
    if (
      message.includes('invalid') ||
      message.includes('validation') ||
      name.includes('validation')
    ) {
      return 'validation';
    }
  }

  return 'unknown';
}

// ============================================================================
// Polling Error Factory
// ============================================================================

/**
 * Create a structured polling error with full context.
 *
 * @param subscriptionId - The subscription that encountered the error
 * @param error - The error that occurred
 * @param context - Additional context for debugging
 * @returns A PollingError with full context
 *
 * @example
 * ```typescript
 * const pollingError = createPollingError(
 *   sub.id,
 *   error,
 *   { showId: sub.providerChannelId, operation: 'fetchEpisodes' }
 * );
 * errors.push(pollingError);
 * ```
 */
export function createPollingError(
  subscriptionId: string,
  error: unknown,
  context?: Record<string, unknown>
): PollingError {
  return {
    subscriptionId,
    error: serializeError(error),
    timestamp: Date.now(),
    errorType: classifyError(error),
    context,
  };
}

/**
 * Format a PollingError for legacy string-based error arrays.
 *
 * This provides backwards compatibility with existing code that expects
 * { subscriptionId: string, error: string } format while preserving
 * richer context in the error message.
 *
 * @param pollingError - The structured polling error
 * @returns A legacy format error object
 */
export function formatPollingErrorLegacy(pollingError: PollingError): {
  subscriptionId: string;
  error: string;
} {
  const { error, errorType, context } = pollingError;

  // Build a rich error string that includes type and context
  let errorString = `[${errorType}] ${error.type}: ${error.message}`;

  if (context) {
    const contextStr = Object.entries(context)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    errorString += ` (${contextStr})`;
  }

  return {
    subscriptionId: pollingError.subscriptionId,
    error: errorString,
  };
}
