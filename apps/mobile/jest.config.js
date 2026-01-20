/**
 * Jest Configuration for Zine Mobile App
 *
 * Uses ts-jest for pure TypeScript utility tests and hook tests.
 *
 * NOTE: React Native component tests require additional setup due to
 * bun's symlink structure with jest-expo. For now, utility and hook
 * tests are configured to run with appropriate mocks.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  // Match test files in lib/, hooks/, and components/
  testMatch: [
    '<rootDir>/lib/**/*.test.ts',
    '<rootDir>/hooks/**/*.test.ts',
    '<rootDir>/components/**/*.test.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          module: 'CommonJS',
          moduleResolution: 'node',
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@zine/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@zine/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
  },
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
};
