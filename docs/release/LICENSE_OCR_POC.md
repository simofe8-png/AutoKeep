# License-scan OCR proof of concept: on-device Tesseract (2026-09-29)

**Status: DEFERRED — future investigation required** (owner decision 2026-09-29).

- **Why:** the real-license experiment on the Galaxy A54 did not give acceptable recognition.
  Tesseract is **not** promoted to production architecture, and no other OCR provider is
  investigated, purchased or integrated now.
- **In the app:** normal builds offer no license scan and no measurement card.
  - `localLicenseOcr()` returns null unless the build is made with `EXPO_PUBLIC_OCR_POC=1`.
  - The method screen then shows manual entry only.
  - Vehicle identification is the working path: plate → data.gov.il → vehicle identification →
    confirmation.
- **Preserved for a future investigation:**
  - the native module `modules/license-ocr`;
  - the plate-candidate extractor and its tests;
  - the measurement card (POC builds only);
  - this report and `docs/release/evidence/license-ocr-poc/`.
- **Known cost:** the native module stays autolinked, so normal APKs still carry about 10 MB of
  dormant Tesseract code and data (§3). Excluding it from normal builds is a follow-up that needs a
  full native rebuild.

The sections below are the original POC record.

## 1. Pre-integration inspection

| Item                   | Finding                                                                                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration            | Local Expo module `modules/license-ocr` (Kotlin, Expo Modules API), autolinked from `./modules`. The React Native wrappers on npm are stale (last published 2022–2023) and were not used.                                                                                   |
| Engine                 | Tesseract4Android **4.9.0** (released 2025-06-11; last commit 2026-02-05; ~940 stars; not archived) = **Tesseract 5.5.1**, Leptonica 1.85.0, libjpeg 9f, libpng 1.6.48                                                                                                      |
| Licenses               | Tesseract4Android and Tesseract: Apache-2.0. Leptonica: BSD-2-Clause. libjpeg: IJG. libpng: PNG license. tessdata_fast: Apache-2.0. All permissive, and attribution is required in the app's notices before any release.                                                    |
| Artifact source        | JitPack only (`https://jitpack.io`, added via `expo-build-properties` `extraMavenRepos`). JitPack builds from the GitHub tag. **Supply-chain control:** the four packaged arm64 `.so` files were verified byte-identical (SHA-256) to the AAR inspected before integration. |
| Native dependencies    | `libtesseract.so` 4.16 MB, `libleptonica.so` 2.88 MB, `libjpeg.so` 0.25 MB, `libpngx.so` 0.22 MB (arm64). Java dependency: `androidx.annotation` only. The module uses `androidx.exifinterface` 1.4.1, which expo-image-picker already includes.                            |
| Manifest / permissions | The AAR manifest declares **no permissions**. The app's permission list is **identical** before and after (`aapt dump permissions` diff).                                                                                                                                   |
| Network / telemetry    | The Java classes contain no `java.net`, HTTP, socket, Firebase or analytics references. The native libraries contain no libcurl, socket or `getaddrinfo` symbols; the only URLs are XML schema and toolchain strings.                                                       |
| Trained data           | Must be bundled: `heb.traineddata` 961,404 B (sha256 `11f9e43a…`) and `eng.traineddata` 4,113,088 B (sha256 `7d4322bd…`), from tessdata_fast. They are copied on first use to `noBackupFilesDir`, so they are excluded from Android backup.                                 |
| Android                | minSdk 21; arm64-v8a packaged only (the same as the app)                                                                                                                                                                                                                    |
| Hebrew                 | Supported by Tesseract 5 (`heb`, LSTM). Measured below.                                                                                                                                                                                                                     |

## 2. Flow implemented (POC)

1. **Camera or gallery.** The camera or gallery image is passed to on-device OCR, which runs two
   passes:
   - `heb+eng`, automatic layout; if confidence is low, it retries at 90°/270°;
   - a **digits-and-dash-only** sparse pass.
2. **Plate candidates.** Candidates are extracted deterministically
   (`src/identification/plateCandidates.ts`):
   - **Strong:** 7 or 8 digits in the canonical dashed 2-3-2 / 3-2-3 form, or next to a plate
     label.
   - **Weak:** a bare run, or one letter-to-digit correction.
   - **Rejected:** runs of 9 or more digits (ID numbers), dates, digits inside alphanumeric tokens
     (VIN), and lines labelled as owner, ID or address.
3. **The captured image is deleted** from the app cache, and the in-memory reference is dropped.
4. **The plate screen:**
   - One strong candidate is pre-filled.
   - Ambiguous results are offered as choices, with nothing pre-selected.
   - When nothing is found, the field is empty. The user can confirm, correct or type the plate,
     or continue with manual entry.
5. **Consented data.gov.il lookup.** This is the existing "exact registry record" logic, and it
   fills the vehicle fields with registry provenance.
6. **The confirm screen, then save.** The plate is marked "scan" only if the user kept an OCR
   candidate unchanged; otherwise it is "user".
7. **OCR text is never authoritative, displayed, persisted or logged.** Only plate candidates leave
   the OCR function. The POC-only measurement card (`EXPO_PUBLIC_OCR_POC=1`) shows counts, yes/no
   registry matches and value-free "shapes" (digits → 9, letters → A/א).

