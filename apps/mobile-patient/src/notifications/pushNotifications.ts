import { getMessaging, getToken, requestPermission, onMessage, onNotificationOpenedApp, getInitialNotification, onTokenRefresh, AuthorizationStatus } from '@react-native-firebase/messaging';
import type { RemoteMessage } from '@react-native-firebase/messaging';
import * as SecureStore from 'expo-secure-store';
import { Alert, PermissionsAndroid, Platform } from 'react-native';

const messaging = getMessaging();

export const registerDeviceToken = async () => {
  try {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        return;
      }
    }

    // requestPermission is deprecated in favor of expo-notifications or react-native-permissions, but kept functional
    const authStatus = await requestPermission(messaging);
    const enabled =
      authStatus === AuthorizationStatus.AUTHORIZED ||
      authStatus === AuthorizationStatus.PROVISIONAL;

    if (!enabled) return;

    const fcmToken = await getToken(messaging);
    const userToken = await SecureStore.getItemAsync('userToken');

    if (userToken && fcmToken) {
      const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
      await fetch(`${API_URL}/api/users/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({ fcm_token: fcmToken })
      });
    }
  } catch (error) {
    // errors silently caught
  }
};

export const startTokenRefreshListener = () => {
  return onTokenRefresh(messaging, () => {
    registerDeviceToken();
  });
};

export const routeFromNotification = (data: any, router: any) => {
  const type = data?.type;
  if (['NEW_EMERGENCY', 'EMERGENCY_UPDATE', 'EMERGENCY_CANCELLED'].includes(type)) {
    router.push('/emergency');
  } else if (type === 'CERTIFICATE_UPDATE') {
    router.push('/(tabs)/records');
  } else {
    router.push('/notifications');
  }
};

export const setupNotificationHandlers = (router: any) => {
  const unsubscribeOnMessage = onMessage(messaging, async (remoteMessage: RemoteMessage) => {
    Alert.alert(
      remoteMessage.notification?.title || 'Notification',
      remoteMessage.notification?.body || ''
    );
  });

  const unsubscribeOnNotificationOpenedApp = onNotificationOpenedApp(messaging, (remoteMessage: RemoteMessage) => {
    routeFromNotification(remoteMessage.data, router);
  });

  getInitialNotification(messaging).then(remoteMessage => {
    if (remoteMessage) {
      routeFromNotification(remoteMessage.data, router);
    }
  });

  return () => {
    unsubscribeOnMessage();
    unsubscribeOnNotificationOpenedApp();
  };
};
