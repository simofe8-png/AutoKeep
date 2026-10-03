# Vehicle image: approved model references and the image UX (2026-09-29)

Scope: the owner-approved SEAT Ibiza 6J implementation only; the catalog is **not** expanded.
Research and rights evidence: `VEHICLE_IMAGE_RESOLVER_RESEARCH.md` (§4).

## 1. Display priority

1. The user's own vehicle photo. It is device-local, keyed by `vehicle_id`, and always wins.
2. A verified model reference photo for the vehicle's identity class, with its license credit
   (tap → source and license). **No visible "תמונת דגם להמחשה" label** (owner decision
   2026-09-29); the catalog records keep `display.label` as provenance.
3. An illustration using the known vehicle color. None is approved yet (the preview was rejected),
   so this level is skipped.
4. The neutral illustration ("איור כללי · לא תמונת הרכב שלך").

## 2. States of the vehicle image area (distinct, never conflated)

| State                          | When                                                                                    | UI (Hebrew as specified by the owner)                                                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Searching                      | The catalog lookup or image download is pending                                         | Spinner + "מחפש תמונה מתאימה לכלי הרכב שלך..." + "זה עשוי להימשך מספר שניות". Non-blocking. **15 s timeout** → can't search now.                                                              |
| Found                          | An approved record exists for the exact class                                           | The image + credit (author · license · Wikimedia Commons · "הרקע הוסר על ידי AutoKeep")                                                                                                       |
| Ambiguous identity             | Exterior phase unknown (no high-confidence registry rule)                               | "איזו מהן דומה לרכב שלך?" with both approved fronts, plus "לא בטוח". The answer is stored as `exterior_phase` (source `user`) and synced. "לא בטוח" shows the illustration and is remembered. |
| No suitable image              | Nothing approved for the class, or the vehicle is out of scope                          | "לא מצאנו תמונת דגם מתאימה" / "צלם את כלי הרכב שלך או בחר תמונה מהגלריה, ואנחנו נשתמש בה כתמונת כלי הרכב." with "צלם עכשיו", "בחר מהגלריה" and the non-blocking "לא עכשיו" (remembered)       |
| Connectivity / service failure | Lookup failed, download failed, hash mismatch, or timeout (and no cached approved copy) | "לא ניתן לחפש תמונה כרגע" + "נסה שוב", plus "צלם עכשיו" / "בחר מהגלריה". It **never** says no image exists.                                                                                   |

**Vehicle details** offers:

- "צלם תמונה" and "בחר מהגלריה" (replace the photo);
- "הסר את התמונה שלי" (the approved reference returns automatically; the mapping is untouched);
- "שינוי חזית הדגם", only when the front is not an established registry fact.

## 3. Identity class and phase

- **Class key:** `v1/{make}/{model}/{generation}/{phase}/{body}/{colorFamily}`
  (`src/identification/vehicleClass.ts`).
  - Built from registry facts: make, model, model code `degem_nm` (generation + body) and color
    family.
  - **No plate, VIN or user identity** is ever sent.
- **Exterior phase:** set only by **high-confidence** registry rules:
  - VIN model year ≥ 2013 → `fl1`;
  - VIN model year ≤ 2011 → `pre-fl`;
  - `degem_cd` 58 → `fl1`;
  - `degem_cd` 26 with production year 2011 or first registration ≤ 2012-01 → `pre-fl`.
- **Otherwise:** unknown, which leads to the visual question.
- **Reuse:** each approved record is keyed by class, so every matching vehicle reuses it without new
  research.

## 4. Catalog and storage (AutoKeep-controlled, never in the APK)

- **Table `vehicle_reference_images`** (migration `20260929000002`).
  - Holds the display fields plus the **full rights and provenance record** (`record` jsonb):
    source, original SHA-256, Commons metadata snapshot, license flags, derivative operations and
    review.
  - Stored independently of the binary.
  - RLS: `anon` and `authenticated` may read **approved** rows only. There are no write policies,
    so only the service role can write.
- **Public bucket `vehicle-references`:** approved binaries only, with no write policies.
- **App:** `SupabaseReferenceCatalog`.
  - It downloads to app storage (`documentDirectory/reference-images/<sha256>.png`) and **verifies
    the SHA-256** before first use.
  - It keeps an offline index, so a cached approved image still shows offline. Without one, the
    result is "can't search now".
