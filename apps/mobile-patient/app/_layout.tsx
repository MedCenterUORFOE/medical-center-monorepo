import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppSettingsProvider, useAppSettings } from '../src/context/AppSettingsContext';
import PinLockOverlay from '../components/PinLockOverlay';
import OfflineBanner from '../components/OfflineBanner';
import { ThemeProvider as NavigationThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import * as SecureStore from 'expo-secure-store';
import { setupNotificationHandlers, startTokenRefreshListener, registerDeviceToken } from '../src/notifications/pushNotifications';
import { colors } from '../src/theme/colors';

const customNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
    primary: colors.primary,
  },
};

const messaging = getMessaging();
setBackgroundMessageHandler(messaging, async () => {});


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes default stale time
    },
  },
});

function AppContent() {
  const { isDark } = useAppSettings();
  const router = useRouter();

  useEffect(() => {
    const unsubHandlers = setupNotificationHandlers(router);
    const unsubRefresh = startTokenRefreshListener();

    SecureStore.getItemAsync('userToken').then(token => {
      if (token) {
        registerDeviceToken();
      }
    });

    return () => {
      unsubHandlers();
      unsubRefresh();
    };
  }, [router]);

  const navTheme = customNavigationTheme;

  return (
    <NavigationThemeProvider value={navTheme}>
      <OfflineBanner />
      
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="create-account" />
      </Stack>

      <PinLockOverlay />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppSettingsProvider>
        <AppContent />
      </AppSettingsProvider>
    </QueryClientProvider>
  );
}