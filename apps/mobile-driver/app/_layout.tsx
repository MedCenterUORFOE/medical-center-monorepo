import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { setupNotificationHandlers, startTokenRefreshListener } from '../src/notifications/pushNotifications';

setBackgroundMessageHandler(getMessaging(), async () => {});

export const unstable_settings = {
  anchor: 'index',
};

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    const cleanupHandlers = setupNotificationHandlers(router);
    const cleanupRefresh = startTokenRefreshListener();
    return () => {
      cleanupHandlers();
      cleanupRefresh();
    };
  }, [router]);

  return (
    <ThemeProvider value={DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="home" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}
