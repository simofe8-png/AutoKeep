# AutoKeep approved visual reference set

**Status:** authoritative (owner decision, 2026-09-28).

The five images in `docs/design/approved/` are the approved **visual source of truth** for
AutoKeep's screens. The current UI is not the source of truth.

> **Rule for all future UI work.** When an approved reference exists for a screen, implement
> _that_ layout. Do not invent a different composition. Where the references conflict with each
> other or with a later explicit product or security decision, the decision below wins.
> Differences from the references must be listed in §4 with the reason.

## 1. The reference files

| File                                                     | Content                                                                                                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a_clean_realistic_ui_ux_mockup_image_of_three_sma.png`  | **Home (LEFT = the selected Home variant)** · My vehicles · Add a new vehicle                                                                         |
| `a_high_resolution_mockup_screenshot_of_a_smartphon.png` | Maintenance plan ("תוכנית הטיפולים")                                                                                                                  |
| `a_clean_high_resolution_ui_mockup_composite_thre.png`   | Alerts and reminders · Alert detail · Service recording from an alert                                                                                 |
| `a_clean_infographic_ui_mockup_collage_showing_a.png`    | 12 screens: welcome, license scan, identification, home, plan, service detail, history, Garage Mode, documents, my vehicle, alerts, settings          |
| `a_wide_high_resolution_promotional_ui_flow_mockup.png`  | 12-step flow: welcome, add vehicle, scan, identification, confirm details, complete info, home, plan, service detail, history, Garage Mode, documents |

**Selected Home variant.** The owner selected the LEFT Home variant, referred to as
"ניהול רכבים חכם ב-AutoKeep.png". No file with that name was delivered; the only image whose left
screen is a Home screen is `a_clean_realistic_ui_ux_mockup_image_of_three_sma.png` (Home | My
vehicles | Add vehicle), so its left screen is the Home reference. The Home screens in the other
two images are **not** used.

## 2. Decisions that override the mockups

1. **Primary navigation:** the four bottom tabs **בית | תחזוקה | היסטוריה | מסמכים**
   (`UX_DESIGN_BASELINE.md`). The mockups' 5-tab and alternate 4-tab bars are obsolete. Alerts
   are the header bell; settings are the header menu.
2. **"AutoKeep ממליץ (AI)" is not shown.** AI is not an authoritative maintenance source, and no
   recommendation is invented.
3. **The vehicle is never described as "תקין".** Grounded wording is used: due status
   ("באיחור", "מתקרב", "לא נדרש כרגע"), "אין כרגע משימות תחזוקה נוספות שזוהו", or the
   verification state.
4. **No "טסט קרוב"**: outside the approved scope.
5. **No collection of usage type, driving frequency or primary location.**
6. **No new external VIN provider.** The VIN stays part of the vehicle identity (masked in the
   UI), but identification by VIN is not added.
7. **No external vehicle-image provider and no manufacturer logos or trademarks.** The vehicle
   image area shows a neutral illustration of the vehicle type; a user-provided photo may be
   added later.
8. **"פרטי טיפול" (next-service detail)** keeps the approved behaviour: each manufacturer item
   expands in place with instruction, action type and exact evidence. Garage recommendations stay
   a separate "not mandatory" group.
9. **Verification states** keep the shared vocabulary: מאומת / חסר מידע–ממתין לאימות / לא ניתן
   לאמת. A verified-plan banner appears only when the plan is actually verified.

## 3. Screen → reference map

| Screen                                                           | Route                                           | Reference                                           |
| ---------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| Welcome (existing-user sign-in)                                  | `/onboarding` (first run)                       | D1, E1                                              |
| Add vehicle (method)                                             | `/onboarding/method`, `/onboarding` when adding | C3                                                  |
| License scan                                                     | `/onboarding/scan`                              | D2, E3                                              |
| Identification / confirm                                         | `/onboarding/confirm`                           | D3, E4                                              |
| Home                                                             | `/`                                             | **C1 (left)**                                       |
| Maintenance plan                                                 | `/maintenance`                                  | A, D5, E8                                           |
| Next-service detail                                              | `/next-service`                                 | D6, E9                                              |
| History                                                          | `/history`                                      | D7, E10                                             |
| Documents                                                        | `/documents`                                    | D9, E12                                             |
| Alerts / alert detail                                            | `/alerts`, `/alerts/[id]`                       | B1 (+ D11), B2                                      |
| Service recording                                                | `/service/new` → `/service/manual` → review     | B3                                                  |
| My vehicles                                                      | `/vehicles`                                     | C2                                                  |
| Vehicle detail ("הרכב שלי")                                      | `/vehicle/[id]`                                 | D10                                                 |
| Garage Mode                                                      | `/garage`                                       | D8 (light variant)                                  |
| Settings                                                         | `/settings`                                     | D12 (items limited to approved scope)               |
| Account / login / invitation, dossier, odometer, document detail | —                                               | no reference; shared components and visual language |

(A = the single-phone plan image; B, C = the three-phone images, numbered left to right;
D, E = the 12-screen images, numbered as printed.)

## 4. Intentional differences from the references

| Difference                                                                                                                | Why                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Bottom navigation                                                                                                         | §2.1                                                                                      |
| Vehicle photo → illustration; no manufacturer logo                                                                        | §2.7                                                                                      |
| No AI group, no "טסט", no tips, no usage/frequency/location, no VIN method                                                | §2.2–2.6                                                                                  |
| Garage Mode: no QR / WhatsApp buttons; "שיתוף כמסמך PDF" opens the existing dossier export (system share covers WhatsApp) | New sharing capabilities are not part of this correction                                  |
| Service recording keeps method choice → form → **review with explicit confirmation**                                      | SPEC: no auto-commit; explicit confirmation before saving history                         |
| Service form: no invoice-number field; date typed (no native date picker)                                                 | No new data field / native dependency in this correction                                  |
| Home keeps a "רישום טיפול" button and the account/backup offer                                                            | UX baseline: service capture from Home; account offered once data worth protecting exists |
| Maintenance plan tiles as a 2×2 grid                                                                                      | Four in a row do not fit legibly at Android font scaling                                  |
| "כלי הרכב שלי" instead of "הרכבים שלי"                                                                                    | `UX_DESIGN_BASELINE.md` §09 terminology (cars, motorcycles, scooters)                     |
| Document thumbnails are type-marked page tiles, not rendered previews                                                     | No file decoding for list rows                                                            |
| Back arrow drawn "<" at the physical left, as in the references                                                           | Parity with the references                                                                |

## 5. Physical acceptance (Galaxy A54, hosted staging, 2026-09-28): PASS

Standalone release APK `com.autokeep.app.staging`:

- sha256 `130a8de5…75724d9`;
- the JS bundle is embedded (Hermes bytecode) and contains the new screens.

Independence from any dev server was verified before acceptance:

- Metro/Expo CLI stopped: no listener on 8081/8082, no expo process;
- `adb reverse` removed;
- cold start from the launcher;
- no "Cannot connect to Expo CLI" at any point.

The earlier "Cannot connect to Expo CLI" message came from **Expo Go** (the dev client used for
the demo-data screenshots) after its Metro had been stopped. It was not the staging APK.

Bundle secret scan: the anon key and the HTTPS URL are present; the service-role key, DB password
and DB URL are absent.

| Check                                                                                                                                                                                             | Result |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Cold start → approved welcome (wordmark, benefits, "הוספת הרכב הראשון", "יש לי חשבון — התחברות")                                                                                                  | PASS   |
| Invitation link → registration (username + password) → signed in                                                                                                                                  | PASS   |
| Onboarding: method stepper (C3) → manual → "זה הרכב שלך?" (plate, illustration) → odometer → source search (honest "not found") → Home                                                            | PASS   |
| Home (C1): selector, hero, plate, tiles, unverified plan stated honestly; vehicle synced to staging                                                                                               | PASS   |
| All four tabs (בית / תחזוקה / היסטוריה / מסמכים) render and navigate                                                                                                                              | PASS   |
| Service recording → review → explicit confirm → history timeline                                                                                                                                  | PASS   |
| **Fresh install (app data cleared) → welcome → "יש לי חשבון — התחברות" → username + password → account data restored (vehicle on Home, the recorded service in History), no vehicle added first** | PASS   |
| Alerts, Garage Mode, Settings, My vehicles                                                                                                                                                        | PASS   |
| Second vehicle added (reused onboarding) and active-vehicle switching both ways                                                                                                                   | PASS   |
| Account deletion from the phone → welcome; staging back to 0 users / invitations / objects / rows                                                                                                 | PASS   |

## 6. Audit trail

- Parity audit: `docs/design/PARITY_AUDIT.md` (before the correction).
- Correction: see `CURRENT_STATUS.md` / `task-plan.md` ("Screen parity").
