#!/usr/bin/env bash
# Screenshots every approved screen on the connected Android device via Expo Go deep links.
# Usage: tools/device-shots.sh <out-dir> [wait-seconds]
# Requires Metro running (npm run start:device) and the app open in Expo Go.
set -u
OUT="${1:?out dir}"
WAIT="${2:-5}"
mkdir -p "$OUT"

ROUTES=(
  "home:/"
  "maintenance:/maintenance"
  "history:/history"
  "documents:/documents"
  "garage:/garage"
  "alerts:/alerts"
  "alert-detail:/alerts/alert-car-upcoming"
  "odometer:/odometer"
  "service-new:/service/new"
  "service-detail:/service/svc-car-1"
  "document-detail:/documents/doc-car-schedule"
  "vehicles:/vehicles"
  "vehicle-manage:/vehicle/mock-vehicle-car"
  "dossier:/vehicle/mock-vehicle-car/dossier"
  "account:/account"
  "settings:/settings"
  "onboarding:/onboarding"
  "onboarding-scan:/onboarding/scan"
)

for entry in "${ROUTES[@]}"; do
  name="${entry%%:*}"
  path="${entry#*:}"
  adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081/--${path}" host.exp.exponent >/dev/null
  sleep "$WAIT"
  adb exec-out screencap -p > "$OUT/${name}.png"
  echo "$name"
done
