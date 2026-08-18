#!/usr/bin/env bash
set -u
set -o pipefail

APP_ID="${APP_ID:-app.laufbuddy}"
MODE="${1:-}"
WAIT_SECONDS="${WAIT_SECONDS:-45}"
OUT_DIR="tmp/laufbuddy-hotword-tests"
STAMP="$(date +%Y%m%d_%H%M%S)"
FULL_LOG="$OUT_DIR/${MODE:-no-mode}_$STAMP.full.log"
FILTER_LOG="$OUT_DIR/${MODE:-no-mode}_$STAMP.filtered.log"

FILTER='hotword|vosk|hilfe|audio|headset|headphone|bluetooth|phone|call|foreground|background|laufbuddy|ReactNativeJS|AndroidRuntime|AudioFocus|Telecom|InCall|Microphone|mic|speech|recognizer|Emergency|SOS|Sos'

line() {
  echo
  echo "============================================================"
}

usage() {
  echo "Nutzung:"
  echo "  ./scripts/laufbuddy-hotword-test.sh foreground"
  echo "  ./scripts/laufbuddy-hotword-test.sh background"
  echo "  ./scripts/laufbuddy-hotword-test.sh screenoff"
  echo "  ./scripts/laufbuddy-hotword-test.sh audio"
  exit 2
}

try_adb() {
  local text="$1"
  shift
  echo "+ $text"
  "$@" >/tmp/laufbuddy_adb_tmp.out 2>/tmp/laufbuddy_adb_tmp.err || {
    echo "  Hinweis: nicht erfolgreich oder von Android nicht erlaubt. Weiter."
    sed 's/^/  /' /tmp/laufbuddy_adb_tmp.err | head -n 3
  }
  rm -f /tmp/laufbuddy_adb_tmp.out /tmp/laufbuddy_adb_tmp.err
}

case "$MODE" in
  foreground|background|screenoff|audio) ;;
  *) usage ;;
esac

mkdir -p "$OUT_DIR"

line
echo "0) Gerät und App prüfen"
adb devices
DEVICE_COUNT="$(adb devices | awk 'NR>1 && $2=="device"{c++} END{print c+0}')"
if [ "$DEVICE_COUNT" -lt 1 ]; then
  echo "FEHLER: Kein adb-Gerät mit Status device gefunden."
  exit 1
fi

if ! adb shell pm list packages "$APP_ID" | tr -d '\r' | grep -qx "package:$APP_ID"; then
  echo "FEHLER: App-Paket nicht installiert: $APP_ID"
  exit 1
fi
echo "OK: Gerät verbunden und Paket gefunden: $APP_ID"

line
echo "1) Rechte prüfen/setzen"
try_adb "pm grant RECORD_AUDIO" adb shell pm grant "$APP_ID" android.permission.RECORD_AUDIO
try_adb "pm grant CALL_PHONE" adb shell pm grant "$APP_ID" android.permission.CALL_PHONE
try_adb "pm grant BLUETOOTH_CONNECT" adb shell pm grant "$APP_ID" android.permission.BLUETOOTH_CONNECT
try_adb "pm grant POST_NOTIFICATIONS" adb shell pm grant "$APP_ID" android.permission.POST_NOTIFICATIONS
try_adb "appops RECORD_AUDIO allow" adb shell appops set "$APP_ID" RECORD_AUDIO allow
try_adb "appops CALL_PHONE allow" adb shell appops set "$APP_ID" CALL_PHONE allow
try_adb "appops SYSTEM_ALERT_WINDOW allow" adb shell appops set "$APP_ID" SYSTEM_ALERT_WINDOW allow
try_adb "appops RUN_IN_BACKGROUND allow" adb shell appops set "$APP_ID" RUN_IN_BACKGROUND allow
try_adb "appops RUN_ANY_IN_BACKGROUND allow" adb shell appops set "$APP_ID" RUN_ANY_IN_BACKGROUND allow
try_adb "deviceidle whitelist +$APP_ID" adb shell dumpsys deviceidle whitelist +"$APP_ID"

