/**
 * Cloud integration tests against the LOCAL Supabase stack (`npx supabase start`).
 * Run with `npm run test:cloud`. Not part of `npm run verify` because it needs Docker;
 * it is part of the M07/M09/M22 milestone gates.
 *
 * Plain Node environment (no jest-expo preset): the RN preset replaces `fetch` with mocks, which
 * would make these tests talk to nothing. They must hit the real local stack.
 */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.cloud.test.ts'],
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },
  setupFilesAfterEnv: ['<rootDir>/jest.cloud.setup.ts'],
  testTimeout: 60000,
  maxWorkers: 1,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
