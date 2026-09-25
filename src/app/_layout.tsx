import { LocaleProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActiveVehicleProvider } from '@/features/vehicles/ActiveVehicleContext';
import { MOCK_VEHICLES } from '@/mocks/vehicles';
import { APP_DIRECTION, colors, rootDirectionStyle, useAppFonts } from '@/ui';

void SplashScreen.preventAutoHideAsync();

// Deep links (e.g. notifications) land on a secondary screen with the tabs beneath it, so
// back — including Android hardware back — returns into the app instead of exiting.
export const unstable_settings = { initialRouteName: '(tabs)' };

export default function RootLayout() {
  const fontsReady = useAppFonts();

  useEffect(() => {
    if (fontsReady) void SplashScreen.hideAsync();
  }, [fontsReady]);

  if (!fontsReady) return null;

  return (
    <SafeAreaProvider>
      <LocaleProvider direction={APP_DIRECTION}>
        <View style={[styles.root, rootDirectionStyle]}>
          {/* M01–M03: labeled mock data (UI-first). Replaced by persistence adapters in M13. */}
          <ActiveVehicleProvider vehicles={MOCK_VEHICLES} isDemoData>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="vehicles" options={{ presentation: 'modal' }} />
              <Stack.Screen name="alerts" />
              <Stack.Screen name="settings" />
            </Stack>
          </ActiveVehicleProvider>
        </View>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
