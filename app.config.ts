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

// Dev builds need INTERNET so Metro can serve the bundle over Wi-Fi and the
// dev client can reach the packager. Release builds must not have it.
const IS_DEV = process.env.EAS_BUILD_PROFILE === 'development' || process.env.NODE_ENV !== 'production';

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
];

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SpendWise',
  slug: 'spendwise-android',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'spendwise',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  android: {
    package: 'com.spendwise.android',
    adaptiveIcon: {
      backgroundColor: '#0B5C4B',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // Layer 2 of the backup strategy (CLAUDE.md §Backup). Android restores the
    // SQLite file automatically on a new device. 25 MB cap — surfaced in Settings.
    allowBackup: true,
    predictiveBackGestureEnabled: false,
    permissions: ANDROID_PERMISSIONS,
    blockedPermissions: ANDROID_BLOCKED,
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-sharing',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        dark: { backgroundColor: '#0D1210' },
        image: './assets/splash-icon.png',
        imageWidth: 180,
      },
    ],
    [
      'expo-sqlite',
      {
        // SQLCipher. CLAUDE.md convention: enable BEFORE there is data —
        // retrofitting encryption onto a populated database is a migration
        // nobody wants to write.
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
