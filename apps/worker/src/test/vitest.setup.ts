import { afterEach, beforeEach, vi } from 'vitest';
import { assertNoUnexpectedLoggerErrors, mockLoggerModule, resetMockLogger } from './mock-logger';

// Silence structured logger output during worker tests unless a suite opts into
// its own local mock. Tests can still assert on the shared spy methods.
vi.mock('../lib/logger', () => mockLoggerModule);

beforeEach(() => {
  resetMockLogger();
});

afterEach(() => {
  assertNoUnexpectedLoggerErrors();
});
