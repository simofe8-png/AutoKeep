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

## Round 3 (2026-09-27): phone on Wi-Fi, camera allowed

| Check                                                       | Result                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Real online registry lookup (data.gov.il) from the phone | PASS: a real plate taken from the public dataset returned several matching records (BYD ATTO 3, 2022–2025). The app asked the user to choose instead of guessing the year; the choice filled make, model, year, trim and fuel, and the typed plate stayed as entered. The flow was left without saving (still 1 vehicle)                                       |
| 2. Camera capture → stored original                         | **FAIL, then fixed, then PASS** (see defect 6). After the fix: Samsung camera → review with the photo as the original → saved with "מסמך מוסך"; document detail shows the image with integrity "זהה לקובץ שנשמר"; still intact after force-stop and relaunch; the backup copy in the private bucket (955,384 B) hashes to the recorded SHA-256 `757282c5…17e8` |
| 3. A scheduled reminder fires                               | PASS: see the fixture note below. Alert raised ('טיפול מתקרב', 750 km); the OS alarm was `RTC_WAKEUP` 2026-09-27 09:00 (quiet hours 21–09, 1 h window); **posted at 09:49** with title "Toyota Corolla 2019 · טיפול מתקרב" on channel `maintenance`; tapping it opened that vehicle's alert detail (why: 750 km left)                                          |

### Defect 6: saving anything dated "today" failed between 00:00 and 03:00 Israel time

At 02:34 local time, both the camera save and a file-picker save failed. Isolation showed it was
not the camera: the domain compared the date with the UTC date of the confirmation time, which is
still yesterday for the first hours of a day east of UTC. Services, odometer readings, onboarding
and snooze were all affected. The fix: the domain takes the user's local `today` from the store's
clock; UTC is only a fallback. `localDate.test.ts` fails on the old code and passes on the new
(2/2). This required a rebuild: APK `1a2494da…e0a7`, installed as an upgrade with data kept.

### Test fixture for check 3, and removal

No verified schedule exists, because no official source is approved yet, and the engine raises
maintenance alerts only for a verified schedule. So a **synthetic fixture schedule** was inserted
on the local backend for the test vehicle only and synced to the phone. It was labeled on every
visible string: "נתוני בדיקה (RC) — לא נתוני יצרן", `manufacturerText: TEST FIXTURE — not
manufacturer data`. It was never treated as manufacturer data. It was removed afterwards by
permanently deleting the whole test vehicle (fake plate 12-345-67) through the app, on the phone
and, through sync, on the server. Schedules are append-only, so the vehicle deletion is the only
removal path.

### Defect 7: permanent deletion left the vehicle's originals in the backup

After the test vehicle was deleted, the server rows were gone (cascade plus tombstone), but **both
originals, including the camera photo, stayed in the private bucket**. Storage RLS only allows
access while the vehicle row exists, so the user could never remove them afterwards, even though
the dialog promises "מחיקה סופית של כלי הרכב וכל הנתונים שלו".

The fix: before pushing a vehicle deletion, sync removes `<user>/<vehicle>/*` through the Storage
API. If that fails, the deletion is not pushed and the next sync retries both. Tests:
`account.cloud.test` (real local stack; fails on the old code with 1 object left, passes with 0) and `deleteOriginals.test` (a failed removal keeps the deletion queued). The two orphaned
objects from this run were removed with the local service role, and their files are confirmed
gone from the storage volume.

### Round 4: final APK (sha256 `55225603…700e`), installed as an upgrade

| Check                                        | Result                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permanent deletion with a backed-up original | PASS: a test vehicle "RCTEST Delete" with an attached invoice was backed up (1 object), deleted permanently on the phone (the preview listed exact counts; the plate had to be typed), then synced: the server holds 0 vehicles, 0 documents, 0 storage objects and 0 files on the storage volume |

**Minor, not blocking:** pressing the registry lookup with an empty plate field shows "not found"
instead of "enter a plate". Nothing is sent that could identify anyone.

## Cleanup after acceptance

- Test vehicles (including the synthetic fixture schedule, the camera photo and the test invoices)
  were deleted through the app, on the phone and on the local server.
- Orphans from defect 7 were removed. The local test account `rc-a54@autokeep.test` and its
  mail-catcher messages were deleted.
- The phone was signed out; the test PDF was removed from Downloads; adb port forwarding was
  cleared. The RC app stays installed with no data. Camera and notification permissions stay as
  the user set them.
- Screenshots showing the camera view were deleted.

## Previously not exercised

All three were exercised in round 3 (see above) and passed.