echo
echo "AppOps-Auszug:"
adb shell appops get "$APP_ID" 2>/dev/null | tr -d '\r' | grep -Ei 'RECORD_AUDIO|CALL_PHONE|SYSTEM_ALERT_WINDOW|RUN_IN_BACKGROUND|RUN_ANY_IN_BACKGROUND|BLUETOOTH|POST_NOTIFICATION' || true

line
echo "2) Audio-/Bluetooth-Schnappschuss VOR Test"
echo "Bluetooth:"
adb shell dumpsys bluetooth_manager 2>/dev/null | tr -d '\r' | grep -Ei 'connected|headset|a2dp|hfp|active|device' | head -n 80 || true
echo
echo "Audio:"
adb shell dumpsys audio 2>/dev/null | tr -d '\r' | grep -Ei 'route|headset|bluetooth|sco|a2dp|hfp|mode|focus|communication|device' | head -n 120 || true

line
echo "3) Logs löschen und App neu starten"
adb logcat -c
adb shell am force-stop "$APP_ID"
sleep 1
adb shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 5

line
echo "4) Testmodus herstellen: $MODE"
case "$MODE" in
  foreground)
    echo "HANDY:"
    echo "- App offen lassen."
    echo "- Headset optional."
    echo "- Gleich bei Logaufnahme laut sagen: hilfe"
    ;;
  background)
    echo "HANDY:"
    echo "- App wird jetzt in den Hintergrund geschickt."
    echo "- App nicht wegwischen."
    echo "- Gleich bei Logaufnahme laut sagen: hilfe"
    adb shell input keyevent KEYCODE_HOME
    sleep 3
    ;;
  screenoff)
    echo "HANDY:"
    echo "- Bildschirm wird jetzt ausgeschaltet."
    echo "- Gerät liegen lassen, nicht entsperren."
    echo "- Gleich bei Logaufnahme laut sagen: hilfe"
    adb shell input keyevent KEYCODE_POWER
    sleep 3
    ;;
  audio)
    echo "HANDY:"
    echo "- Bluetooth-Headset MUSS verbunden sein."
    echo "- App bleibt offen."
    echo "- Gleich bei Logaufnahme laut sagen: hilfe"
    echo "- Wenn Call startet: prüfen, ob Call-Audio im Headset landet."
    ;;
esac

line
echo "5) Logaufnahme läuft jetzt $WAIT_SECONDS Sekunden"
echo "JETZT am Handy: hilfe sagen."
echo "Warten: $WAIT_SECONDS Sekunden."

adb logcat -v time > "$FULL_LOG" 2>&1 &
LOG_PID=$!
sleep "$WAIT_SECONDS"
kill "$LOG_PID" >/dev/null 2>&1 || true
wait "$LOG_PID" >/dev/null 2>&1 || true

grep -Eia "$FILTER" "$FULL_LOG" > "$FILTER_LOG" || true

line
echo "6) Gefilterte Logs"
echo "Voll:   $FULL_LOG"
echo "Filter: $FILTER_LOG"
echo
if [ -s "$FILTER_LOG" ]; then
  tail -n 220 "$FILTER_LOG"
else
  echo "Keine passenden Logzeilen gefunden."
fi

line
echo "7) Zustand nach Test"
echo "Activity:"
adb shell dumpsys activity activities 2>/dev/null | tr -d '\r' | grep -Ei "mResumedActivity|topResumedActivity|mFocusedApp|$APP_ID" | head -n 80 || true
echo
echo "Telecom:"
adb shell dumpsys telecom 2>/dev/null | tr -d '\r' | grep -Ei 'Call|state|audio|route|bluetooth|speaker|earpiece|headset' | head -n 120 || true

line
echo "8) Git Status"
git status --short

line
echo "Fertig: $MODE"