- **Operator tool:** `tools/reference-images.mjs` (`publish` / `list` / `withdraw`).
  - It is fail-closed: it refuses an unapproved or non-commercial record, a modified image without
    adaptation rights, or a hash mismatch.
  - After upload it verifies the served binary through its public URL.
- **Data:** `data/reference-images/` holds each record JSON and derivative PNG, plus a license table.

**Published (local and staging):**

| Record                                     | Class key                                    | Derivative sha256         | Source / license                                                                             |
| ------------------------------------------ | -------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------- |
| `ref_seat_ibiza_6j_prefl_hatch5d_black_01` | `v1/seat/ibiza/6j/pre-fl/hatchback-5d/black` | `e096c0c5…c8b` (1400×730) | Commons "2009 SEAT Ibiza Sport 84 1.4", Makizox (Vauxford), CC BY-SA 4.0; background removed |
| `ref_seat_ibiza_6j_fl1_hatch5d_black_01`   | `v1/seat/ibiza/6j/fl1/hatchback-5d/black`    | `d7b07d95…6dc` (1400×794) | Commons "2014 SEAT Ibiza Toca 1.4 Front", Vauxford, CC BY-SA 4.0; background removed         |

## 5. Data model

- The vehicle has `exterior_phase` and `exterior_phase_source` (`registry` | `user`):
  - SQLite v5, cloud migration `20260929000001`;
  - merged as one unit;
  - synced, backed up and restored.
- `model_code` is now filled from the registry.
- Device-local settings: the user photo (unchanged architecture: device-local, not synced) and the
  prompt dismissals.

## 6. Verification

- **`npm run verify`:** 59 suites / 427 tests. New tests:
  - `vehicleClass.test.ts`: phase rules, keys, colors, scope;
  - `referenceResolution.test.ts`:
    - exact / other color / not found;
    - unavailable vs no-image;
    - timeout;
    - the question.
  - `vehicle-image.test.tsx`, the UI on the real local store:
    - spinner → reference with label and credit;
    - the question, with the answer persisted;
    - "לא בטוח" remembered;
    - offline and retry;
    - no image → camera, persisted;
    - "לא עכשיו";
    - gallery / camera replacement, then removal → reference;
  - registry mapping of model code and phase, and sync/restore/merge of the phase.
- **Cloud:** `npm run test:cloud`, 57 tests locally and on hosted staging. It includes catalog RLS
  (approved-only read, no writes for anon or users, public read-only bucket) and the tool's
  fail-closed validation.
- **Staging:** migrations `20260929000001` and `20260929000002` applied; both references published
  and served-hash verified. Test accounts were removed afterwards; only the two catalog rows remain.
- **Galaxy A54:** §7.

## 7. Galaxy A54 acceptance (standalone staging APK, Metro off)

- **Build:** commit `069bb88`, 59,365,788 bytes, SHA-256
  `cc0f3a68fa2b01e1ede53f587db542b56d4f1a063b047b00c6f98df3767fe91e`. The installed base.apk on the
  device was hash-verified.
- **Bundle checks:** no service-role key or DB password; **no reference image bundled** (images come
  from AutoKeep storage).
- **Test vehicles:** public registry plates 6524676 (cd 26, first registered 2012-01 → pre-facelift)
  and 7788176 (cd 26, 2012-08 → ambiguous), plus a manually entered Toyota (out of scope). Evidence
  is in `docs/release/evidence/vehicle-image/`.

