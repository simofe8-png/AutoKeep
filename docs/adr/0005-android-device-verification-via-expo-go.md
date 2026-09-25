# ADR-0005: Android verification through Expo Go on a physical device

- Status: accepted
- Date: 2026-09-25

## Context

There is no AVD, and the user will connect a physical Android phone. The project path contains non-ASCII (Hebrew) characters, and Gradle/CMake/NDK are known to be fragile with non-ASCII paths on Windows.

## Decision

UI verification (M01–M03) uses Expo Go over Metro (`npx expo start`, USB with `adb reverse` or LAN), which needs no local native build. This requires using only modules bundled in Expo Go until a development build is justified. If a native build becomes necessary, build from an ASCII path alias (`subst` drive or directory junction).

## Consequences

Dependency choices favor Expo Go-compatible modules (expo-sqlite, expo-camera, expo-image-picker, expo-document-picker, expo-notifications local, expo-file-system, expo-print, expo-sharing are all bundled).
