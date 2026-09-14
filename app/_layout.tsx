import '../global.css';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Toaster } from 'sonner-native';

import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';

import { bootDatabase, type BootOutcome } from '../db/boot';
import { checkpointWal } from '../db/connection';
import { BootFailure } from '../features/boot/components/BootFailure';
import { colors } from '../lib/theme';

// Keep the splash up until the database is open, migrated and seeded. Flashing
// an empty shell while the schema is still being created reads as broken.
void SplashScreen.preventAutoHideAsync();

/**
 * The root. The ONE place in app/ allowed to touch db/ (CLAUDE.md #10 exception):
 * nothing else may mount until `bootDatabase()` says the database is ready.
 * Boot order and failure handling live in db/boot.ts.
 */
export default function RootLayout() {
  const [outcome, setOutcome] = useState<BootOutcome | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    let cancelled = false;
    void bootDatabase().then((o) => {
      if (!cancelled) setOutcome(o);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setOutcome(null);
    setAttempt((a) => a + 1);
  }, []);

  const ready = outcome?.kind === 'ready';

  // Fold the WAL into the main file whenever the app leaves the foreground, so
  // Android auto-backup (which excludes -wal) always copies a complete database.
  useEffect(() => {
    if (!ready) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') checkpointWal();
    });
    return () => sub.remove();
  }, [ready]);

  const onReady = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  if (!outcome) return <BootSpinner />;
  if (outcome.kind !== 'ready') return <BootFailure outcome={outcome} onRetry={retry} />;
  if (!(fontsLoaded || fontError)) return <BootSpinner />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onReady}>
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'fade_from_bottom',
          }}
        >
          <Stack.Screen name="(tabs)" />
          {/* A group is not a route: each modal is registered by its full name. */}
          <Stack.Screen name="(modals)/transaction" options={{ presentation: 'modal' }} />
          {/* A native bottom sheet: it slides over the ledger, so the list you
              are filtering stays visible behind it. */}
          <Stack.Screen
            name="(modals)/filters"
            options={{
              presentation: 'formSheet',
              sheetAllowedDetents: [0.75, 1],
              sheetGrabberVisible: true,
              sheetCornerRadius: 28,
              sheetExpandsWhenScrolledToEdge: true,
              contentStyle: { backgroundColor: colors.card },
            }}
          />
          <Stack.Screen name="(modals)/category" options={{ presentation: 'modal' }} />
        </Stack>
        {/* Above the floating tab bar, so a toast never covers the add button. */}
        <Toaster position="bottom-center" richColors theme="dark" offset={110} />
        {/* Dark-only design: the status bar is always light-on-dark. */}
        <StatusBar style="light" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function BootSpinner() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
