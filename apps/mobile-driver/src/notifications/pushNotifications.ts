import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
} from '@react-native-firebase/messaging';
import type { RemoteMessage } from '@react-native-firebase/messaging';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { PermissionsAndroid, Platform } from 'react-native';

import { apiFetch } from '../lib/api';
import { addNotification } from './notificationStore';

const messaging = getMessaging();
type NotificationRouter = Pick<ReturnType<typeof useRouter>, 'push'>;

export const registerDeviceToken = async () => {
  try {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
    }

    const status = await requestPermission(messaging);
    const enabled =
      status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL;
    if (!enabled) return;

    const fcmToken = await getToken(messaging);
    const sessionToken = await SecureStore.getItemAsync('driver_session_token');
    if (sessionToken && fcmToken) {
      await apiFetch('/api/users/settings', {
        method: 'PATCH',
        body: JSON.stringify({ fcm_token: fcmToken }),
      });
    }
  } catch {
    // Push setup must never block driver sign-in.
  }
};

export const startTokenRefreshListener = () =>
  onTokenRefresh(messaging, () => {
    void registerDeviceToken();
  });

export const routeFromNotification = (
  data: Record<string, string | object> | undefined,
  router: NotificationRouter
) => {
  const type = data?.type;
  if (type === 'NEW_EMERGENCY' || type === 'NEW_ASSIGNED_JOB' || type === 'ASSIGNED_JOB') {
    router.push('/home');
  } else if (type === 'EMERGENCY_UPDATE' || type === 'EMERGENCY_CANCELLED' || type === 'RIDE_UPDATE') {
    router.push('/home');
  } else {
    router.push('/notifications' as never);
  }
};

export const setupNotificationHandlers = (router: NotificationRouter) => {
  const unsubscribeMessage = onMessage(messaging, async (message) => {
    await addNotification(message);
  });
  const unsubscribeOpened = onNotificationOpenedApp(messaging, async (message) => {
    await addNotification(message);
    routeFromNotification(message.data, router);
  });

  void getInitialNotification(messaging).then(async (message: RemoteMessage | null) => {
    if (!message) return;
    await addNotification(message);
    routeFromNotification(message.data, router);
  });

  return () => {
    unsubscribeMessage();
    unsubscribeOpened();
  };
};