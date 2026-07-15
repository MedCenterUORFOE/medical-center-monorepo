import React from 'react';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppSettingsProvider, useAppSettings } from '../src/context/AppSettingsContext';
import PinLockOverlay from '../components/PinLockOverlay';
import OfflineBanner from '../components/OfflineBanner';
import { ThemeProvider as NavigationThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';

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

  const navTheme = isDark ? DarkTheme : DefaultTheme;

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