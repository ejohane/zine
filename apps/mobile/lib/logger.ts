/**
 * Development-Aware Logger for React Native
 *
 * Provides structured logging that adapts to the environment:
 * - Development: Colorful console output with full details
 * - Production: Silent or minimal logging (can be extended for crash reporting)
 *
 * Features:
 * - Log levels (debug, info, warn, error)
 * - Contextual logging with module prefixes
 * - Environment-aware output (verbose in dev, quiet in prod)
 * - Safe serialization of errors
 * - React Native compatible (no Node.js dependencies)
 *
 * @example
 * ```typescript
 * import { logger } from '@/lib/logger';
 *
 * logger.info('OAuth started', { provider: 'YOUTUBE' });
 * logger.error('Auth failed', { error: err });
 *
 * // With module context
 * const oauthLogger = logger.child('OAuth');
 * oauthLogger.info('Token received'); // [OAuth] Token received
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  /** Module name to prefix all log messages */
  module?: string;
  /** Minimum log level to output */
  minLevel?: LogLevel;
}

// ============================================================================
// Environment Detection
// ============================================================================

// Use a more defensive check for __DEV__ that works in both React Native and Node/Jest
const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV === 'development';

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
// Formatters
// ============================================================================

/**
 * Format an error for logging.
 */
function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

/**
 * Format data for console output.
 */
function formatData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) {
    return '';
  }

  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;

    if (key === 'error') {
      parts.push(`${key}=${formatError(value)}`);
    } else if (typeof value === 'object') {
      try {
        parts.push(`${key}=${JSON.stringify(value)}`);
      } catch {
        parts.push(`${key}=[Object]`);
      }
    } else {
      parts.push(`${key}=${value}`);
    }
  }

  return parts.length > 0 ? ` | ${parts.join(', ')}` : '';
}

// ============================================================================
// Logger Class
// ============================================================================

class Logger {
  private module?: string;
  private minLevel: LogLevel;

  constructor(options: LoggerOptions = {}) {
    this.module = options.module;
    // In production, only log warnings and errors
    // In development, log everything
    this.minLevel = options.minLevel ?? (IS_DEV ? 'debug' : 'warn');
  }

  /**
   * Check if a log level should be output.
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[this.minLevel];
  }

  /**
   * Format the module prefix.
   */
  private formatPrefix(): string {
    return this.module ? `[${this.module}] ` : '';
  }

  /**
   * Log a message.
   */
  private log(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const prefix = this.formatPrefix();
    const dataStr = formatData(data);
    const fullMessage = `${prefix}${msg}${dataStr}`;

    switch (level) {
      case 'debug':
        console.log(fullMessage);
        break;
      case 'info':
        console.log(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      case 'error':
        console.error(fullMessage);
        break;
    }
  }

  /**
   * Log a debug message.
   * Only outputs in development mode.
   */
  debug(msg: string, data?: Record<string, unknown>): void {
    this.log('debug', msg, data);
  }

  /**
   * Log an info message.
   * Outputs in development, silent in production.
   */
  info(msg: string, data?: Record<string, unknown>): void {
    this.log('info', msg, data);
  }

  /**
   * Log a warning message.
   * Outputs in both development and production.
   */
  warn(msg: string, data?: Record<string, unknown>): void {
    this.log('warn', msg, data);
  }

  /**
   * Log an error message.
   * Outputs in both development and production.
   * In production, consider sending to error tracking service.
   */
  error(msg: string, data?: Record<string, unknown>): void {
    this.log('error', msg, data);

    // TODO: In production, send to error tracking service like Sentry
    // if (!IS_DEV && data?.error) {
    //   Sentry.captureException(data.error);
    // }
  }

  /**
   * Create a child logger with a module prefix.
   *
   * @example
   * ```typescript
   * const authLogger = logger.child('Auth');
   * authLogger.info('Login started'); // [Auth] Login started
   *
   * const googleLogger = authLogger.child('Google');
   * googleLogger.info('OAuth redirect'); // [Auth:Google] OAuth redirect
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
 * import { logger } from '@/lib/logger';
 *
 * logger.info('App started');
 * logger.error('Something failed', { error: err });
 * ```
 */
export const logger = new Logger();

// ============================================================================
// Pre-configured Module Loggers
// ============================================================================

/**
 * Pre-configured loggers for common modules.
 */
export const authLogger = logger.child('Auth');
export const oauthLogger = logger.child('OAuth');
export const trpcLogger = logger.child('tRPC');
export const offlineLogger = logger.child('OfflineQueue');
export const syncLogger = logger.child('Sync');
export const settingsLogger = logger.child('Settings');

// ============================================================================
// Type Exports
// ============================================================================

export type { LoggerOptions };
