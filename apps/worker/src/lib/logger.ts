import type { JsonObject, JsonValue, TelemetryLevel } from '@zine/shared';

type LogLevel = TelemetryLevel;

type LogContext = Record<string, unknown>;

interface LoggerOptions {
  module?: string;
  minLevel?: LogLevel;
}

type LogEntry = JsonObject & {
  level: LogLevel;
  msg: string;
  module?: string;
  ts: number;
};

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function safeSerialize(value: unknown): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Error) {
    const errorObj: JsonObject = {
      name: value.name,
      message: value.message,
    };
    if (value.stack) {
      errorObj.stack = value.stack;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) {
        continue;
      }
      if (!(key in errorObj)) {
        errorObj[key] = safeSerialize(entry);
      }
    }
    return errorObj;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(safeSerialize);
  }

  const serialized: JsonObject = {};
  for (const [key, val] of Object.entries(value)) {
    if (val === undefined) {
      continue;
    }
    try {
      serialized[key] = safeSerialize(val);
    } catch {
      serialized[key] = '[Unserializable]';
    }
  }
  return serialized;
}

function formatData(data?: LogContext): JsonObject {
  if (!data) return {};

  const formatted: JsonObject = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;

    if (key === 'error' && value instanceof Error) {
      formatted.error = safeSerialize(value);
    } else {
      formatted[key] = safeSerialize(value);
    }
  }
  return formatted;
}

class Logger {
  private module?: string;
  private minLevel: LogLevel;

  constructor(options: LoggerOptions = {}) {
    this.module = options.module;
    this.minLevel = options.minLevel ?? 'debug';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[this.minLevel];
  }

  private log(level: LogLevel, msg: string, data?: LogContext): void {
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
  }

  child(module: string): Logger {
    const childModule = this.module ? `${this.module}:${module}` : module;
    return new Logger({ module: childModule, minLevel: this.minLevel });
  }
}

export const logger = new Logger();
export const pollLogger = logger.child('poll');
export const authLogger = logger.child('auth');
export const webhookLogger = logger.child('webhook');
export const ingestionLogger = logger.child('ingestion');
export const healthLogger = logger.child('health');
export const quotaLogger = logger.child('quota');