## 3. APK impact

The builds are POC builds with Metro off and the measurement card on (it is off in normal builds).

| Build               | Commit    | Size (bytes) | SHA-256            |
| ------------------- | --------- | ------------ | ------------------ |
| Accepted baseline   | `ccfb4e4` | 49,287,720   | `26e67e98…215492`  |
| POC v1              | `bf56cab` | 59,330,556   | `27cd04cb…2e2e602` |
| POC v2 (digit pass) | `a565bea` | 59,331,860   | `ec7b37a2…8b8823c` |

**APK increase: +10.04 MB (+20.4%).**

## 4. Synthetic evaluation on the Galaxy A54 (standalone APK, no Metro)

**Test images.** The test images are SYNTHETIC license-like cards (`tools/synthetic-license.py`).
They carry a fake owner name, ID and address, and the vehicle facts of the public registry record 7788176. They are **not** a real license, and the result is optimistic compared with a real,
photographed card.

| Image                                            | Build | OCR time | Mean conf. | Plate result                                                  | Traffic during OCR |
| ------------------------------------------------ | ----- | -------- | ---------- | ------------------------------------------------------------- | ------------------ |
| Clean digital                                    | v1    | 678 ms   | 89         | **single, correct**                                           | 0 B                |
| "Photographed" (tilt, blur, noise, uneven light) | v1    | 843 ms   | 82         | **none**: plate line misread; empty field, manual entry works | 0 B                |
| Same, airplane mode                              | v1    | 853 ms   | 82         | none (identical)                                              | 0 B                |
| Clean digital                                    | v2    | 1,290 ms | 89         | **single, correct**                                           | 0 B                |
| "Photographed"                                   | v2    | 1,548 ms | 82         | **single, correct** (from the digit pass)                     | 0 B                |
| Same, airplane mode                              | v2    | 1,530 ms | 82         | single, correct (identical)                                   | 0 B                |

**Hebrew and Latin/digit usefulness.**

- Clean card: 13 of 13 lines contain Hebrew, and 8 of 10 labels were read.
- Photographed card: 14 of 15 lines contain Hebrew, and 10 of 10 labels were read.

**Registry values also present in the OCR text** (Y/N; the registry is authoritative either way):

| Field          | Clean | Photographed |
| -------------- | ----- | ------------ |
| Manufacturer   | Y     | Y            |
| Model          | Y     | Y            |
| Engine code    | Y     | Y            |
| Color (Hebrew) | Y     | Y            |
| VIN            | Y     | **N**        |
| Fuel (Hebrew)  | N     | Y            |
| Year           | **N** | **N**        |

Trim is not printed on the synthetic card. Conclusion: individual printed fields are not reliable
enough to trust, which supports the plate-first design.

**Wall-clock time** from picking the image to the plate screen was about 10 s. That includes the
system picker and the Samsung "Done" step; OCR itself took about 1.3–1.5 s.

## 5. Privacy verification

- **Network not required.** OCR in airplane mode produced results identical to online.
- **No outbound traffic.** The per-app counters (`dumpsys netstats`, uid 10316, forced poll) showed
  **0 bytes rx/tx** during every OCR run. The app was not signed in, so there was no sync. The only
  later traffic is the user-initiated data.gov.il lookup, which sends the plate only.
- **The image is local and released.** It is deleted from the app cache after OCR (`imageDeleted=Y`
  on-device). Only files inside the app cache are ever deleted, never a gallery original.
- **Recognized text is not logged.**
  - A full `logcat` capture across an OCR run (9,185 lines) has **0** hits for the plate, name, ID,
    address, VIN, engine code, model, color or the word SAMPLE.
  - Tesseract logs only "Initialized Tesseract API with language=heb+eng".
  - Unit tests spy on every console method, and none contains owner data.
- **Sensitive fields are not persisted.**
  - Owner name, ID and address are never extracted.
  - Lines with owner, ID or address labels are skipped for candidates.
  - The OCR lines exist only in memory until the plate screen, and are then dropped.
  - Tests assert that owner data never appears in the rendered UI, the draft or the logs.
- **No upload path.** Nothing in the flow writes the image or the text to Supabase, documents,
  backup or analytics. The app has no analytics or crash reporting.

## 6. Pending: the real-license test (owner action)

Requirements:

- the POC APK (v2, `a565bea`) installed on the A54;
- the owner photographs **their own** license through AutoKeep: "add vehicle" → "scan license" →
  the shutter;
- the POC card on the plate screen, which shows **no personal values**;
- nothing leaves the phone except the user-initiated plate lookup.

To record:

- plate success, failure or ambiguity, and whether a correction was needed;
- the OCR time;
- the Hebrew label count;
- the registry-match flags;
- the value-free shapes (if extraction fails).

## 7. Automated tests

- `plateCandidates.test.ts`: formats, labels, ID/date/VIN rejection, owner lines, letter
  confusion, ambiguity, the digit pass, and value-free shapes.
- `license-scan-ocr.test.tsx`:
  - single, corrected, ambiguous, none and OCR-failure flows;
  - registry after confirmation only;
  - owner data never on screen or in logs.
- `npm run verify`: 56 suites / 404 tests.