| Check                                  | Result                                                                                                                                                                                                                                                   | Evidence                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| A. Spinner while resolution is pending | **PASS**: about 2 s of the searching panel ("מחפש תמונה מתאימה לכלי הרכב שלך..." + "זה עשוי להימשך מספר שניות") in the large image **and** the selector thumbnail (from a screen recording)                                                              | A-searching                                    |
| B. Successful match                    | **PASS**: the spinner is replaced by the pre-facelift black Ibiza, "תמונת דגם להמחשה", credit "צילום: Makizox (Vauxford) · CC BY-SA 4.0 · Wikimedia Commons · הרקע הוסר על ידי AutoKeep"                                                                 | B-reference-after-retry, C-answered-reference  |
| C. Ambiguous Ibiza (7788176)           | **PASS**: the spinner → "איזו מהן דומה לרכב שלך?" with both fronts (each credited) + "לא בטוח". Choosing "לפני מתיחת פנים" shows that reference.                                                                                                         | C-choose-front(-settled), C-answered-reference |
| D. No-result                           | **PASS**: "לא מצאנו תמונת דגם מתאימה" + body + "צלם עכשיו" / "בחר מהגלריה" / "לא עכשיו"                                                                                                                                                                  | D-no-suitable-image                            |
| E. Camera                              | **Partial.** "צלם עכשיו" launches the Android camera permission request. It was declined without granting, and the app stays cleanly in the no-result state. **The actual vehicle photo is left to the owner**: it photographs the owner's surroundings. | —                                              |
| F. Gallery                             | **PASS**: an operator test image picked from the gallery becomes the primary vehicle image on Home and in the selector                                                                                                                                   | F-gallery-photo-primary                        |
| G. Restart                             | **PASS**: after force-stop and relaunch, the personal photo remains                                                                                                                                                                                      | G-after-restart                                |
| H. Remove personal photo               | **PASS**: vehicle details go reference → own photo (gallery) → "הסר את התמונה שלי" → the approved reference returns                                                                                                                                      | H1–H3                                          |
| I. Offline                             | **PASS**: with Wi-Fi off, "לא ניתן לחפש תמונה כרגע" + "נסה שוב" + camera/gallery, and **not** the no-image message. After reconnecting, "נסה שוב" → spinner → reference.                                                                                 | I-offline-unavailable, B-reference-after-retry |

**Notes.**

- Samsung keeps Wi-Fi on in airplane mode when it was used that way before. The first "offline"
  attempt was therefore online and was discarded; the valid test turned Wi-Fi off.
- The phone temporarily lost its weak Wi-Fi connection during the run; tests resumed after it
  reconnected.
- The app was never signed in, so staging received no account data. The only server traffic was
  the consented registry lookups and anonymous catalog reads.
- **Cleanup:** the operator test image was removed from the phone and the staging app's data was
  cleared.

## Amendment 2026-10-03: general model photo from Wikimedia (owner decision: "checked Wikimedia")

Display priority becomes: user photo → approved reference → **general model photo** → illustration.

- **Lookup:**
  - The English Wikipedia article titled "<Make> <Model>", with redirects followed and
    disambiguation pages skipped.
  - If there is none, the first search hit, accepted only when its title names both the make and
    the model.
  - Hebrew registry makes map to English through the existing manufacturer aliases. Only make +
    model are sent, never a plate, VIN or identity.
- **License gate (Commons extmetadata):**
  - Accepted: public domain, CC0, CC BY, CC BY-SA.
  - Rejected: non-free (fair use), NC, ND, unknown.
  - The credit "author · license · Wikimedia Commons" is shown and links to the file page.
- **Label:** always shown on the large image: "תמונת דגם כללית מוויקיפדיה · ייתכן שהדור או הגרסה
  שונים מהרכב שלך". An article's lead image is usually the newest generation. For example, the live
  check returned a Corolla E210 photo.
- **Cache:**
  - SQLite table `model_photo_cache` (migration v13, local only), keyed by model class (`wm1/<make>/<model>`).
  - The thumbnail is downloaded to app storage (`model-photos/`), so it shows offline.
  - A "none" result is remembered for 30 days.
- **Hosts:** the API at `en.wikipedia.org`; images at `upload.wikimedia.org` and `thumb.wikimedia.org`.
  - HTTPS only.
  - Tracking parameters are stripped.
  - 10 s timeout and a 5 MB limit.
- **Color:** the hero shows "צבע: <registry color>" (`tzeva_rechev`) with a swatch for known color
  families.
- **Live check (2026-10-03):** found, with free licenses, for Toyota Corolla, Honda XR650L, Hyundai
  Ioniq, Kia Picanto and Suzuki Swift.

**Device check, Galaxy A54 / Expo Go (2026-10-03):**

- The first lookups failed with **HTTP 403**. Wikimedia rejects Android's default `okhttp` User-Agent,
  even with `Api-User-Agent`.
- Fix: an explicit `User-Agent` on both the API and image requests.
- After the fix, the phone found and showed both vehicles' photos:
  - Honda XR650L (CC BY-SA 2.0);
  - Ford Fiesta (CC BY-SA 3.0 de).
- Development builds log each lookup step under `[vehicle-image]` (make and model only).
