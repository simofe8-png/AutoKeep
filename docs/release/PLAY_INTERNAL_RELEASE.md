# Google Play Internal Testing release procedure

Owner decision 2026-10-05: new AutoKeep versions go to Google Play **Internal testing** through an
automated path. **Never Production.** Releasing to Internal testing is approved for this path. Any
other track, a Production release, or a change of permissions is still an owner approval gate.

## One-time setup (done 2026-10-05)

| Item                | Value                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package             | `com.moshenahum.autokeep`                                                                                                                                                                      |
| EAS project         | `@vr47252/autokeep` (`d243d46c-a4fb-4232-b17d-ae39b158b3a8`)                                                                                                                                   |
| Version source      | EAS remote (`appVersionSource: remote`); the `production` build profile auto-increments `versionCode`                                                                                          |
| Signing             | EAS-managed upload keystore (created 2026-10-01; certificate SHA-256 starts `82:B0:78:9F`)                                                                                                     |
| Submit profile      | `eas.json` → `submit.production.android`: `track: internal`, `releaseStatus: completed`                                                                                                        |
| Service account     | `autokeep-play-release@autokeep-play-release.iam.gserviceaccount.com` (Google Cloud project `autokeep-play-release`)                                                                           |
| Service-account key | `C:/Users/משייה/.autokeep/play-service-account.json`, **outside the repository**; key file patterns are git-ignored                                                                            |
| Google Cloud        | API **Google Play Android Developer API** enabled in the project that owns the service account                                                                                                 |
| Play Console        | The service account is invited under **Users and permissions** with access to AutoKeep only: **Release apps to testing tracks** (and the default view access). **No** "Release to production". |

Never commit, print, or copy the key's contents. If the key leaks: delete it in Google Cloud
(**Service accounts → Keys**), create a new one, and replace the local file.

## Each release

Run from the project root. Each step must pass before the next one.

1. **Verify the code:** `npm run verify` (format, lint, typecheck, all tests) on a clean,
   committed tree.
2. **Build** (versionCode increments remotely):
   `npx eas-cli@latest build --platform android --profile production --non-interactive --wait --json`
   Record the build id and the new `appBuildVersion` (versionCode).
3. **Verify the AAB:** download the artifact into
   `C:/Users/משייה/Desktop/PRO/AutoKeep-builds/` (outside the repository), then:
   - `jarsigner -verify <file>.aab` prints `jar verified`;
   - `keytool -printcert -jarfile <file>.aab` shows the same certificate (SHA-256 `82:B0:78:9F…`);
   - `base/manifest/AndroidManifest.xml` has package `com.moshenahum.autokeep` and the expected
     versionCode;
   - record the sha256 of the file.
4. **Submit to Internal testing:**
   `npx eas-cli@latest submit --platform android --profile production --id <build id> --non-interactive --wait`
   The command uses only the `production` submit profile (track `internal`). Never pass
   `--track production`, and never change the submit profile's track.
5. **Verify:** the submission ends with `Submitted your app to Google Play Store!`, then
   `node tools/play-track-status.mjs internal` shows the new versionCode with status `completed`,
   and `node tools/play-track-status.mjs production` is unchanged (read-only; the script opens a
   Play edit only to read and then deletes it).
6. **Record** the version, build id, commit, sha256 and result in `CURRENT_STATUS.md` and
   `task-plan.md`.

## History

| versionCode | Commit    | EAS build                              | Track            | Result                                                                                                                          |
| ----------- | --------- | -------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 2           | `bec73cd` | (2026-10-01)                           | Internal testing | uploaded by the owner                                                                                                           |
| 3           | `ea2cd93` | `4f2bff7a-8e4e-4690-8218-e495b472db43` | Internal testing | released (completed) 2026-10-05 via EAS Submit `f06979e2-3b3f-42ca-ba1c-a8b9d8279c31`; production track empty                   |
| 4           | `6ebf064` | `c890d971-c702-4c98-b59a-12943b3e80a4` | Internal testing | released (completed) 2026-10-05 via EAS Submit `18bcfb9b-83d9-4783-83ed-9ffa423e9670`; sha256 95af9270…; production track empty |
| 5           | `c32552a` | `f475b6c5-4866-4ae4-a547-bc0d9ed5192f` | Internal testing | released (completed) 2026-10-05 via EAS Submit `24a8b118-fd0e-4100-8f17-eaa48175870b`; sha256 557b929b…; production track empty |
