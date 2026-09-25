# AutoKeep

AutoKeep is an AI-native personal vehicle-maintenance manager for private cars, motorcycles and scooters. It is local-first, Hebrew RTL and Android-first.

It identifies the vehicle, finds authoritative maintenance schedules, tracks service history, prepares the owner for garage visits and issues grounded reminders. It never invents maintenance facts.

## Status

See [CURRENT_STATUS.md](CURRENT_STATUS.md) and [task-plan.md](task-plan.md).

## Stack

React Native · Expo (SDK 57, expo-router) · TypeScript · SQLite (expo-sqlite) · Supabase (future cloud: PostgreSQL, Auth, private Storage) · provider-independent OCR/AI boundaries.

## Getting started

```bash
npm install
npm run verify        # format check, lint, typecheck, unit tests
npx expo start        # dev server; open in Expo Go on Android
```

## Documentation

| File                                                       | Purpose                                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [AutoKeep_Bootstrap_Package/](AutoKeep_Bootstrap_Package/) | Authoritative spec, UX baseline, task plan and execution contract (read-only) |
| [CLAUDE.md](CLAUDE.md)                                     | Agent governance, approval gates, resume protocol                             |
| [ARCHITECTURE.md](ARCHITECTURE.md)                         | System architecture and module boundaries                                     |
| [DOMAIN.md](DOMAIN.md)                                     | Domain model and invariants                                                   |
| [SECURITY.md](SECURITY.md)                                 | Security principles and threat model direction                                |
| [TESTING.md](TESTING.md)                                   | Verification layers and gates                                                 |
| [ROADMAP.md](ROADMAP.md)                                   | Milestones M00–M24                                                            |
| [docs/adr/](docs/adr/)                                     | Architecture decision records                                                 |

## Environment and secrets

See [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md). Secrets are never committed.
