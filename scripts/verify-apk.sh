#!/usr/bin/env bash
# Verify a built APK against this project's core architectural claims.
#
# Written because three separate proxies lied during Phase 1:
#   - `npx expo config` reported INTERNET absent while the manifest had it
#   - a shell pipeline returned exit 0 for a failed Gradle build
#   - a stale android/ folder produced an APK still carrying blocked permissions
#
# The APK is the artifact that ships, so the APK is what gets checked.
#
# Usage: bash scripts/verify-apk.sh [path-to-apk]

set -uo pipefail

APK="${1:-android/app/build/outputs/apk/release/app-release.apk}"
SDK="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"
AAPT="$(ls "$SDK"/build-tools/*/aapt2.exe 2>/dev/null | tail -1)"

if [ ! -f "$APK" ]; then
  echo "FAIL: no APK at $APK"
  exit 1
fi
if [ -z "$AAPT" ]; then
  echo "FAIL: aapt2 not found under $SDK/build-tools"
  exit 1
fi

echo "APK:  $APK"
echo "Size: $(du -h "$APK" | cut -f1)"
echo

PERMS="$("$AAPT" dump permissions "$APK" 2>/dev/null \
  | grep -oE "name='[^']+'" | sed "s/name='//;s/'//" | sort -u)"

echo "=== Permissions in the APK ==="
echo "$PERMS" | sed 's/^/  /'
echo

fail=0

# --- 1. No network, at all. The app's central claim. --------------------
for p in \
  android.permission.INTERNET \
  android.permission.ACCESS_NETWORK_STATE \
  com.google.android.c2dm.permission.RECEIVE \
  com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE
do
  if echo "$PERMS" | grep -qx "$p"; then
    echo "FAIL: $p present — the app can reach the network"
    fail=1
  fi
done

# --- 2. Nothing invasive a finance app has no business holding ----------
for p in \
  android.permission.READ_SMS \
  android.permission.RECEIVE_SMS \
  android.permission.ACCESS_FINE_LOCATION \
  android.permission.ACCESS_COARSE_LOCATION \
  android.permission.READ_EXTERNAL_STORAGE \
  android.permission.WRITE_EXTERNAL_STORAGE
do
  if echo "$PERMS" | grep -qx "$p"; then
    echo "FAIL: $p present"
    fail=1
  fi
done

# --- 3. No OEM launcher-badge permissions from ShortcutBadger -----------
if echo "$PERMS" | grep -qiE "badge|launcher.permission"; then
  echo "FAIL: OEM badge permissions present:"
  echo "$PERMS" | grep -iE "badge|launcher.permission" | sed 's/^/       /'
  fail=1
fi

# --- 4. The two we DO need must survive ---------------------------------
for p in \
  android.permission.POST_NOTIFICATIONS \
  android.permission.RECEIVE_BOOT_COMPLETED
do
  if ! echo "$PERMS" | grep -qx "$p"; then
    echo "FAIL: $p MISSING — reminders will not work"
    fail=1
  fi
done

# --- 4b. Nothing else at all: an ALLOWLIST, not just the denylists above ---
# The denylists only catch permissions someone already thought of. On
# 2026-09-19 a dev APK carried four nobody had listed: USE_BIOMETRIC and
# USE_FINGERPRINT (androidx.biometric, via expo-secure-store) and
# SYSTEM_ALERT_WINDOW and VIBRATE (Expo's prebuild template). Every permission
# in a release APK must now be named here; a new one fails until someone
# decides it belongs. To trace one: android/app/build/intermediates/
# manifest_merge_blame_file/*/manifest-merger-blame-*-report.txt
ALLOWED='^(android\.permission\.(POST_NOTIFICATIONS|RECEIVE_BOOT_COMPLETED|WAKE_LOCK|VIBRATE)|[a-z0-9_.]+\.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION)$'
# WAKE_LOCK: scheduled notifications (Phase 8). VIBRATE: notification vibration
# on API 24–25, a normal install-time permission. DYNAMIC_RECEIVER_NOT_EXPORTED_
# PERMISSION: added by AndroidX core, private to this app's own signature.
UNEXPECTED="$(echo "$PERMS" | grep -vE "$ALLOWED" | grep -v '^$')"
if [ -n "$UNEXPECTED" ]; then
  echo "FAIL: permissions not on the allowlist:"
  echo "$UNEXPECTED" | sed 's/^/       /'
  fail=1
fi

# --- 5. Native layer: arm64 only, and SQLCipher actually present --------
echo "=== Native libraries ==="
python - "$APK" <<'PY'
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
libs = [n for n in z.namelist() if n.startswith('lib/')]
abis = sorted({n.split('/')[1] for n in libs})
print('  ABIs:', ', '.join(abis) or '(none)')
for n in sorted(libs):
    if any(k in n for k in ('sqlite', 'sqlcipher', 'expo-modules')):
        print(f'  {n}  {z.getinfo(n).file_size // 1024} KB')
PY
echo

echo "=== Result ==="
if [ "$fail" -eq 0 ]; then
  echo "PASS — the APK matches the stated architecture."
else
  echo "FAILED — see above. Did you 'rm -rf android && npx expo prebuild' first?"
fi
exit "$fail"
