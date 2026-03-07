import { expect, vi } from 'vitest';

type ExpectedLoggerCall = [message: unknown, data?: unknown];

let consumedErrorCalls = 0;

function createMockLogger() {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };

  logger.child.mockImplementation(() => logger);

  return logger;
}

export const mockLogger = createMockLogger();

export function resetMockLogger(): void {
  consumedErrorCalls = 0;
  mockLogger.debug.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
  mockLogger.child.mockClear();
}

export function expectLoggerErrorCalls(expectedCalls: ExpectedLoggerCall[]): void {
  const actualCalls = mockLogger.error.mock.calls.slice(consumedErrorCalls);

  expect(actualCalls).toHaveLength(expectedCalls.length);

  expectedCalls.forEach(([message, data], index) => {
    expect(actualCalls[index]?.[0]).toEqual(message);
    if (data !== undefined) {
      expect(actualCalls[index]?.[1]).toEqual(data);
    }
  });

  consumedErrorCalls += expectedCalls.length;
}

export function assertNoUnexpectedLoggerErrors(): void {
  const unexpectedCalls = mockLogger.error.mock.calls.slice(consumedErrorCalls);
  if (unexpectedCalls.length === 0) {
    return;
  }

  const formattedCalls = unexpectedCalls
    .map((call) =>
      call
        .map((value) => {
          if (typeof value === 'string') {
            return value;
          }

          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        })
        .join(' | ')
    )
    .join('\n');

  throw new Error(`Unexpected logger.error calls:\n${formattedCalls}`);
}

export const mockLoggerModule = {
  logger: mockLogger,
  pollLogger: mockLogger,
  authLogger: mockLogger,
  webhookLogger: mockLogger,
  ingestionLogger: mockLogger,
  healthLogger: mockLogger,
  quotaLogger: mockLogger,
};
