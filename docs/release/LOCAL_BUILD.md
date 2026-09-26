# Zero-cost local Android release build: attempt log (G3, ADR-0018 amendment)

**Why:** the free EAS plan's Android builds for September 2026 were used up (reset 2026-10-01),
and the paid Starter plan was declined under the zero-cost rule. The project path contains Hebrew
characters (ADR-0005), and every native tool that canonicalizes paths fails on it.

**Target:** `APP_VARIANT=rc-local` release APK, arm64-v8a, signed with the debug key. It is for
device testing only and never for store upload.

| #   | Setup                                                         | Result                                                                                                                                             | Diagnosis                                                                                  |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | `subst K:` drive for the project                              | Autolinking: "Couldn't find package.json up from K:\\"                                                                                             | Node resolves the subst drive root inconsistently                                          |
| 2   | Junctions `C:\ak` (project), `C:\ak-sdk`, `C:\ak-jdk`         | `settings.gradle` included build resolved through the real Hebrew path                                                                             | Node realpath of the junction                                                              |
| 3   | + `NODE_OPTIONS=--preserve-symlinks --preserve-symlinks-main` | Kotlin DSL: "Unresolved reference 'plugins'", even in a trivial probe                                                                              | `GRADLE_USER_HOME` under the junction                                                      |
| 4   | + `GRADLE_USER_HOME=C:\ak-gradle` (a real ASCII directory)    | Kotlin DSL fixed; netinfo "project directory does not exist" at a garbled `C:\Users\�?שייה\…` path                                                 | Autolinking reports real paths, and Gradle decodes the child output in the wrong code page |
| 5   | Real ASCII **project copy** `C:\akb` (robocopy)               | Configuration and Java/Kotlin compile pass (199 tasks). CMake: cannot start `C:\Users\�?שייה\AppData\Local\Android\Sdk\cmake\3.22.1\bin\ninja.exe` | CMake canonicalizes the SDK **junction** back to its Hebrew real path                      |

**Retry budget exhausted (5/5).** Remaining hypothesis, with high confidence: every path is now
ASCII except the SDK.

## Safest next actions

**Option A.** Make `C:\ak-sdk` a real directory holding a copy of the SDK subset the build uses:
`cmake/3.22.1`, `ndk/<version>`, `build-tools`, `platforms`, `platform-tools`. Then re-run step 5.

- Cost: several GB of disk, reversible by deleting the directory.
- Alternative: install the SDK to an ASCII path through `sdkmanager --sdk_root=C:\ak-sdk-real`.

**Option B.** On or after 2026-10-01, when the free EAS quota resets, run
`npx eas-cli@latest build --profile rc-local --platform android`. It builds in the cloud, so the
path problem does not arise.

## Cleanup when done (reversible)

`rmdir C:\ak C:\ak-sdk C:\ak-jdk` (junctions only) and delete `C:\akb` and `C:\ak-gradle`.
