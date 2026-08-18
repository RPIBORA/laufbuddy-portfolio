#!/usr/bin/env bash
set -u

PACKAGE_NAME="${PACKAGE_NAME:-app.laufbuddy}"
DEVICE_ID="${1:-${DEVICE_ID:-}}"
DURATION_SECONDS="${2:-${DURATION_SECONDS:-900}}"
POLL_SECONDS="${POLL_SECONDS:-2}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_STAMP="$(date +"%Y%m%d_%H%M%S")"
OUT_DIR="$PROJECT_ROOT/test_runs/laufbuddy_tracker_$RUN_STAMP"

mkdir -p "$OUT_DIR"

MAIN_LOG="$OUT_DIR/tracker.log"
STATE_CSV="$OUT_DIR/state_samples.csv"
LOGCAT_RAW="$OUT_DIR/logcat_raw.log"
LOGCAT_FILTERED="$OUT_DIR/logcat_filtered.log"
SUMMARY_FILE="$OUT_DIR/summary.txt"

log() {
  printf "[%s] %s\n" "$(date +"%Y-%m-%d %H:%M:%S")" "$*" | tee -a "$MAIN_LOG"
}

run_adb() {
  if [ -n "$DEVICE_ID" ]; then
    adb -s "$DEVICE_ID" "$@"
  else
    adb "$@"
  fi
}

detect_device() {
  if [ -n "$DEVICE_ID" ]; then
    return
  fi

  DEVICE_ID="$(adb devices | awk "NR > 1 && \$2 == \"device\" {print \$1; exit}")"

  if [ -z "$DEVICE_ID" ]; then
    log "FEHLER: Kein autorisiertes Android-Gerät gefunden."
    adb devices | tee -a "$MAIN_LOG"
    exit 1
  fi
}

cleanup() {
  log "Tracker wird beendet."

  if [ -n "${LOGCAT_PID:-}" ]; then
    kill "$LOGCAT_PID" >/dev/null 2>&1 || true
    wait "$LOGCAT_PID" >/dev/null 2>&1 || true
  fi

  create_summary

  log "Auswertung gespeichert:"
  log "$OUT_DIR"
}

create_summary() {
  {
    printf "===== LaufBuddy Release Tracker Summary =====\n"
    printf "Zeit: %s\n" "$(date +"%Y-%m-%d %H:%M:%S")"
    printf "Device: %s\n" "$DEVICE_ID"
    printf "Package: %s\n" "$PACKAGE_NAME"
    printf "Ordner: %s\n" "$OUT_DIR"

    printf "\n===== Zähler =====\n"
    printf "AndroidRuntime/FATAL: "
    grep -i -E "AndroidRuntime|FATAL EXCEPTION|Fatal signal" "$LOGCAT_FILTERED" 2>/dev/null | wc -l || true

    printf "ReactNativeJS Fehler/Warnungen: "
    grep -i -E "ReactNativeJS.*(error|exception|warning|warn|fatal)|Unable to load script" "$LOGCAT_FILTERED" 2>/dev/null | wc -l || true

    printf "Hotword start: "
    grep -i "startHotwordRecognition" "$LOGCAT_FILTERED" 2>/dev/null | wc -l || true

    printf "Hotword stop: "
    grep -i "stopHotwordRecognition" "$LOGCAT_FILTERED" 2>/dev/null | wc -l || true

    printf "shouldRun=true: "
    grep -i "shouldRun=true" "$LOGCAT_FILTERED" 2>/dev/null | wc -l || true

    printf "shouldRun=false: "
    grep -i "shouldRun=false" "$LOGCAT_FILTERED" 2>/dev/null | wc -l || true

    printf "Audio-Gerät verbunden: "
    grep -i -E "Audio-Gerät verbunden|onAudioDevicesAdded" "$LOGCAT_FILTERED" 2>/dev/null | wc -l || true

    printf "Audio-Gerät getrennt: "
    grep -i -E "Audio-Gerät getrennt|onAudioDevicesRemoved" "$LOGCAT_FILTERED" 2>/dev/null | wc -l || true

    printf "\n===== Letzte Prozess-/Fokus-Samples =====\n"
    tail -30 "$STATE_CSV" 2>/dev/null || true

    printf "\n===== Relevante Hotword/Service Events =====\n"
    grep -i -E "LaufBuddyService|Hotword|headsetConnected|shouldRun|Audio-Gerät|onAudioDevices|ForegroundService|startForeground|stopForeground" "$LOGCAT_FILTERED" 2>/dev/null | tail -120 || true

    printf "\n===== Fehler Events =====\n"
    grep -i -E "AndroidRuntime|FATAL EXCEPTION|Fatal signal|ReactNativeJS|Unable to load script|ExpoModulesCore|Exception|Error" "$LOGCAT_FILTERED" 2>/dev/null | tail -120 || true
  } > "$SUMMARY_FILE"
}

