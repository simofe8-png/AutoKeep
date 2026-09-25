# AutoKeep V1 — UX Design Baseline

## Purpose

This document records the approved UX structure and visual rules. It is a behavioral/structural baseline, not a license to invent new screens. The original visual mockups were conceptual and may contain generated-text artifacts; implementation must preserve the approved hierarchy and interaction patterns rather than copying image-generation mistakes.

## Visual language

- Hebrew RTL
- clean modern white/light-blue visual language
- blue accents
- rounded cards/components
- clear icons
- minimal clutter
- strong hierarchy
- readable typography
- accessibility and font scaling considered
- Android-first
- do not overpopulate bottom navigation
- use shared reusable components rather than screen-specific styling

## Primary navigation

Bottom navigation has four primary destinations:
1. בית
2. תחזוקה
3. היסטוריה
4. מסמכים

Vehicle switching is available from the active-vehicle area near the top of Home.
Notifications use a bell/secondary entry.
Settings are reached through profile/menu/secondary navigation.

## Flow map

### 01 — Onboarding
Open → registration/license scan → identification → confirm vehicle → complete only missing data → current odometer → automatic source discovery/verification → Home.

Failure variants stay in context:
retry scan / upload image / manual fallback; ambiguity requires user selection.

### 02 — Home
Shows active vehicle and answers:
- maintenance status
- next service
- distance/time remaining
- meaningful alerts
- direct Garage Mode/preparation access

Do not display unsupported “vehicle is healthy” claims.

### 03 — Maintenance
Home → next service → maintenance action list.

One scrollable screen. Individual items expand in place for manufacturer instruction, action type and exact evidence.

### 04 — Garage Mode
Accessible from Home/next service.
Three visibly separate areas:
- manufacturer requirements
- AutoKeep-known data
- garage recommendations/notes

Provide a clean presentable view suitable for a service advisor.

### 05 — Service Capture
Garage/Home/History → add service → photo invoice / upload file / manual entry → review/edit → explicit confirm → History.

No OCR/AI auto-commit.

Checkbox means performed. Action type remains separate.

### 06 — History
Chronological service list → service detail.
Show date, odometer, actions, documents and provenance/source quality.

### 07 — Documents
Vehicle-scoped library:
owner’s manual, maintenance plan, invoices/receipts, other relevant documents.
Evidence navigation should reach exact source location where possible.

### 08 — Alerts
Home/device notification → alert detail/action.
Examples:
- upcoming/overdue service → next service
- stale odometer → update odometer
- “handled” → service recording with relevant item preselected

Always identify the target vehicle.

### 09 — My Vehicles
Use Hebrew `כלי הרכב שלי`.

Cards show vehicle identity, odometer, next/important maintenance state.
Active vehicle is clearly marked.
Actions: select/switch, add vehicle, archived vehicles.

Adding a vehicle reuses onboarding; do not create a duplicate onboarding flow.

### 10 — Account/Backup
Account creation is delayed until data worth protecting exists.
Frame around save/backup/sync, not as an initial barrier.

### 11 — Settings
Profile/account, notifications, vehicle management, backup/sync, documents where appropriate, language/appearance, accessibility, about/security.
Do not duplicate main content screens.

### 12 — Archive/Sale/Delete
My Vehicles → specific vehicle → archive / vehicle dossier / permanent delete.
Archive is default for discontinued ownership/use.
Permanent deletion requires explicit confirmation.

### 13 — Vehicle Dossier
Vehicle → dossier → preview → export/share.
Provenance must remain visible; user-reported information is not presented as independently verified.

## Multiple vehicles

The entire app operates in an explicit Active Vehicle Context.
Deep links carry/resolve the correct vehicle_id.
Changing active vehicle changes display context only.
Service recording and other high-impact vehicle-scoped actions visibly show vehicle model + registration identifier to reduce mistakes.

## Two-wheelers

Same UX architecture supports car, motorcycle and scooter. Do not create a parallel motorcycle app.
Content adapts to the exact vehicle and verified manufacturer schedule.
Use `כלי הרכב` terminology where appropriate.

## Verification-state components

Shared visual states:
- ✓ מאומת
- ◷ חסר מידע / ממתין לאימות
- ! לא ניתן לאמת

Do not make each screen invent its own uncertainty language.

## Source discovery UX

Use one progress screen that updates rather than multiple waiting screens.
Then a success/result state.
If no verified source is found, state that clearly without fabricated recommendations.

## Maintenance item UX

Distinguish:
- בדיקה
- החלפה
- פעולה אחרת

Checkboxes represent completion/performed state only.

## Empty/loading/error/offline

Use reusable states. Avoid dead ends.
Every recoverable state should present the relevant next action.
Offline should preserve already-saved useful information and indicate which network-dependent operation will resume later.

## UI-first freeze

M01–M03 use realistic mock data and build the full approved flow before deep backend integration.
After M03 PASS, treat the UI as frozen baseline. Later changes require a demonstrated implementation need and must preserve the approved UX intent.

## Visual acceptance

Before UI baseline PASS verify on Android:
- RTL
- safe areas
- scrolling
- keyboard avoidance
- font scaling
- touch targets
- loading/empty/error/offline states
- multiple screen sizes
- navigation/back behavior
- active vehicle context visibility
