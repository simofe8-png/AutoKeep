# AutoKeep V1 — Frozen UI Baseline (M03)

- **Frozen:** 2026-09-26, at M03 PASS (commit tagged by the `M03:` checkpoint message)
- **Device:** Samsung Galaxy A54 (SM-A546E), Android 16, locale he-IL, 1080×2340 @ 450 dpi, system font scale 1.3, Expo Go SDK 57
- **Data:** labeled demo data (the "נתוני הדגמה" strip is part of the prototype, not of production UI)

The images in this folder are the approved visual reference (downscaled). Per UX_DESIGN_BASELINE "UI-first freeze", later milestones must **not** redesign these screens. A change needs a demonstrated implementation need, must preserve the approved UX intent, and must be recorded in `task-plan.md` evidence.

## Screens

| File                                            | Screen                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| home.jpg                                        | Home: active vehicle, next service, remaining km/time, צפי forecast                       |
| maintenance.jpg                                 | Next-service screen with expandable actions                                               |
| garage.jpg                                      | Garage Mode (three separate sections)                                                     |
| history.jpg / service-detail.jpg                | History and service detail with provenance                                                |
| documents.jpg / document-detail.jpg             | Document library; original vs derived                                                     |
| alerts.jpg / alert-detail.jpg                   | Alerts with explanation                                                                   |
| odometer.jpg / keyboard-odometer.jpg            | Odometer update, keyboard avoidance                                                       |
| service-new.jpg                                 | Service capture methods with target vehicle                                               |
| vehicles.jpg / vehicle-manage.jpg / dossier.jpg | My Vehicles, lifecycle, dossier                                                           |
| account.jpg / settings.jpg                      | Account/backup and Settings                                                               |
| onboarding.jpg / onboarding-scan.jpg            | Onboarding entry and scan                                                                 |
| 02–08-*.jpg                                     | States: failed scan, ambiguity, partial identification, pending schedule, offline, alerts |

## Verified acceptance items (UX_DESIGN_BASELINE "Visual acceptance")

- **RTL:** layout, tab order (בית rightmost), directional chevrons, text alignment for Text (ADR-0006) and TextInput, and bidi of mixed Hebrew/number/Latin strings (RLM separators, Latin-leading paragraph guard).
- **Safe areas:** status bar and gesture navigation insets; tab bar height is inset-aware.
- **Scrolling:** every screen scrolls, and footers stay fixed.
- **Keyboard avoidance:** footer actions stay above the keyboard (KeyboardAvoidingView `padding` on Android edge-to-edge).
- **Font scaling:** checked at 1.3 and at the 2.0 maximum. Titles and identity never truncate. Tab labels are capped at ×1.3.
- **Touch targets:** at least 48dp for interactive components (unit-tested).
- **States:** loading, empty, error, offline and pending/unable-to-verify are rendered in context with a next action.
- **Screen sizes:** native 1080×2340 plus a simulated 720×1280 @ 320 dpi (~360dp) small phone.
- **Navigation/back:** tabs, stack back, hardware back from deep links (initialRouteName).
- **Active vehicle context:** visible on every primary screen, and target vehicle banners on high-impact screens.

## Known non-app artifacts in screenshots

- The grey or blue floating gear, and a "To" label, are Expo Go developer overlays (development only).
- Notifications from other apps (e.g. WhatsApp) occasionally appear in the status bar.
