# Staging OTA updates

Owner decision 2026-10-06: one test installation on the owner's phone receives every JS/TS/asset
change as an over-the-air update (EAS Update). New installs are not needed.

## How it is set up

| Item            | Value                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package         | `com.moshenahum.autokeep` (the app installed from Play Internal testing)                                                                                |
| Update channel  | `staging` (build profile `staging-internal`). The `production` profile is bound to channel `production`, and nothing is ever published to it from here. |
| Runtime version | `runtimeVersion.policy: fingerprint`: a hash of the native project. It changes with any native code or native config change.                            |
| Backend         | EAS environment `production` (the owner's account and backup), for the build and for updates                                                            |
| Delivery        | `staging-internal` builds go to Google Play **Internal testing** only (submit profile `staging-internal`, track `internal`)                             |

The app checks for an update every time it starts. It downloads the update and runs it on the
next start. Settings → "אודות" shows the channel and the running update. Tapping it checks now
and restarts into a newer update.

## Publishing an update

Automatic: every push to `master` runs CI (format, lint, typecheck, all tests). Only when CI
passes, the workflow `.github/workflows/staging-update.yml` runs
`node tools/ota-staging.mjs --message "<sha> <subject>"`. The token comes from the repository
secret `EXPO_TOKEN`.

Manual (same checks):

```
node tools/ota-staging.mjs --message "what changed"
```

The script publishes only to `staging`. That is equivalent to
`eas update --channel staging --environment production --platform android`.

## When a new build is required

Before publishing, `tools/ota-staging.mjs` compares the commit's runtime fingerprint with the
finished `staging-internal` builds. Without a match (a native module, a config plugin or native
app.json/eas.json settings changed), it **stops with exit code 2** and prints "new build
required". Nothing is published. EAS also never delivers an update to a build with a different
runtime version.

New build (owner approval required for each build):

```
npx eas-cli@latest build --platform android --profile staging-internal --non-interactive --wait
npx eas-cli@latest submit --platform android --profile staging-internal --id <build id> --non-interactive --wait
node tools/play-track-status.mjs internal
node tools/play-track-status.mjs production   # must be unchanged
```

Verify the AAB as in `PLAY_INTERNAL_RELEASE.md` §3.

## One-time owner steps

1. Create an Expo access token: expo.dev → Account settings → Access tokens. A robot token is
   enough.
2. Add it on GitHub: `simofe8-png/AutoKeep` → Settings → Secrets and variables → Actions →
   New repository secret, named `EXPO_TOKEN`. Never commit the token or paste it in chat.
