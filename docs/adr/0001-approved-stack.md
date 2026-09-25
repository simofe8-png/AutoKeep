# ADR-0001: Approved technology stack

- Status: accepted (pre-approved in bootstrap package)
- Date: 2026-09-25

## Context

MASTER_EXECUTION.md fixes the baseline stack. It cannot be replaced without explicit approval.

## Decision

React Native + Expo (SDK 57, managed workflow, expo-router, file routes in `src/app`) + TypeScript (strict). expo-sqlite for local persistence. Supabase (PostgreSQL, Auth, private Storage) for the future cloud. Android first; iOS must remain possible.

## Consequences

Native dependencies must come from the Expo ecosystem or be CNG-compatible, installed with `npx expo install`. `ios/` and `android/` are generated and git-ignored.
