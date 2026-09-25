// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: [
      'dist/*',
      '.expo/*',
      'coverage/*',
      'supabase/.temp/*',
      'AutoKeep_Bootstrap_Package/*',
    ],
  },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // The domain and engine are pure TypeScript: no UI, platform or I/O dependencies.
    files: [
      'src/domain/**/*.ts',
      'src/engine/**/*.ts',
      'src/identification/**/*.ts',
      'src/discovery/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'react',
            'react-native',
            'react-native-*',
            'expo',
            'expo-*',
            '@expo/*',
            '@/ui*',
            '@/features/*',
            '@/app/*',
          ],
        },
      ],
    },
  },
  {
    files: ['tools/**/*.mjs', '*.config.js', 'jest.setup.ts'],
    rules: { 'no-console': 'off' },
  },
]);
