# Screen parity: second review (2026-09-28): the owner rejected the first correction

**Status:** the first correction (commits `86ec70d`, `b01301b`) is **not accepted**. This file
records the root-cause analysis and the evidence gathered before the second correction. The
owner makes the final visual decision; this document does not claim PASS.

Evidence images (APPROVED REFERENCE | CURRENT) are in `docs/design/evidence/before/`. They were
captured on the Galaxy A54 from two sources:

- the **standalone staging APK** built from `86ec70d` (welcome, add vehicle, confirm, Home,
  Garage Mode);
- the same source running in Expo Go with the labeled demo data (plan, service detail, history,
  documents, alerts, vehicles, settings). These screens need a verified schedule and several
  vehicles, and a real staging account does not have them.

## A. Root cause

1. **The phone did not have the new UI installed when the owner looked.**
   - The only AutoKeep app on the A54 is `com.autokeep.app` ("AutoKeep"): version 1.0.0, last
     updated **2026-09-27 10:17**. That is the RC build from before any UI change.
   - The staging APK with the new UI (`com.autokeep.app.staging`) was **uninstalled** after the
     acceptance run, as part of cleanup.
   - Opening "AutoKeep" therefore shows the old screens.
   - The "Cannot connect to Expo CLI" screen came from Expo Go, after its dev server was stopped.
2. **The first correction reproduced components and styling, not the approved screen
   compositions.** The side-by-side images show this for most screens:
   - **Imagery.** Every reference screen is dominated by a photographic white vehicle. The
     implementation shows a flat pale-blue box with a black clip-art icon, so every screen reads
     as "not the design" even where the structure matches.
   - **Composition.** Several screens have a different structure and density:
     - Maintenance plan: no sub-tab row, a tall banner instead of the compact one, tiles in a 2×2
       grid instead of 1×4, single-column rows instead of the two-column timeline rows.
     - History: an extra vehicle selector, page title, disclaimer and chips instead of the
       reference header, dropdown filter and cards.
     - Documents: the row layout is mirrored and there are extra section labels.
     - Garage Mode: a card-on-grey layout instead of the dark full-bleed vehicle header with an
       overlapping sheet, and the share actions differ.
     - My vehicles: extra "manage" links and alert badges.
     - Vehicle detail: a large hero instead of the compact header and list.
     - Alert detail: an extra vehicle card.
   - **Extra blocks not in the references**, which push content and change the hierarchy:
     - Home: "רישום טיפול" button, account offer, large "schedule unavailable" card;
     - Welcome: "אין צורך בהרשמה" line;
     - several screens: disclaimers.
   - **Headers and chrome.** Non-Home screens used the Home wordmark bar instead of the
     reference headers (back arrow, centred title). The bottom navigation lacks the
     reference's highlighted active-tab background.
3. **My acceptance check was functional, not visual.** The 10/10 device run verified behaviour.
   I compared captures against references by eye, screen by screen, and declared parity on
   similar components instead of on full composition. That was wrong.

**Not the cause:**

- The acceptance APK _was_ built from `86ec70d`: the commit is 09:36:43 and the build started at
  about 09:44 and finished at 11:09. The embedded bundle contains the new screen IDs
  (`onboarding-sign-in`, `home-next-service`, `plan-timeline`, `screen-next-service`,
  `vehicle-details`).
- The package and variant were correct (`com.autokeep.app.staging`).
- The Home reference was mapped to the left screen of
  `a_clean_realistic_ui_ux_mockup_image_of_three_sma.png`. No file named
  "ניהול רכבים חכם ב-AutoKeep.png" exists in the ZIP or on disk. That left screen is the only
  Home screen in a left position, and its composition matches the owner's description, so the
  mapping stands.

## B–E. Screen-by-screen findings (before the second correction)

| #   | Screen                   | Reference (exact)                      | Current vs reference                                                                                                                                                              | Verdict        |
| --- | ------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | Welcome                  | E, screen 1 ("מסך פתיחה")              | Same order; photo scene → flat placeholder; extra "no registration" line; second button style/wording differ                                                                      | Does not match |
| 2   | Add vehicle (method)     | C, right screen ("הוספת רכב חדש")      | Close: stepper, radio cards, info, continue. Header subtitle and back icon differ; VIN option omitted by decision                                                                 | Close (minor)  |
| 3   | Identification / confirm | E, screen 4 ("זיהוי הרכב")             | Reference: image, name, spec, plate, plain label/value table, "המשך". Current: provenance pills per row inside a card                                                             | Does not match |
| 4   | Home                     | **C, left screen**                     | Structure similar (selector, hero, name/spec/plate, 2 tiles, alert card, all-alerts button, 4 shortcuts); photo → placeholder, no logo, extra blocks, 4-tab navigation (decision) | Partially      |
| 5   | Maintenance plan         | A (single phone)                       | Missing sub-tabs, 1×4 tiles, inline filter row, two-column timeline rows; different header and density                                                                            | Does not match |
| 6   | Next-service detail      | E, screen 9 (+ D, screen 6 for groups) | Current adds a vehicle card and summary card; items are expandable rows, not the reference check-list                                                                             | Does not match |
| 7   | History                  | E, screen 10                           | Extra blocks; reference is header + dropdown filter + cards with check markers                                                                                                    | Does not match |
| 8   | Documents                | E, screen 12                           | Row layout mirrored, section labels, header differs                                                                                                                               | Does not match |
| 9   | Alerts                   | B, left screen                         | Close in structure; header, chips and card styling differ                                                                                                                         | Partially      |
| 10  | Alert detail             | B, middle screen                       | Extra vehicle card; otherwise close                                                                                                                                               | Partially      |
| 11  | Service recording        | B, right screen                        | Form layout differs (actions list, date/km row, documents block)                                                                                                                  | Does not match |
| 12  | My vehicles              | C, middle screen                       | Extra links and badges, placeholder images                                                                                                                                        | Partially      |
| 13  | Vehicle detail           | D, screen 10 ("הרכב שלי")              | Hero + card instead of compact header + list                                                                                                                                      | Does not match |
| 14  | Garage Mode              | D, screen 8 (light variant)            | Different composition (no dark full-bleed header, different actions)                                                                                                              | Does not match |
| 15  | Settings                 | D, screen 12                           | Close (separate cards, values in blue); section header, toggles and header differ                                                                                                 | Close (minor)  |

## F. Was the A54 running the correct build?

- During the acceptance run on 2026-09-28 at 11:18–11:28: **yes**. The standalone
  `com.autokeep.app.staging` APK from `86ec70d` was running with Metro off.
- When the owner inspected: **no**. Only the old RC app (`com.autokeep.app`, updated
  2026-09-27) was installed.

## Second correction: approach

Reproduce each reference composition. Apply only the authoritative exceptions:

- the four-tab navigation;
- no AI recommendations;
- no "תקין";
- no test date;
- no usage, frequency or location data;
- no VIN, image or logo provider.

Vehicle imagery uses a bundled, self-made neutral illustration in the reference's style (sky,
landscape, road, white vehicle), and the user's own vehicle photo when they add one. Neither is
an external image provider.
