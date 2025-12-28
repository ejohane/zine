/**
 * Structured Logger for Cloudflare Workers
 *
 * Provides structured JSON logging that works with Cloudflare Workers Logs.
 * All logs are output as JSON for easy parsing in log aggregation systems.
 *
 * Features:
 * - Structured JSON output with consistent fields
 * - Log levels (debug, info, warn, error)
 * - Contextual logging with module prefixes
 * - Automatic timestamp and level inclusion
 * - Safe serialization of errors and circular references
 *
 * @example
 * ```typescript
 * import { logger } from './lib/logger';
 *
 * logger.info('Starting poll', { subscriptionCount: 5 });
 * logger.error('Poll failed', { error: err, subscriptionId: 'sub-123' });
 *
 * // With module context
 * const pollLogger = logger.child('poll');
 * pollLogger.info('Processing batch', { batchSize: 10 });
 * // Output: {"level":"info","module":"poll","msg":"Processing batch","batchSize":10,"ts":1234567890}
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  msg: string;
  module?: string;
  ts: number;
  [key: string]: unknown;
}

interface LoggerOptions {
  /** Module name to prefix all log messages */
  module?: string;
  /** Minimum log level to output (default: 'info' in production, 'debug' in development) */
  minLevel?: LogLevel;
}

// ============================================================================
// Log Level Ordering
// ============================================================================

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ============================================================================
// Safe Serialization
// ============================================================================

/**
 * Safely serialize a value for JSON logging.
 * Handles errors, circular references, and non-serializable values.
 */
function safeSerialize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  // Handle Error objects specially
  if (value instanceof Error) {
    const errorObj: Record<string, unknown> = {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
    // Include any additional properties on the error
    const errorAsRecord = value as unknown as Record<string, unknown>;
    for (const key of Object.keys(errorAsRecord)) {
      if (!(key in errorObj)) {
        errorObj[key] = errorAsRecord[key];
      }
    }
    return errorObj;
  }

  // Handle primitive types
  if (typeof value !== 'object') {
    return value;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(safeSerialize);
  }

  // Handle objects - recursively serialize
  const serialized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    try {
      serialized[key] = safeSerialize(val);
    } catch {
      serialized[key] = '[Unserializable]';
    }
  }
  return serialized;
}

/**
 * Format data object for logging, handling edge cases.
 */
function formatData(data?: Record<string, unknown>): Record<string, unknown> {
  if (!data) return {};

  const formatted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    // Skip undefined values
    if (value === undefined) continue;

    // Handle 'error' key specially for better formatting
    if (key === 'error' && value instanceof Error) {
      formatted.error = safeSerialize(value);
    } else {
      formatted[key] = safeSerialize(value);
    }
  }
  return formatted;
}

// ============================================================================
// Logger Class
// ============================================================================

class Logger {
  private module?: string;
  private minLevel: LogLevel;

  constructor(options: LoggerOptions = {}) {
    this.module = options.module;
    // Default to 'debug' to capture all logs - Cloudflare handles filtering
    this.minLevel = options.minLevel ?? 'debug';
  }

  /**
   * Check if a log level should be output.
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[this.minLevel];
  }

  /**
   * Format and output a log entry.
   */
  private log(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      msg,
      ts: Date.now(),
      ...formatData(data),
    };

    if (this.module) {
      entry.module = this.module;
    }

    const output = JSON.stringify(entry);

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Log a debug message.
   * Use for detailed debugging information that's not needed in production.
   */
  debug(msg: string, data?: Record<string, unknown>): void {
    this.log('debug', msg, data);
  }

  /**
   * Log an info message.
   * Use for normal operational messages.
   */
  info(msg: string, data?: Record<string, unknown>): void {
    this.log('info', msg, data);
  }

  /**
   * Log a warning message.
   * Use for potentially problematic situations that don't prevent operation.
   */
  warn(msg: string, data?: Record<string, unknown>): void {
    this.log('warn', msg, data);
  }

  /**
   * Log an error message.
   * Use for errors that need attention.
   */
  error(msg: string, data?: Record<string, unknown>): void {
    this.log('error', msg, data);
  }

  /**
   * Create a child logger with a module prefix.
   * Use to group related log messages.
   *
   * @example
   * ```typescript
   * const pollLogger = logger.child('poll');
   * pollLogger.info('Starting'); // {"level":"info","module":"poll","msg":"Starting",...}
   *
   * const ytLogger = pollLogger.child('youtube');
   * ytLogger.info('Fetching'); // {"level":"info","module":"poll:youtube","msg":"Fetching",...}
   * ```
   */
  child(module: string): Logger {
    const childModule = this.module ? `${this.module}:${module}` : module;
    return new Logger({ module: childModule, minLevel: this.minLevel });
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Default logger instance.
 *
 * @example
 * ```typescript
 * import { logger } from './lib/logger';
 *
 * logger.info('Server started', { port: 8080 });
 * logger.error('Request failed', { error: err, requestId: 'abc' });
 * ```
 */
export const logger = new Logger();

// ============================================================================
// Pre-configured Module Loggers
// ============================================================================

/**
 * Pre-configured loggers for common modules.
 * Import these directly for convenience.
 */
export const pollLogger = logger.child('poll');
export const authLogger = logger.child('auth');
export const webhookLogger = logger.child('webhook');
export const ingestionLogger = logger.child('ingestion');
export const healthLogger = logger.child('health');
export const quotaLogger = logger.child('quota');

// ============================================================================
// Type Exports
// ============================================================================

export type { LogEntry, LoggerOptions };
