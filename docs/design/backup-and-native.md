# Design — Backup & restore, native layer

> **Status:** designed, **not built** (Phases 7 and 8 in [`TASKS.md`](../../TASKS.md)). The building blocks that
> already exist: `db/encryptedCopy.ts` (passphrase-encrypted copies), `plugins/withBackupRules.js`
> (auto-backup exclusions), WAL checkpoint on background (`app/_layout.tsx`).
> Moved out of `CLAUDE.md` on 2026-09-17.

## Backup & Restore

Not a nice-to-have. The phone holds the only copy of data typed in by hand over years.
All three layers ship — each covers a case the others miss.

| Layer                                                            | Covers                                    | Limits                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1 · Manual export** (`.db` or `.json` via share sheet)         | The phone you lose, the app you uninstall | Only happens if the user remembers                                                                                                                                                                                                         |
| **2 · Android auto-backup** (`allowBackup: true` + backup rules) | The phone you upgrade                     | 25 MB cap, silent, not guaranteed to run. Only works because the main DB is unkeyed — a Keystore-keyed file restores unopenable. Rules exclude `-wal`/`-shm` and include `files/sheets/`; the WAL is checkpointed when the app backgrounds |
| **3 · Monthly reminder** (local notification)                    | Makes layer 1 actually happen             | Fires only when `last_backup_at` > 30 days old                                                                                                                                                                                             |

| Decision             | Choice                                                                          | Reasoning                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Export format        | Both `.db` and `.json`                                                          | `.db` is exact byte-for-byte. `.json` is readable and future-proof. Default `.db`                                                                                                                                                         |
| Restore safety       | Validate, then snapshot current DB before overwriting                           | The most destructive action in the app. Restoring the wrong file must not lose the right one                                                                                                                                              |
| On-device encryption | None beyond Android's own _(decided 2026-09-14)_                                | FBE + app sandbox cover the realistic threats; a device-bound key breaks auto-backup restore and adds a lock-yourself-out failure mode                                                                                                    |
| Exported file        | Optional passphrase on `.db`, via SQLCipher `ATTACH … KEY` + `sqlcipher_export` | The export is the copy that leaves the device, so that is where encryption earns its cost. Restore attaches the file with the passphrase and exports into a plain DB. A forgotten passphrase means that backup is gone — say so in the UI |
| Nudge cadence        | Monthly, only if stale                                                          | A reminder firing the day after you backed up is how notifications get disabled                                                                                                                                                           |

> ⚠️ **Test this like it matters.** Every other feature failing is an annoyance. Backup failing is
> permanent loss of hand-entered data. Phase 9 must include a real drill: populate → export →
> **uninstall completely** → reinstall → restore → verify row counts and totals match exactly.
> On the actual phone. Again before every release that touches the schema.

---

## Native Layer

### Local reminders (`expo-notifications`)

- **Renewals** — recompute upcoming subs after any write, cancel-all-and-reschedule. Never diff.
- **Budget alerts** — crossing 75% and 100% of a category limit, evaluated after each transaction write.
- **Backup nudge** — monthly, only when last export is >30 days old.
- Fire at 09:00 local with an **inexact** alarm. `SCHEDULE_EXACT_ALARM` is Play-scrutinised and unwarranted.
- Android 13+ needs runtime `POST_NOTIFICATIONS` — ask **in context** on first subscription save, never at launch.
- Three channels: `Renewals`, `Budget alerts`, `Backup`.

### Quick add: FAB + home widget

- `react-native-android-widget` renders to Android **RemoteViews** — no JS runtime, no state, no fetch.
- The widget reads a **snapshot** written to MMKV after each write: today's spend, month total, nearest renewal.
- Tapping deep-links via `expo-linking` into the add-transaction modal.

### Permissions — exactly two

`POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED`. **No `INTERNET`.**
The Play listing can honestly say the app cannot transmit your financial data anywhere, because
Android itself won't let it. The Data Safety form becomes nearly empty.
_Sentry requires `INTERNET`_ — ship it in the dev profile only and keep the release build provably offline.

---
