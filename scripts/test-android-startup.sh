#!/usr/bin/env bash
# Native startup regression, deliberately restricted to an isolated Android emulator.
set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^emulator-[0-9]+$ ]]; then
  echo 'Usage: scripts/test-android-startup.sh emulator-NNNN' >&2
  exit 2
fi

serial="$1"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
apk="${ANDROID_STARTUP_APK:-$repo_root/android/app/build/outputs/apk/debug/app-debug.apk}"
reports="${ANDROID_STARTUP_REPORT_DIR:-$repo_root/android/app/build/reports/startup}"
package='io.github.feanoriaweb.english'
browser='com.android.chrome'
command -v adb >/dev/null || { echo 'Android platform-tools/adb is required.' >&2; exit 2; }
[[ -f "$apk" ]] || { echo "APK not found: $apk" >&2; exit 2; }
mkdir -p "$reports"

device() { adb -s "$serial" "$@"; }
fail() { echo "FAIL: $*" >&2; exit 1; }

# Do not select a connected personal phone or wait indefinitely for a broken boot.
boot_deadline=$((SECONDS + 120))
while [[ "$(device shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)" != '1' ]]; do
  (( SECONDS < boot_deadline )) || fail 'Emulator did not boot within 120 seconds.'
  sleep 2
done
[[ "$(device shell getprop ro.kernel.qemu | tr -d '\r')" == '1' ]] || fail 'The selected target is not an emulator.'
[[ "$(device get-state | tr -d '\r')" == 'device' ]] || fail 'The emulator is unavailable.'
device shell pm path "$browser" | grep -q '^package:' || fail 'The test image must include Google Chrome.'

device shell getprop ro.build.version.release > "$reports/android-version.txt"
device shell getprop ro.build.version.sdk > "$reports/android-api.txt"
device install -r "$apk" > "$reports/install.txt" 2>&1 || { cat "$reports/install.txt" >&2; fail 'APK installation failed.'; }
grep -q 'Success' "$reports/install.txt" || fail 'APK installation was not successful.'

launcher="$(device shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -p "$package" | tr -d '\r' | tail -n 1)"
[[ "$launcher" == "$package/"* ]] || fail 'The installed package has no launcher activity.'
echo "Testing $launcher on $serial (API $(tr -d '\r\n' < "$reports/android-api.txt"))"

capture_logs() {
  device logcat -d -v threadtime AndroidRuntime:E ActivityTaskManager:I '*:S' > "$1"
}
assert_no_app_crash() {
  local log="$1"
  if grep -Fq "Process: $package," "$log" || grep -Eq "Force finishing activity[[:space:]]+$package/" "$log"; then
    cat "$log" >&2
    fail 'The app crashed during native startup; see the captured AndroidRuntime stack.'
  fi
}

for attempt in 1 2 3; do
  device shell am force-stop "$package"
  device shell am force-stop "$browser"
  device logcat -c
  launch_log="$reports/launch-$attempt.txt"
  runtime_log="$reports/runtime-$attempt.log"
  activity_log="$reports/activities-$attempt.txt"
  if ! device shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n "$launcher" > "$launch_log" 2>&1; then
    capture_logs "$runtime_log"
    cat "$launch_log" "$runtime_log" >&2
    fail "Cold launch $attempt failed."
  fi
  capture_logs "$runtime_log"
  assert_no_app_crash "$runtime_log"
  grep -Eq '^Status: ok[[:space:]]*$' "$launch_log" || { cat "$launch_log" "$runtime_log" >&2; fail "Cold launch $attempt did not start successfully."; }

  handoff_deadline=$((SECONDS + 30))
  while :; do
    capture_logs "$runtime_log"
    assert_no_app_crash "$runtime_log"
    device shell dumpsys activity activities > "$activity_log"
    # Chrome's first-run screen also counts as a browser handoff. This test never
    # accepts terms, signs in, or creates synthetic activity on the live course.
    if grep -E '(mResumedActivity|topResumedActivity)' "$activity_log" | grep -Fq "$browser/"; then
      break
    fi
    (( SECONDS < handoff_deadline )) || { cat "$launch_log" >&2; fail "Cold launch $attempt did not hand off to Chrome within 30 seconds."; }
    sleep 1
  done

  # The original crash occurred just after starting the browser, so checking the
  # foreground activity alone could report a false success.
  sleep 3
  capture_logs "$runtime_log"
  assert_no_app_crash "$runtime_log"
  echo "PASS: cold launch $attempt/3; browser handoff succeeded; no app crash."
done

echo 'PASS: Android native startup regression (3 cold launches).'
