import '../global.css';

import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Toaster } from 'sonner-native';

import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';

import { configureConnection, db } from '../db/client';
import { getOrCreateDatabaseKey } from '../db/encryption';
import migrations from '../db/migrations/migrations';
import { seedIfNeeded } from '../db/seed';

// Keep the splash up until migrations AND seeding finish. Flashing an empty
// shell while the schema is still being created is how a launch reads as broken.
void SplashScreen.preventAutoHideAsync();

type BootState =
  | { phase: 'booting' }
  | { phase: 'ready' }
  | { phase: 'failed'; error: string };

export default function RootLayout() {
  const [keyReady, setKeyReady] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  // 1. Unlock the database before anything touches it. PRAGMA key must be the
  //    first statement on the connection.
  //
  //    Migrations are NOT allowed to start until this resolves, which is why
  //    they live in a child component that is only mounted afterwards. Calling
  //    useMigrations here, alongside this effect, lets its effect run while the
  //    key is still being read from SecureStore — the first launch then writes
  //    an UNENCRYPTED database, and the later PRAGMA key fails with
  //    "file is not a database". Found on device, 2026-09-13.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const key = await getOrCreateDatabaseKey();
        if (cancelled) return;
        configureConnection(key);
        setKeyReady(true);
      } catch (e) {
        if (!cancelled) {
          setKeyError(e instanceof Error ? e.message : 'Could not unlock the database.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (keyError) return <BootFailure error={keyError} />;
  if (!keyReady) return <BootSpinner />;
  return <MigratedApp />;
}

/** Mounted only after the connection is keyed. */
function MigratedApp() {
  const scheme = useColorScheme();
  const [boot, setBoot] = useState<BootState>({ phase: 'booting' });

  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  // 2. Migrations — safe now, the connection is keyed.
  const { success: migrated, error: migrationError } = useMigrations(db, migrations);

  // 3. Seed, then release the splash.
  useEffect(() => {
    if (!migrated) return;
    let cancelled = false;
    (async () => {
      try {
        await seedIfNeeded();
        if (!cancelled) setBoot({ phase: 'ready' });
      } catch (e) {
        if (!cancelled) {
          setBoot({
            phase: 'failed',
            error: e instanceof Error ? e.message : 'Could not prepare initial data.',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [migrated]);

  useEffect(() => {
    if (migrationError) {
      setBoot({ phase: 'failed', error: migrationError.message });
    }
  }, [migrationError]);

  const onReady = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  const fontsSettled = fontsLoaded || Boolean(fontError);

  // A failed migration is a permanently broken install with no server-side
  // fix. Show a real recovery path rather than a crash loop. Restore lands
  // in Phase 7; until then this at least explains what happened.
  if (boot.phase === 'failed') return <BootFailure error={boot.error} />;
  if (boot.phase === 'booting' || !fontsSettled) return <BootSpinner />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onReady}>
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="(modals)"
            options={{ presentation: 'modal', headerShown: false }}
          />
        </Stack>
        <Toaster position="bottom-center" richColors />
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function BootSpinner() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator />
    </View>
  );
}

function BootFailure({ error }: { error: string }) {
  return (
    <View
      className="flex-1 items-center justify-center bg-background px-6"
      onLayout={() => void SplashScreen.hideAsync()}
    >
      <Text className="mb-2 text-center text-lg text-foreground">SpendWise could not start</Text>
      <Text className="mb-6 text-center text-sm text-muted-foreground">{error}</Text>
      <Text className="text-center text-xs text-muted-foreground">
        Your data has not been changed. Restoring from a backup will be offered here once that
        screen exists.
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}
