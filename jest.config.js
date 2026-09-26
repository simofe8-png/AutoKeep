/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Router-tree renders transform the route files lazily on first render: on a clean clone (cold
  // transform cache) a single UI test legitimately takes far longer than warm (reproduced with
  // --no-cache: 20 s was not enough). Warm runs are unaffected.
  testTimeout: 90000,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Cloud (local Supabase) and live (public internet) suites run via their own configs.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/AutoKeep_Bootstrap_Package/',
    '\\.(cloud|live)\\.test\\.ts$',
  ],
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}', '!src/app/**'],
};
