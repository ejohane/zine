import type { TelemetryLevel } from '@zine/shared';

import { captureError } from '@/lib/error-tracking';

type LogLevel = TelemetryLevel;

type LogContext = Record<string, unknown>;

interface LoggerOptions {
  module?: string;
  minLevel?: LogLevel;
}

// __DEV__ is undefined in Jest.
const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV === 'development';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

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

function formatData(data?: LogContext): string {
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

class Logger {
  private module?: string;
  private minLevel: LogLevel;

  constructor(options: LoggerOptions = {}) {
    this.module = options.module;
    this.minLevel = options.minLevel ?? (IS_DEV ? 'debug' : 'warn');
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[this.minLevel];
  }

  private formatPrefix(): string {
    return this.module ? `[${this.module}] ` : '';
  }

  private log(level: LogLevel, msg: string, data?: LogContext): void {
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

  debug(msg: string, data?: LogContext): void {
    this.log('debug', msg, data);
  }

  info(msg: string, data?: LogContext): void {
    this.log('info', msg, data);
  }

  warn(msg: string, data?: LogContext): void {
    this.log('warn', msg, data);
  }

  error(msg: string, data?: LogContext): void {
    this.log('error', msg, data);

    const { error, ...rest } = data ?? {};
    captureError(error ?? msg, {
      message: msg,
      tags: this.module ? { module: this.module } : undefined,
      extra: rest,
      logger: 'logger',
    });
  }

  child(module: string): Logger {
    const childModule = this.module ? `${this.module}:${module}` : module;
    return new Logger({ module: childModule, minLevel: this.minLevel });
  }
}

export const logger = new Logger();
export const authLogger = logger.child('Auth');
export const oauthLogger = logger.child('OAuth');
export const trpcLogger = logger.child('tRPC');
export const offlineLogger = logger.child('OfflineQueue');
export const syncLogger = logger.child('Sync');
export const settingsLogger = logger.child('Settings');
