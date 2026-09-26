/**
 * OPT-IN live checks against free public services (data.gov.il). `npm run test:live`.
 * Not part of CI or `npm run verify`.
 */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.live.test.ts'],
  transform: {
    '^.+\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },
  testTimeout: 60000,
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
