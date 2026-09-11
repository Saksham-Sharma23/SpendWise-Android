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
    // Explicitly blocked, to make the intent unmistakable to a future reader.
    blockedPermissions: [
      'android.permission.READ_SMS',
      'android.permission.RECEIVE_SMS',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ],
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
