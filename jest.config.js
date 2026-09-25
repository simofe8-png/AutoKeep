/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Router-tree renders on Windows CI/dev machines can exceed the 5s default on a cold cache.
  testTimeout: 20000,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/AutoKeep_Bootstrap_Package/'],
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}', '!src/app/**'],
};
