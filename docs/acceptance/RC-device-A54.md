# RC device acceptance: Galaxy A54 (release build, 2026-09-26)

**Device:** Samsung Galaxy A54 (SM-A546E), Android, over USB/adb. **No network on the phone**
(no Wi-Fi or cellular connection; the default network was `none`).

**Build:** `APP_VARIANT=rc-local` release APK, arm64-v8a, versionName 1.0.0 / versionCode 1,
targetSdk 36. It is signed with the debug key, for device testing only. The build is local, from
ASCII copies (ADR-0018 amendment, `docs/release/LOCAL_BUILD.md`). The backend is the local
Supabase stack through `adb reverse tcp:56621`, with cleartext allowed only to 127.0.0.1 and
localhost.

## Round 1: first release APK (sha256 `137d3842…84df`)

| Check                                                                         | Result                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install and cold launch                                                       | PASS: `MainActivity` resumed, onboarding shown                                                                                                                                                                                                                  |
| Native RTL (Hebrew text, TextInput alignment, segmented control, headers)     | PASS: every input is right-aligned, including Latin and numbers; the layout mirrors                                                                                                                                                                             |
| Manual vehicle onboarding (kind, maker, model, year, engine, plate, odometer) | PASS: the plate is formatted `12-345-67`; each field is labeled "הוזן ידנית"                                                                                                                                                                                    |
| Registry lookup with no network                                               | PASS: the button is disabled, with "אין חיבור לרשת — אפשר להמשיך". Consent text shown                                                                                                                                                                           |
| Official-source search, empty registry, offline                               | PASS: "לא ניתן לאמת"; no maintenance recommendations without a verified source                                                                                                                                                                                  |
| Home: pending and unavailable states distinct, offline banner                 | PASS                                                                                                                                                                                                                                                            |
| Manual service entry (first-class)                                            | PASS: checkbox = performed, independent action type, "לא מלוח היצרן", confirm dialog names the vehicle; history shows "דיווח משתמש" and "ממתין לאימות"                                                                                                          |
| Persistence across force-stop and relaunch                                    | PASS                                                                                                                                                                                                                                                            |
| Invoice file attachment without OCR (system picker, PDF)                      | PASS: "קריאה אוטומטית … אינה זמינה עדיין", the original is linked, the user fills in the details; validation requires one action; saved with "מסמך מוסך"                                                                                                        |
| Notifications (not possible in Expo Go)                                       | PASS: the OS permission prompt appears, the permission is granted, the toggle is on and the app is stable. No reminder is scheduled because no verified schedule exists, so there are no alerts (delivery is covered by `multi-vehicle` and notification tests) |
| Camera permission sheet dismissed with Back (hung in Expo Go)                 | PASS: resolves to "אין הרשאה לשימוש במצלמה…", with upload and manual still available. The permission stayed **not granted** (user decision), so camera capture storage itself was not exercised; the file-picker path uses the same original-storage code       |
| Account and backup                                                            | **FAIL, fixed**: "גיבוי בענן אינו זמין בגרסה זו"                                                                                                                                                                                                                |

### Defects found and fixed

1. **Cloud configuration missing from every release build.** `readClientEnv` read
   `EXPO_PUBLIC_*` from a `process.env` object, but release bundles only inline literal
   `process.env.EXPO_PUBLIC_X` expressions. The Hermes bundle carried the property name but no URL,
   so account and backup were silently off. The fix spells out each variable. The regression test
   `src/config/__tests__/env.bundle.test.ts` runs the production Babel transform; it fails on the
   old code and passes on the new.
2. **The photo entry promised extraction V1 doesn't have** ("AutoKeep יחלץ טיוטה"). Without an
   invoice reader it now reads: "התמונה נשמרת כמקור ומקושרת לטיפול; את הפרטים ממלאים בעצמכם."
   Asserted in `service-capture.test.tsx`.
3. **The original-document chip clipped its title** ("…9.2026"). The text now shrinks and wraps
   to 2 lines.
4. **Least privilege:** library-merged `USE_BIOMETRIC`, `USE_FINGERPRINT` (androidx.biometric)
   and `c2dm.RECEIVE` (firebase-messaging) are blocked. V1 uses neither biometrics nor remote push.
5. "AutoKeep V1 (אב-טיפוס)" in About is now "AutoKeep V1".

**Reviewed and kept:** a service entered from an attached invoice shows "מאומת · מסמך מוסך". That is
the approved design (`service_performed` ← `garage_document`, and only when an original invoice
is attached). The claim rests on the stored original, which the user confirmed field by field.

## Round 2: rebuilt APK (sha256 `3fa0813c…7059`), installed as an upgrade

| Check                                                      | Result                                                                                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Upgrade install keeps data                                 | PASS: both service events still present                                                                                                                                        |
| Cloud config in the bundle                                 | PASS: the backend URL is present in the Hermes bundle                                                                                                                          |
| Permissions                                                | PASS: CAMERA and POST_NOTIFICATIONS remain; biometric, fingerprint and c2dm are gone. Storage, location, microphone and overlay stay blocked                                   |
| Optional account: e-mail code sign-in on the release build | PASS: code requested, delivered to the local mail catcher, entered on the phone; signed in                                                                                     |
| Backup from the release build                              | PASS: the server holds 1 vehicle, 2 service events, 1 document and 1 original in the private bucket, whose SHA-256 (`5beb6492…d514`, 618 B) equals the PDF picked on the phone |
| Notifications after the c2dm block                         | PASS: toggles off and on, app stable                                                                                                                                           |
| Photo entry copy with no reader                            | PASS: "התמונה נשמרת כמקור … ממלאים בעצמכם"                                                                                                                                     |
| Original-document chip                                     | PASS: full title "חשבונית טיפול — 26.9.2026", wrapped                                                                                                                          |
| Abandoned draft                                            | PASS: leaving the review saves nothing (history still 2)                                                                                                                       |
| About                                                      | PASS: "AutoKeep V1"                                                                                                                                                            |

## Not exercised on the device (device state, not app defects)

| Check                             | Why                                                                                           | Other evidence                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Successful online registry lookup | The phone has **no network** (default network `none`)                                         | `npm run test:live` 1/1 against the real data.gov.il API; the offline state was verified on the device  |
| Camera capture → original storage | Camera permission stays **not granted** (user decision)                                       | The same original-storage path was verified on the device with a picked PDF; `service-capture.test.tsx` |
| A reminder notification firing    | No verified schedule exists, so there are no alerts (registry entries pending human approval) | `multi-vehicle` T136, notification plan tests                                                           |

To close these, connect the phone to Wi-Fi and allow the camera for AutoKeep, then repeat the
lookup and a photo capture. That takes about 10 minutes and needs no rebuild.
