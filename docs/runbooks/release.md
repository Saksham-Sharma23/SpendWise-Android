# Runbook — cutting a release

Written for whoever is shipping, which today is one person on one Windows machine with a phone.
Follow it top to bottom. The steps that can silently produce a broken release are marked **⚠**.

Related: [`migrations.md`](migrations.md) when the release contains a schema change.

---

## 0. Decide what is in it

```bash
git log --oneline <last-tag>..HEAD
```

If any commit touches `db/schema.ts` or `db/migrations/`, this is a **schema release** — do
[`migrations.md`](migrations.md) first and come back.

## 1. Green on main

```bash
npm run verify
```

Typecheck (app **and** tests), lint, the lint self-test, formatting, jest and the release permission
policy. Roughly five minutes; the migration tests build 50k-row fixtures.

**Do not skip this because CI will catch it.** CI runs the same checks, but finding out after the tag
means moving the tag.

## 2. Bump the version

Two files, and they must agree:

- `package.json` → `version`
- `app.config.ts` → `version`

Android's `versionCode` is handled by EAS (`autoIncrement` on the production profile). A local
`assembleRelease` does not bump it, which is fine for a test APK and **not** fine for anything going
to Play.

## 3. Build

### The normal way — GitHub

Push to `main`. `.github/workflows/release.yml` does a clean prebuild, an arm64 `assembleRelease`,
then `verify-apk.sh` on the artifact. The APK lands under **Actions → the run → Artifacts**, kept 30
days.

Pushing a `v*` tag does the same and publishes a GitHub Release with the APK attached:

```bash
git tag v1.1.0 && git push origin v1.1.0
```

### Locally, if you must

⚠ On 8 GB this competes with everything else. Metro must be **off**.

```powershell
Remove-Item -Recurse -Force android
npm run prebuild          # NOT prebuild:dev — that one grants INTERNET
npm run build:release-apk # runs verify:apk on the artifact
```

⚠ **`npm run prebuild`, never `npx expo prebuild`.** The plain Expo command misses
`scripts/with-dev-network.js`'s fail-closed handling.

## 4. Verify the APK ⚠

`build:release-apk` and the workflow both run this, but check the output rather than assuming:

```bash
npm run verify:apk
```

Expect **exactly**:

```
android.permission.POST_NOTIFICATIONS
android.permission.RECEIVE_BOOT_COMPLETED
android.permission.WAKE_LOCK
android.permission.VIBRATE
<package>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION
```

No `INTERNET`. No `USE_BIOMETRIC`, `USE_FINGERPRINT` or `SYSTEM_ALERT_WINDOW` — all three reached the
2026-09-19 dev APK from libraries, which is why the check is an allowlist rather than a denylist.

⚠ **Check the built APK, never `expo config` or the manifest.** `android.permissions` only _adds_;
library manifests contribute their own; a stale `android/` keeps the old policy. Only
`aapt2 dump permissions` on the artifact tells the truth.

If something unexpected appears, find its source:

```
android/app/build/intermediates/manifest_merge_blame_file/*/manifest-merger-blame-*-report.txt
```

Then add it to `blockedPermissions` in `app.config.ts` and rebuild.

## 5. Signing ⚠

Without the four `ANDROID_KEYSTORE_*` secrets the workflow signs with **Expo's shared debug key** and
says so in the run summary. That APK installs and updates a dev build in place, but anyone can sign
with that key — it is for testing only.

See [§ Creating the release keystore](#creating-the-release-keystore) below. **Losing the keystore
means no future update can ever install over the installed app.** There is no recovery, by design.

## 6. Drills on a real phone

Neither is optional for a schema release.

**Backup drill**

1. Populate, or use the phone's existing data
2. Export `.db`, `.json` and a passphrase copy
3. Uninstall the app
4. Install the new APK
5. Restore each format; row counts and totals must match

**Migration drill** — see [`migrations.md`](migrations.md) § On a copy of the phone's database.

**Auto-backup drill**

```bash
adb shell bmgr backupnow com.spendwise.android
# uninstall, reinstall, confirm the data came back
```

⚠ Android's auto-backup quota is **25 MB and it fails silently**. Past it, nothing happens and nothing
is reported. Settings → Storage shows how close the database is.

## 7. Tag and record

```bash
git tag v1.1.0
git push origin v1.1.0
```

Update `TASKS.md` with what shipped and anything the drills found.

---

## Creating the release keystore

Once, ever. Do this before the first build anyone else installs.

```bash
keytool -genkeypair -v \
  -keystore spendwise-release.jks \
  -alias spendwise \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype JKS
```

`-validity 10000` is ~27 years. A certificate that expires is a certificate that strands every
installed copy.

**Back the `.jks` up somewhere outside this repository** — a password manager, an encrypted drive,
anywhere you will still have in five years. It is the single unrecoverable artefact in this project:
lose it and existing installs can never be updated, only uninstalled and replaced, losing their data
unless the user backed it up themselves.

Then add four repository secrets (**Settings → Secrets and variables → Actions**):

| Secret                      | Value                                         |
| --------------------------- | --------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | `base64 -w0 spendwise-release.jks` (one line) |
| `ANDROID_KEYSTORE_PASSWORD` | the store password                            |
| `ANDROID_KEY_ALIAS`         | `spendwise`                                   |
| `ANDROID_KEY_PASSWORD`      | the key password                              |

On Windows, for the base64 line:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("spendwise-release.jks")) | Set-Clipboard
```

The next run's summary should read **"Signed with: release key"**. Verify independently:

```bash
apksigner verify --print-certs spendwise-<ref>-<sha>.apk
```

⚠ Never commit the `.jks` or the passwords. `.gitignore` covers `*.jks`; check before committing.
