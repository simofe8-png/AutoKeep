# Environment & Secrets Conventions

- AutoKeep is local-first with no backend (ADR-0023): the app needs **no** environment variables,
  URLs or keys to run.
- `.env.example` documents the optional variables and is the only committed env file. `.env`,
  `.env.*` are git-ignored.
- **Client (`EXPO_PUBLIC_*`)**: embedded in the JS bundle, so it is public. The only one is
  `EXPO_PUBLIC_DEMO_DATA=1` (labeled prototype data instead of the on-device database).
- Release credentials (EAS token, Google Play service-account key) live outside the repository:
  `EXPO_TOKEN` as a GitHub repository secret, the Play key in `~/.autokeep`. They are never read by
  app code.
- CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run verify` and an Android JS bundle export.
  It needs no secrets.
- User backup files (`autokeep-backup-*.json`) contain all of a user's data and are git-ignored;
  never commit or upload one.