trap cleanup EXIT INT TERM

detect_device

log "Starte LaufBuddy Release Tracker."
log "Device: $DEVICE_ID"
log "Package: $PACKAGE_NAME"
log "Dauer Sekunden: $DURATION_SECONDS"
log "Polling Sekunden: $POLL_SECONDS"
log "Ausgabeordner: $OUT_DIR"

{
  printf "timestamp,pid,process_state,foreground_focus,focused_app,service_hint,screen_state,keyguard_hint,battery\n"
} > "$STATE_CSV"

log "Geräteübersicht:"
adb devices | tee -a "$MAIN_LOG"

log "Package Info:"
run_adb shell dumpsys package "$PACKAGE_NAME" 2>/dev/null | grep -E "versionName|versionCode|firstInstallTime|lastUpdateTime|dataDir|pkg=|userId" | tee -a "$MAIN_LOG" || true

log "Starte Logcat-Mitschnitt."
run_adb logcat -c >/dev/null 2>&1 || true

(
  run_adb logcat -v time 2>/dev/null | tee "$LOGCAT_RAW" | grep --line-buffered -i -E "app.laufbuddy|LaufBuddy|ReactNativeJS|AndroidRuntime|FATAL|Fatal signal|Unable to load script|ExpoModulesCore|ForegroundService|Hotword|headsetConnected|shouldRun|Audio-Gerät|onAudioDevices|AudioManager|Emergency|PhoneCall|WebRTC|Vosk" > "$LOGCAT_FILTERED"
) &
LOGCAT_PID="$!"

START_EPOCH="$(date +%s)"
END_EPOCH="$((START_EPOCH + DURATION_SECONDS))"

log "Polling startet. App jetzt normal am Handy testen. Beenden mit STRG+C."

while [ "$(date +%s)" -lt "$END_EPOCH" ]; do
  NOW="$(date +"%Y-%m-%d %H:%M:%S")"

  PID="$(run_adb shell pidof "$PACKAGE_NAME" 2>/dev/null | tr -d "\r" | awk "{print \$1}")"
  if [ -n "$PID" ]; then
    PROCESS_STATE="running"
  else
    PROCESS_STATE="not_running"
    PID="-"
  fi

  FOCUS_LINE="$(run_adb shell dumpsys window 2>/dev/null | grep -E "mCurrentFocus|mFocusedApp" | tr "\n" " " | tr -d "\r" | sed "s/,/;/g")"
  if printf "%s" "$FOCUS_LINE" | grep -q "$PACKAGE_NAME"; then
    FOREGROUND_FOCUS="foreground_or_focused"
  else
    FOREGROUND_FOCUS="background_or_not_focused"
  fi

  SERVICE_LINE="$(run_adb shell dumpsys activity services "$PACKAGE_NAME" 2>/dev/null | grep -E "LaufBuddyForegroundService|ServiceRecord|foreground|isForeground|app.laufbuddy" | head -5 | tr "\n" " " | tr -d "\r" | sed "s/,/;/g")"
  if [ -z "$SERVICE_LINE" ]; then
    SERVICE_LINE="-"
  fi

  POWER_LINE="$(run_adb shell dumpsys power 2>/dev/null | grep -E "mWakefulness=|Display Power|mHoldingWakeLockSuspendBlocker|mInteractive=" | tr "\n" " " | tr -d "\r" | sed "s/,/;/g")"
  if [ -z "$POWER_LINE" ]; then
    POWER_LINE="-"
  fi

  KEYGUARD_LINE="$(run_adb shell dumpsys window 2>/dev/null | grep -E "mDreamingLockscreen|mShowingLockscreen|isStatusBarKeyguard|mKeyguardShowing|mInputRestricted" | tr "\n" " " | tr -d "\r" | sed "s/,/;/g")"
  if [ -z "$KEYGUARD_LINE" ]; then
    KEYGUARD_LINE="-"
  fi

  BATTERY_LINE="$(run_adb shell dumpsys battery 2>/dev/null | grep -E "level:|status:|plugged:" | tr "\n" " " | tr -d "\r" | sed "s/,/;/g")"
  if [ -z "$BATTERY_LINE" ]; then
    BATTERY_LINE="-"
  fi

  printf "%s,%s,%s,%s,\"%s\",\"%s\",\"%s\",\"%s\",\"%s\"\n" \
    "$NOW" \
    "$PID" \
    "$PROCESS_STATE" \
    "$FOREGROUND_FOCUS" \
    "$FOCUS_LINE" \
    "$SERVICE_LINE" \
    "$POWER_LINE" \
    "$KEYGUARD_LINE" \
    "$BATTERY_LINE" >> "$STATE_CSV"

  sleep "$POLL_SECONDS"
done

log "Geplante Laufzeit erreicht."
