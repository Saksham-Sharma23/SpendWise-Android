import type { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * SpendWise Android — standalone, offline-only.
 *
 * The permission list below is the single most important thing in this file.
 * See CLAUDE.md convention #1: this app makes zero network requests, and the
 * release build must not declare INTERNET. That is what lets the Play listing
 * honestly claim the app cannot transmit financial data anywhere — Android
 * itself enforces it.
 */

/**
 * INTERNET is OPT-IN, so every build path fails closed.
 *
 * Dev builds need it (Metro serves the bundle over Wi-Fi), so it is granted
 * only when a development build is explicitly requested:
 *   - EAS: the development profile sets EAS_BUILD_PROFILE=development;
 *   - local: `npm run prebuild:dev` / `npm run android` set SPENDWISE_DEV_NETWORK=1
 *     through scripts/with-dev-network.js.
 * A plain `npx expo prebuild` — or any build that forgets an env var — gets no
 * INTERNET. The previous rule (`NODE_ENV !== 'production'`) was true for a
 * plain local prebuild, so a local release APK shipped with INTERNET.
 */
export const ALLOW_DEV_NETWORK =
  process.env.EAS_BUILD_PROFILE === 'development' || process.env.SPENDWISE_DEV_NETWORK === '1';
const IS_DEV = ALLOW_DEV_NETWORK;

const ANDROID_PERMISSIONS = [
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  ...(IS_DEV ? ['android.permission.INTERNET'] : []),
];

/**
 * Permissions to strip from the merged manifest.
 *
 * `android.permissions` above only ADDS to what library manifests declare —
 * it does not replace them. Omitting INTERNET there is therefore not enough:
 * `expo-file-system` declares it in its own manifest (it supports remote
 * downloads; we use it purely for local files), and the manifest merger
 * pulls it in regardless. Only `blockedPermissions` emits the
 * `tools:node="remove"` that actually removes it.
 *
 * Verified by inspecting android/app/src/main/AndroidManifest.xml after a
 * production prebuild — see the Phase 1 notes in TASKS.md.
 */
const BLOCKED_ALWAYS = [
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  // expo-file-system pulls these in for remote/SAF use we do not have.
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',

  // --- Pulled in transitively by expo-secure-store --------------------
  // It depends on androidx.biometric:biometric, whose manifest declares both.
  // The app never shows a biometric prompt: its one SecureStore use
  // (db/legacyEncryption.ts) reads and deletes a key that was stored with
  // WHEN_UNLOCKED, never `requireAuthentication`. Found 2026-09-19, when
  // removing expo-local-authentication (R0-4) did NOT drop them — the merge
  // report traced them here. Unblock these when the Phase 8 app lock is built.
  'android.permission.USE_BIOMETRIC',
  'android.permission.USE_FINGERPRINT',

  // --- Pulled in transitively by expo-notifications -------------------
  // We schedule LOCAL notifications only: no FCM project, no push tokens,
  // no server. But the library ships the full remote-push stack, and its
  // manifest brings Firebase Cloud Messaging and Play Install Referrer
  // with it. Shipping those in an app whose Data Safety form says "no data
  // collected, nothing transmitted" would make that form wrong.
  'com.google.android.c2dm.permission.RECEIVE',
  'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
  'android.permission.ACCESS_NETWORK_STATE',

  // ShortcutBadger (an expo-notifications dependency) adds ~18 OEM launcher
  // badge permissions — Samsung, Huawei, OPPO, HTC, Sony and others. We do
  // not show app-icon badge counts, and a permission list full of vendor
  // entries reads as invasive on a Play listing for a finance app.
  'android.permission.READ_APP_BADGE',
  'com.anddoes.launcher.permission.UPDATE_COUNT',
  'com.htc.launcher.permission.READ_SETTINGS',
  'com.htc.launcher.permission.UPDATE_SHORTCUT',
  'com.huawei.android.launcher.permission.CHANGE_BADGE',
  'com.huawei.android.launcher.permission.READ_SETTINGS',
  'com.huawei.android.launcher.permission.WRITE_SETTINGS',
  'com.majeur.launcher.permission.UPDATE_BADGE',
  'com.oppo.launcher.permission.READ_SETTINGS',
  'com.oppo.launcher.permission.WRITE_SETTINGS',
  'com.sec.android.provider.badge.permission.READ',
  'com.sec.android.provider.badge.permission.WRITE',
  'com.sonyericsson.home.permission.BROADCAST_BADGE',
  'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
  'me.everything.badger.permission.BADGE_COUNT_READ',
  'me.everything.badger.permission.BADGE_COUNT_WRITE',
];

const ANDROID_BLOCKED = [
  ...BLOCKED_ALWAYS,
  // The whole point of this app: a release build must be unable to reach the
  // network at all, enforced by Android rather than by convention.
  ...(IS_DEV ? [] : ['android.permission.INTERNET']),
  // "Display over other apps". Expo's prebuild template declares it in the
  // MAIN manifest, so it ships in release unless removed. Only React Native's
  // dev tooling can use it, which is why dev builds keep it.
  ...(IS_DEV ? [] : ['android.permission.SYSTEM_ALERT_WINDOW']),
];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SpendWise',
  slug: 'spendwise-android',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'spendwise',
  // 'automatic' since the light theme shipped (2026-09-15): the native shell —
  // system dialogs, the text-selection menu — follows the phone, which is what
  // Settings → System does too.
  //
  // It cannot follow a FORCED preference: picking Light on a dark phone still
  // gets a dark splash, because the splash is drawn by Android before any JS
  // runs and there is nothing to read the stored preference. The colours below
  // keep that to one frame of the right family rather than a white flash.
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  android: {
    package: 'com.spendwise.android',
    adaptiveIcon: {
      // Only a fallback: backgroundImage below wins wherever it is honoured.
      // Matches the mid-point of that image's gradient (#135B65 -> #012432),
      // so a launcher that ignores the image still gets the mark's own teal.
      backgroundColor: '#0A414B',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // Layer 2 of the backup strategy (CLAUDE.md §Backup). Android restores the
    // SQLite file automatically on a new device. 25 MB cap — surfaced in Settings.
    // Works only because the main DB is unkeyed (decision F0-1); the exclusion
    // rules are written by ./plugins/withBackupRules.
    allowBackup: true,
    predictiveBackGestureEnabled: false,
    permissions: ANDROID_PERMISSIONS,
    blockedPermissions: ANDROID_BLOCKED,
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-sharing',
    './plugins/withBackupRules',
    [
      'expo-splash-screen',
      {
        // Exactly the app's own page colours (lib/theme.ts `background`), so
        // the handover from the splash to the first screen is invisible. They
        // used to be #FFFFFF and #0D1210 against an app painted #F4F7F2 and
        // #0A0A0B, which showed as a flash on every cold start.
        backgroundColor: '#F4F7F2',
        dark: { backgroundColor: '#0A0A0B' },
        image: './assets/splash-icon.png',
        imageWidth: 180,
      },
    ],
    [
      'expo-sqlite',
      {
        // SQLCipher stays in the build for passphrase-encrypted BACKUP FILES
        // (db/encryptedCopy.ts). The main database is opened without a key
        // (decision F0-1, 2026-09-14), where SQLCipher behaves exactly like SQLite.
        android: { useSQLCipher: true },
      },
    ],
    [
      'expo-notifications',
      {
        color: '#0B5C4B',
        defaultChannel: 'renewals',
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});
