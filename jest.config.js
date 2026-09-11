/**
 * Pure-logic unit tests only (money, dates, renewal, import parsing).
 * These files import nothing from React Native, which is deliberate — the
 * risky code in this app is all pure functions and should be testable
 * without a native runtime.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
};
